import { applicationRolloutConfig, rolloutCreationBlocked } from "@/lib/application-rollout";
import { applicationsPaused } from "@/lib/application-pause";
import { prisma } from "@/lib/db";
import { heldMessage } from "@/lib/application-worker-gates";
import { SKIPPED_ATS_MANUAL_MESSAGE, skipListManualHandoffData } from "@/lib/ats-skip-hosts";
import { RecoveryReleaseBudget, controlledReleaseHoldData } from "@/lib/application-recovery-release";
import { canClaimAnotherDrainRow, drainProcessConcurrency, drainQueueBatch, maxDrainAttempts } from "@/lib/drain-limits";
import { JOB_LIVENESS_UNKNOWN_HELD_MESSAGE } from "@/lib/job-liveness";
import { releaseUnverifiableLivenessHolds } from "@/lib/held-application-release";
import {
  CLAIM_HOLD_REASONS,
  claimBlockReason,
  claimUserSelect,
  HELD_MESSAGE_PREFIX,
  isQueuedRowSendable,
  loadQuotaUsageMaps,
  MAX_ATTEMPTS_MESSAGE_PREFIX,
  skipListBlocksAutoSend,
  usageFor,
  type ClaimHoldReason,
} from "@/lib/queue-sendability";
import { usesFreeWeeklyQuota } from "@/lib/billing";
import { deployedAppVersion } from "@/lib/deployed-version";
import type { PrismaClient } from "@prisma/client";

type DB = Pick<PrismaClient, "application">;

export type DrainOutcome = "sent" | "blocked" | "skipped" | "failed" | "queued" | "needsAnswers" | "handoff" | "held";

export type DrainSummary = {
  claimed: number;
  attempted: number;
  accepted: number;
  sent: number;
  emailSent: number;
  portalSent: number;
  blockedByReason: Record<string, number>;
  skipped: number;
  failed: number;
  parked: number;
  needsAnswers: number;
  handoff: number;
  held: number;
  awaitingAction: number;
  deployedVersion: string;
};

export function emptyDrainSummary(): DrainSummary {
  return {
    claimed: 0, attempted: 0, accepted: 0, sent: 0, emailSent: 0, portalSent: 0,
    blockedByReason: {}, skipped: 0, failed: 0, parked: 0, needsAnswers: 0,
    handoff: 0, held: 0, awaitingAction: 0, deployedVersion: deployedAppVersion(),
  };
}

export function finalizeDrainSummary(summary: DrainSummary): DrainSummary {
  summary.attempted = summary.claimed;
  summary.accepted = summary.sent;
  summary.awaitingAction = summary.needsAnswers + summary.handoff + summary.held;
  summary.deployedVersion = deployedAppVersion();
  return summary;
}

export function bumpReason(map: Record<string, number>, reason: string, n = 1): void {
  map[reason] = (map[reason] ?? 0) + n;
}

export function blockedReasonFromMessage(message: string | null | undefined): string | null {
  if (!message?.startsWith(HELD_MESSAGE_PREFIX)) return null;
  for (const reason of CLAIM_HOLD_REASONS) {
    if (message === heldMessage(reason)) return reason;
  }
  return "held";
}

export function classifyDrainOutcome(row: {
  status: string;
  errorMessage: string | null;
  submitConfirmation: string | null;
}): DrainOutcome {
  if (row.status === "success") return "sent";
  if (row.status === "needs_user") return "blocked";
  if (row.status === "needs_answers" || row.submitConfirmation === "NEEDS_ANSWERS") return "needsAnswers";
  if (row.errorMessage === JOB_LIVENESS_UNKNOWN_HELD_MESSAGE) return "held";
  if (row.errorMessage === SKIPPED_ATS_MANUAL_MESSAGE || row.submitConfirmation === "CAPTCHA" || row.status === "ready_to_apply") {
    return "handoff";
  }
  if (blockedReasonFromMessage(row.errorMessage)) return "blocked";
  if (row.errorMessage?.startsWith(MAX_ATTEMPTS_MESSAGE_PREFIX)) return "failed";
  if (row.status === "failed") return "failed";
  if (row.status === "queued") return "queued";
  return "failed";
}

const parkSelect = {
  id: true, userId: true, createdAt: true, consentGrantedAt: true, retryCount: true,
  job: { select: { url: true, recruiterEmail: true } },
  user: { select: claimUserSelect },
} as const;

/**
 * Move unsendable queued rows out of the claimable set before the drain
 * picks work. Consent/quota holds stay `queued` with startedAt + heldMessage
 * so held-application-release can reopen them. Exhausted attempts leave
 * the queue entirely. Skip-list hosts stay queued so recruiter-email can run.
 */
export async function parkUnsendableQueued(opts: {
  db?: DB;
  now?: Date;
  limit?: number;
} = {}): Promise<Pick<DrainSummary, "parked" | "blockedByReason" | "skipped" | "handoff">> {
  const result = { parked: 0, blockedByReason: {} as Record<string, number>, skipped: 0, handoff: 0 };
  if (applicationsPaused() || rolloutCreationBlocked()) return result;
  const now = opts.now ?? new Date();
  const config = applicationRolloutConfig(now);
  if (!config.enabled || !config.startedAt) return result;
  const db = opts.db ?? prisma;
  const take = Math.min(200, Math.max(20, opts.limit ?? 120));
  const rows = await db.application.findMany({
    where: {
      status: "queued", startedAt: null, completedAt: null,
      retryCount: { lt: maxDrainAttempts() },
      createdAt: { gt: config.startedAt, lte: now },
      submittedAt: null, submittedVia: null, submitConfirmation: null,
      canaryLog: null, answersUsedJson: null, viewedAt: null, lastReplyAt: null, replyCount: 0, userStatus: null,
    },
    orderBy: { createdAt: "asc" },
    take,
    select: parkSelect,
  });
  const maps = await loadQuotaUsageMaps(db, rows.map((r) => r.userId), rows.map((r) => r.id), now);
  const parkedWeekly = new Map<string, number>();
  const parkedDaily = new Map<string, number>();

  for (const row of rows) {
    const usage = usageFor(maps, row.userId);
    usage.weekly += parkedWeekly.get(row.userId) ?? 0;
    usage.daily += parkedDaily.get(row.userId) ?? 0;
    if (skipListBlocksAutoSend(row.job)) {
      const handed = await db.application.updateMany({
        where: { id: row.id, status: "queued", startedAt: null, submittedAt: null },
        data: skipListManualHandoffData(now),
      });
      if (handed.count === 1) {
        result.parked++;
        result.handoff++;
      }
      continue;
    }
    const reason = claimBlockReason(row, usage, now);
    if (!reason) continue;
    if (reason === "max_attempts") {
      const changed = await db.application.updateMany({
        where: { id: row.id, status: "queued", startedAt: null },
        data: {
          status: "ready_to_apply", startedAt: now, retryCount: maxDrainAttempts(),
          errorMessage: `${MAX_ATTEMPTS_MESSAGE_PREFIX} ${maxDrainAttempts()} tentativi. Nessun nuovo tentativo automatico.`,
        },
      });
      if (changed.count === 1) {
        result.parked++;
        bumpReason(result.blockedByReason, "max_attempts");
      }
      continue;
    }
    const privacyHold = reason === "privacy_consent_missing";
    const changed = await db.application.updateMany({
      where: { id: row.id, status: "queued", startedAt: null },
      data: {
        startedAt: now, errorMessage: heldMessage(reason),
        ...(privacyHold ? {
          status: "needs_user",
          sendStatus: "needs_user",
          sendFailureReason: "privacy_consent_missing",
        } : {}),
      },
    });
    if (changed.count !== 1) continue;
    result.parked++;
    bumpReason(result.blockedByReason, reason);
    if (reason === "free_weekly_quota_reached") {
      parkedWeekly.set(row.userId, (parkedWeekly.get(row.userId) ?? 0) + 1);
    }
    if (reason === "daily_quota_reached") {
      parkedDaily.set(row.userId, (parkedDaily.get(row.userId) ?? 0) + 1);
    }
  }
  return result;
}

export async function incrementDrainAttempt(
  id: string,
  reason: string,
  opts: { db?: DB; now?: Date } = {},
): Promise<"retry" | "exhausted"> {
  const db = opts.db ?? prisma;
  const now = opts.now ?? new Date();
  const row = await db.application.findUnique({
    where: { id },
    select: { retryCount: true, status: true, startedAt: true, errorMessage: true },
  });
  if (!row || row.status !== "queued") return "retry";
  const next = row.retryCount + 1;
  const max = maxDrainAttempts();
  if (next >= max) {
    await db.application.updateMany({
      where: { id, status: "queued", startedAt: row.startedAt, errorMessage: row.errorMessage },
      data: {
        status: "ready_to_apply",
        retryCount: next,
        startedAt: now,
        errorMessage: `${MAX_ATTEMPTS_MESSAGE_PREFIX} ${max} tentativi: ${reason}. Nessun nuovo tentativo automatico.`,
      },
    });
    return "exhausted";
  }
  await db.application.updateMany({
    where: { id, status: "queued", startedAt: row.startedAt, errorMessage: row.errorMessage },
    data: { retryCount: next, startedAt: now, errorMessage: `Tentativo ${next}/${max}: ${reason}` },
  });
  return "retry";
}

/**
 * Re-open quota holds once the rolling window has room again.
 * Same no-prior-submission fence as held-application-release (retryCount 0).
 */
export async function releaseQuotaHoldsIfAvailable(opts: {
  db?: DB;
  now?: Date;
  limit?: number;
} = {}): Promise<number> {
  if (applicationsPaused() || rolloutCreationBlocked()) return 0;
  const now = opts.now ?? new Date();
  const config = applicationRolloutConfig(now);
  if (!config.enabled || !config.startedAt) return 0;
  const db = opts.db ?? prisma;
  const messages = [heldMessage("free_weekly_quota_reached"), heldMessage("daily_quota_reached")];
  const rows = await db.application.findMany({
    where: {
      status: "queued", startedAt: { not: null }, completedAt: null, retryCount: 0,
      createdAt: { gt: config.startedAt, lte: now },
      errorMessage: { in: messages },
      submittedAt: null, submittedVia: null, submitConfirmation: null,
      canaryLog: null, answersUsedJson: null, viewedAt: null, lastReplyAt: null, replyCount: 0, userStatus: null,
    },
    select: parkSelect,
    take: Math.min(100, Math.max(1, opts.limit ?? 50)),
    orderBy: { createdAt: "asc" },
  });
  const maps = await loadQuotaUsageMaps(db, rows.map((r) => r.userId), rows.map((r) => r.id), now);
  const budget = new RecoveryReleaseBudget();
  let released = 0;
  for (const row of rows) {
    if (!isQueuedRowSendable(row, usageFor(maps, row.userId), now)) continue;
    if (!budget.consume(row.id)) {
      await db.application.updateMany({
        where: {
          id: row.id, status: "queued", startedAt: { not: null }, retryCount: 0,
          errorMessage: { in: messages },
        },
        data: controlledReleaseHoldData(now),
      });
      continue;
    }
    const changed = await db.application.updateMany({
      where: {
        id: row.id, status: "queued", startedAt: { not: null }, retryCount: 0,
        errorMessage: { in: messages },
      },
      data: { startedAt: null, errorMessage: null },
    });
    if (changed.count === 1) {
      released++;
      if (usesFreeWeeklyQuota(row.user, now)) {
        maps.weekly.set(row.userId, (maps.weekly.get(row.userId) ?? 0) + 1);
      }
    }
  }
  return released;
}

/**
 * Claim + process a drain batch. Atomic claim (startedAt null → set) is the
 * SKIP LOCKED equivalent: overlapping crons never double-send.
 */
export async function drainQueuedApplications(opts: {
  now?: Date;
  startedMs?: number;
  maxDurationMs?: number;
  findClaimableQueued?: (limit: number) => Promise<string[]>;
  claimApplication?: (id: string) => Promise<boolean>;
  processApplication?: (id: string) => Promise<void>;
  readOutcome?: (id: string) => Promise<{ status: string; errorMessage: string | null; submitConfirmation: string | null; submittedVia?: string | null } | null>;
  db?: DB;
} = {}): Promise<DrainSummary> {
  const summary = emptyDrainSummary();
  if (applicationsPaused() || rolloutCreationBlocked()) return summary;
  const now = opts.now ?? new Date();
  const startedMs = opts.startedMs ?? Date.now();
  const maxDurationMs = opts.maxDurationMs ?? 300_000;
  const remaining = () => maxDurationMs - (Date.now() - startedMs);

  const parked = await parkUnsendableQueued({ db: opts.db, now });
  summary.parked = parked.parked;
  summary.skipped += parked.skipped;
  summary.handoff += parked.handoff;
  for (const [reason, n] of Object.entries(parked.blockedByReason)) bumpReason(summary.blockedByReason, reason + "", n);
  await releaseQuotaHoldsIfAvailable({ db: opts.db, now });
  if (!opts.db) await releaseUnverifiableLivenessHolds({ now });

  const claims = await import("@/lib/application-claim");
  // Release expired queued leases before claim so a dead worker cannot
  // pin a row forever. In-flight recovery stays gated inside the helper.
  if (typeof claims.recoverStuckApplications === "function") {
    try {
      await claims.recoverStuckApplications();
    } catch (err) {
      console.error("[drain] queued-claim recovery failed", err);
    }
  }
  const find = opts.findClaimableQueued ?? claims.findClaimableQueued;
  const claim = opts.claimApplication ?? claims.claimApplication;
  const process = opts.processApplication ?? (await import("@/lib/application-worker")).processApplication;
  const read = opts.readOutcome ?? (async (id: string) => {
    const row = await (opts.db ?? prisma).application.findUnique({
      where: { id },
      select: { status: true, errorMessage: true, submitConfirmation: true, submittedVia: true },
    });
    return row;
  });

  const batch = drainQueueBatch();
  const concurrency = drainProcessConcurrency();
  const ids = await find(batch);
  const queue = [...ids];

  const runOne = async (id: string) => {
    if (!canClaimAnotherDrainRow(remaining())) return;
    if (!(await claim(id))) return;
    summary.claimed++;
    try {
      await process(id);
    } catch (err) {
      summary.failed++;
      console.error(`[cron/drain-queue] ${id} failed:`, err instanceof Error ? err.message : err);
      const afterFail = await read(id);
      if (afterFail?.status === "queued" && !blockedReasonFromMessage(afterFail.errorMessage)) {
        await incrementDrainAttempt(id, err instanceof Error ? err.message : "process_error", { db: opts.db, now });
      }
      return;
    }
    const after = await read(id);
    if (!after) return;
    const kind = classifyDrainOutcome(after);
    if (kind === "sent") {
      summary.sent++;
      if (after.submittedVia === "email_recruiter") summary.emailSent++;
      else if (typeof after.submittedVia === "string" && after.submittedVia.startsWith("portal_")) summary.portalSent++;
    }
    else if (kind === "skipped") summary.skipped++;
    else if (kind === "needsAnswers") summary.needsAnswers++;
    else if (kind === "handoff") summary.handoff++;
    else if (kind === "held") summary.held++;
    else if (kind === "blocked") bumpReason(summary.blockedByReason, blockedReasonFromMessage(after.errorMessage) ?? "held");
    else if (kind === "failed") summary.failed++;
    else if (kind === "queued" && !blockedReasonFromMessage(after.errorMessage)) {
      const outcome = await incrementDrainAttempt(id, after.errorMessage || "bounced_queued", { db: opts.db, now });
      if (outcome === "exhausted") bumpReason(summary.blockedByReason, "max_attempts");
    } else if (kind === "queued") {
      bumpReason(summary.blockedByReason, blockedReasonFromMessage(after.errorMessage) ?? "held");
    }
  };

  const workers = Array.from({ length: Math.min(concurrency, queue.length || 1) }, async () => {
    while (queue.length && canClaimAnotherDrainRow(remaining())) {
      const id = queue.shift();
      if (!id) break;
      await runOne(id);
    }
  });
  await Promise.all(workers);
  return finalizeDrainSummary(summary);
}

export type { ClaimHoldReason };
