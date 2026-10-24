import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db";
import { applicationsPaused } from "@/lib/application-pause";
import { applicationRolloutConfig, rolloutApplicationIneligibility, rolloutCreationBlocked } from "@/lib/application-rollout";
import { submissionSubjectKey } from "@/lib/application-submission-budget";
import { heldMessage, NOT_SUBMITTED } from "@/lib/application-worker-gates";
import {
  checkJobUrlLiveness, JOB_CLOSED_HELD_MESSAGE, JOB_LIVENESS_UNKNOWN_HELD_MESSAGE, markJobClosed,
  type JobLivenessResult,
} from "@/lib/job-liveness";

/**
 * Narrow, explicit release of queued rows that the worker HELD for a reason
 * that has since been cleared. Holding stamps `startedAt`, and the poller only
 * claims `startedAt: null`, so without this a held row is frozen forever.
 *
 * This is NOT a retry/replay path (historicalRetriesBlocked() stays true for
 * those). A row is released only when ALL of these hold:
 *   - status queued, never completed, retryCount 0, created after the rollout
 *     cutoff, and still admitted by rolloutApplicationIneligibility();
 *   - its errorMessage is exactly the hold text for the cleared reason;
 *   - zero signs of a prior submission: no submittedAt/submittedVia, no ATS
 *     receipt, no canary/answers evidence, no continuation, no views/replies/
 *     user status, submitConfirmation null (with no prepared documents) or the
 *     explicit NOT_SUBMITTED proof, NO email attempt row at all, NO submission
 *     ledger reservation (by application or by user+job), and no sibling row
 *     for the same user+job (dedup);
 *   - the user is not suspended and has privacy consent + a verified email.
 * Release only clears the hold (startedAt/errorMessage, and for NOT_SUBMITTED
 * rows the unsent prepared-document pointers so admission sees a pristine row).
 * It sends nothing: the worker's normal admission (reserveApplicationWork) and
 * pre-send fence (beginApplicationSubmission) still re-check consent,
 * verification, billing, preferences, round capacity, dedup ledger and the
 * global daily cap before anything can be transmitted.
 */

type DB = Pick<PrismaClient, "application" | "applicationSubmissionReservation" | "user" | "$transaction">;
type Tx = Prisma.TransactionClient;

export type ReleaseTrigger = "privacy_consent" | "email_verified" | "cv_profile_created";

/** Hold texts each trigger may clear. Anything else stays held. */
export function releasableHoldMessages(trigger: ReleaseTrigger): string[] {
  if (trigger === "cv_profile_created") return [heldMessage("profile_unverified")];
  return [heldMessage("privacy_consent_missing"), heldMessage("email_verification_missing"),
    heldMessage("consent_or_verification_missing")];
}

/** Prisma filter shared by every release path: no evidence of a past attempt. */
export function noPriorSubmissionWhere(now: Date, cutoff: Date): Prisma.ApplicationWhereInput {
  return {
    status: { in: ["queued", "needs_user"] }, startedAt: { not: null }, completedAt: null, retryCount: 0,
    createdAt: { gt: cutoff, lte: now },
    submittedAt: null, submittedVia: null, submissionReceiptJson: null,
    canaryLog: null, answersUsedJson: null, answerContinuationJson: null,
    viewedAt: null, lastReplyAt: null, replyCount: 0, userStatus: null,
    emailAttempts: { none: {} },
    OR: [{ submitConfirmation: null, cvDocxPath: null }, { submitConfirmation: NOT_SUBMITTED }],
  };
}

const releaseSelect = {
  id: true, userId: true, jobId: true, startedAt: true, errorMessage: true, createdAt: true,
  consentGrantedAt: true, retryCount: true, submitConfirmation: true, lastStatusCheckAt: true,
  user: { select: { suspendedAt: true, privacyConsentAt: true, emailVerified: true } },
  job: { select: { id: true, url: true, closedAt: true } },
} satisfies Prisma.ApplicationSelect;
type ReleaseRow = Prisma.ApplicationGetPayload<{ select: typeof releaseSelect }>;

function userReady(user: { suspendedAt: Date | null; privacyConsentAt: Date | null; emailVerified: Date | null }): boolean {
  return !user.suspendedAt && !!user.privacyConsentAt && !!user.emailVerified;
}

function sendingOpen(): Date | null {
  if (applicationsPaused() || rolloutCreationBlocked()) return null;
  return applicationRolloutConfig().startedAt;
}

/** Re-verify under the same per-user lock the worker admission takes, then CAS. */
async function releaseOne(row: ReleaseRow, now: Date, cutoff: Date, db: DB): Promise<boolean> {
  if (!row.startedAt || rolloutApplicationIneligibility(row, now)) return false;
  return db.$transaction(async (tx: Tx) => {
    await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtext(${row.userId}))`;
    const reserved = await tx.applicationSubmissionReservation.findFirst({ where: { OR: [
      { applicationId: row.id }, { subjectKey: submissionSubjectKey(row.userId, row.jobId) },
    ] }, select: { id: true } });
    if (reserved) return false;
    const siblings = await tx.application.count({ where: { userId: row.userId, jobId: row.jobId, id: { not: row.id } } });
    if (siblings) return false;
    const changed = await tx.application.updateMany({
      where: { ...noPriorSubmissionWhere(now, cutoff), id: row.id, startedAt: row.startedAt,
        errorMessage: row.errorMessage, submitConfirmation: row.submitConfirmation },
      data: {
        status: "queued", sendStatus: "not_sent", sendFailureReason: null,
        startedAt: null, errorMessage: null, submitConfirmation: null,
        // NOT_SUBMITTED proves these prepared files were never transmitted;
        // admission treats unexplained documents as a possible send, so the
        // row restarts preparation from scratch instead.
        ...(row.submitConfirmation === NOT_SUBMITTED ? { cvDocxPath: null, cvPdfPath: null, coverLetterPath: null } : {}),
      },
    });
    return changed.count === 1;
  });
}

/**
 * Called after privacy consent is granted, the email is verified, or a CV
 * profile is created. Releases only rows held for that now-cleared reason.
 * Never throws into the caller's request.
 */
export async function releaseHeldApplicationsForUser(
  userId: string, trigger: ReleaseTrigger, db: DB = prisma, now = new Date(),
): Promise<number> {
  try {
    const cutoff = sendingOpen();
    if (!cutoff) return 0;
    const user = await db.user.findUnique({ where: { id: userId },
      select: { suspendedAt: true, privacyConsentAt: true, emailVerified: true } });
    if (!user || !userReady(user)) return 0;
    const rows = await db.application.findMany({
      where: { ...noPriorSubmissionWhere(now, cutoff), userId, errorMessage: { in: releasableHoldMessages(trigger) } },
      select: releaseSelect, orderBy: { createdAt: "asc" }, take: 200,
    });
    let released = 0;
    for (const row of rows) if (await releaseOne(row, now, cutoff, db)) released++;
    if (released) console.log(`[held-release] ${trigger}: released ${released} held application(s) for user ${userId}`);
    return released;
  } catch (err) {
    console.error(`[held-release] ${trigger} failed`, err instanceof Error ? err.message : err);
    return 0;
  }
}

// ---------------- Temporary job-availability holds ----------------

/** First re-check no sooner than this after the hold. */
export const LIVENESS_RECHECK_BASE_MS = 2 * 60 * 60_000;
/** Re-checks stop this long after the first one (≈4 checks: +0h, +2h, +4h, +8h). */
export const LIVENESS_RECHECK_WINDOW_MS = 12 * 60 * 60_000;
export const LIVENESS_RECHECK_EXHAUSTED_MESSAGE = "Disponibilità dell'annuncio ancora non verificabile dopo più controlli: invio sospeso. Nessun invio effettuato.";

/**
 * Exponential backoff without a schema change. `lastStatusCheckAt` is unused
 * on unsent rows (the worker never writes it), so it records the FIRST
 * liveness re-check and survives the worker re-holding the row. `startedAt`
 * is the latest hold. Delay doubles: max(2h, last hold - first re-check), so
 * re-checks land at about +0h, +2h, +4h, +8h and stop after 12h.
 */
export function livenessRecheckDue(row: { startedAt: Date | null; lastStatusCheckAt: Date | null }, now: Date):
  "wait" | "check" | "exhausted" {
  if (!row.startedAt) return "wait";
  const sinceHold = +now - +row.startedAt;
  if (!row.lastStatusCheckAt) return sinceHold >= LIVENESS_RECHECK_BASE_MS ? "check" : "wait";
  if (+now - +row.lastStatusCheckAt > LIVENESS_RECHECK_WINDOW_MS) return "exhausted";
  // Doubling: wait as long as the re-checks had been running at the last hold.
  const delay = Math.max(LIVENESS_RECHECK_BASE_MS, +row.startedAt - +row.lastStatusCheckAt);
  return sinceHold >= delay ? "check" : "wait";
}

export type LivenessRecheckReport = { checked: number; released: number; closed: number; stillUnknown: number; exhausted: number };

/**
 * Re-check rows held on "job availability couldn't be checked". Closed jobs are
 * marked closed and the row fails as JOB_CLOSED (as the worker does); live jobs
 * are released through the same fenced path as above; unknown stays held with
 * backoff until the window ends, then stops for good.
 */
export async function recheckLivenessHeldApplications(opts: {
  db?: DB; now?: Date; limit?: number;
  check?: (url: string) => Promise<Pick<JobLivenessResult, "state">>;
  markClosed?: (jobId: string) => Promise<void>;
} = {}): Promise<LivenessRecheckReport> {
  const report: LivenessRecheckReport = { checked: 0, released: 0, closed: 0, stillUnknown: 0, exhausted: 0 };
  const db = opts.db ?? prisma;
  const now = opts.now ?? new Date();
  const check = opts.check ?? checkJobUrlLiveness;
  const markClosed = opts.markClosed ?? markJobClosed;
  const cutoff = sendingOpen();
  if (!cutoff) return report;
  const rows = await db.application.findMany({
    where: { ...noPriorSubmissionWhere(now, cutoff), submitConfirmation: NOT_SUBMITTED,
      errorMessage: JOB_LIVENESS_UNKNOWN_HELD_MESSAGE, startedAt: { lte: new Date(+now - LIVENESS_RECHECK_BASE_MS) } },
    select: releaseSelect, orderBy: { startedAt: "asc" }, take: Math.max(1, Math.min(opts.limit ?? 25, 100)),
  });
  const verdicts = new Map<string, Promise<Pick<JobLivenessResult, "state">>>();
  for (const row of rows) {
    try {
      const due = livenessRecheckDue(row, now);
      if (due === "wait") continue;
      const fence = { ...noPriorSubmissionWhere(now, cutoff), id: row.id, startedAt: row.startedAt,
        errorMessage: JOB_LIVENESS_UNKNOWN_HELD_MESSAGE, submitConfirmation: NOT_SUBMITTED };
      if (due === "exhausted") {
        report.exhausted += (await db.application.updateMany({ where: fence,
          data: { errorMessage: LIVENESS_RECHECK_EXHAUSTED_MESSAGE } })).count;
        continue;
      }
      // Users who could not be sent to anyway are skipped (no network, no attempt spent).
      if (!userReady(row.user) || rolloutApplicationIneligibility(row, now)) continue;
      const verdict = row.job.closedAt ? { state: "closed" as const }
        : await (verdicts.get(row.job.id) ?? (verdicts.set(row.job.id, check(row.job.url)), verdicts.get(row.job.id)!));
      report.checked++;
      if (verdict.state === "closed") {
        if (!row.job.closedAt) await markClosed(row.job.id);
        report.closed += (await db.application.updateMany({ where: fence, data: {
          status: "failed", submitConfirmation: "JOB_CLOSED", completedAt: now, errorMessage: JOB_CLOSED_HELD_MESSAGE,
          lastStatusCheckAt: row.lastStatusCheckAt ?? now,
        } })).count;
      } else {
        // live OR unknown: unknown proceeds (not held). Re-release through
        // the same fenced path as consent holds.
        if (!row.lastStatusCheckAt) await db.application.updateMany({ where: fence, data: { lastStatusCheckAt: now } });
        if (await releaseOne({ ...row, lastStatusCheckAt: row.lastStatusCheckAt ?? now }, now, cutoff, db)) report.released++;
      }
    } catch (err) {
      console.error("[held-release] liveness recheck failed", err instanceof Error ? err.message : err);
    }
  }
  if (report.checked + report.exhausted) console.log("[held-release] liveness recheck", report);
  return report;
}

/**
 * One-shot release of rows parked as "availability unverifiable".
 * Unknown now proceeds; these holds must re-enter normal admission.
 */
export async function releaseUnverifiableLivenessHolds(opts: {
  db?: DB; now?: Date; limit?: number;
} = {}): Promise<number> {
  const db = opts.db ?? prisma;
  const now = opts.now ?? new Date();
  const cutoff = sendingOpen();
  if (!cutoff) return 0;
  const messages = [JOB_LIVENESS_UNKNOWN_HELD_MESSAGE, LIVENESS_RECHECK_EXHAUSTED_MESSAGE];
  const rows = await db.application.findMany({
    where: { ...noPriorSubmissionWhere(now, cutoff), errorMessage: { in: messages } },
    select: releaseSelect, orderBy: { createdAt: "asc" }, take: Math.max(1, Math.min(opts.limit ?? 80, 200)),
  });
  let released = 0;
  for (const row of rows) {
    try {
      if (await releaseOne(row, now, cutoff, db)) released++;
    } catch (err) {
      console.error("[held-release] unverifiable release failed", err instanceof Error ? err.message : err);
    }
  }
  if (released) console.log(`[held-release] unverifiable: released ${released} held application(s)`);
  return released;
}
