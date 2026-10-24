import { answerContinuationIneligibility, continuationSelect } from "./application-answer-continuation";
import { applicationRolloutConfig, historicalRetriesBlocked, rolloutApplicationIneligibility, rolloutCreationBlocked } from "@/lib/application-rollout";
import { applicationsPaused } from "@/lib/application-pause";
import { prisma } from "@/lib/db";
import { claimScanWindow, sortByPaidPriority, type PriorityUser } from "@/lib/paid-priority";
import { maxDrainAttempts } from "@/lib/drain-limits";
import { SKIPPED_ATS_MANUAL_MESSAGE } from "@/lib/ats-skip-hosts";
import { JOB_LIVENESS_UNKNOWN_HELD_MESSAGE } from "@/lib/job-liveness";
import {
  claimUserSelect, HELD_MESSAGE_PREFIX, isQueuedRowSendable, loadQuotaUsageMaps,
  MAX_ATTEMPTS_MESSAGE_PREFIX, usageFor,
} from "@/lib/queue-sendability";
import { expiredLeaseWhere, issueApplicationLease } from "@/lib/application-lease";
import { RecoveryReleaseBudget, controlledReleaseHoldData, controlledReleaseMessage } from "@/lib/application-recovery-release";
import { blocksUncertainAutoRetry, UNCERTAIN_SUBMISSION_MESSAGE } from "@/lib/uncertain-submission";

/**
 * Presa in carico atomica di una candidatura in coda, indipendente da Redis.
 *
 * Chi vuole elaborare una candidatura (worker Railway via BullMQ o via polling
 * del DB, fallback self-invoke su Vercel) chiama `claimApplication`: vince chi
 * aggiorna per primo la riga (`updateMany` con condizione sullo stato). Gli
 * altri ricevono false e non fanno nulla → mai due elaborazioni in parallelo.
 *
 * Una candidatura è "prendibile" se è `queued` e non è stata presa da nessuno
 * (`startedAt` null), creata dopo il cutoff storico e ammessa dalla policy
 * (consenso esplicito, oppure modalità auto dell'utente in modalità automatica).
 * Le prese vecchie restano ferme: nessun recupero/replay automatico.
 */

export const STALE_CLAIM_MS = 20 * 60_000;

/** Released lease on a queued row that never started sending. */
export function staleQueuedClaimReleaseMessage(): string {
  return `Riavviato: presa in carico scaduta dopo ${STALE_CLAIM_MS / 60_000} minuti. Nessun invio iniziato.`;
}

/** Exhausted expired leases: awaiting-action, no further automatic claim. */
export function staleQueuedClaimExhaustedMessage(attempts = maxDrainAttempts()): string {
  return `${MAX_ATTEMPTS_MESSAGE_PREFIX} ${attempts} tentativi: presa in carico scaduta senza invio. Nessun nuovo tentativo automatico. Completa dal portale o verifica l'esito prima di ritentare.`;
}

function isIntentionalQueuedHold(errorMessage: string | null | undefined): boolean {
  if (!errorMessage) return false;
  return errorMessage.startsWith(HELD_MESSAGE_PREFIX)
    || errorMessage === JOB_LIVENESS_UNKNOWN_HELD_MESSAGE
    || errorMessage === SKIPPED_ATS_MANUAL_MESSAGE
    || errorMessage.startsWith(MAX_ATTEMPTS_MESSAGE_PREFIX);
}

/** One fresh, unclaimed, explicitly confirmed application. Never steal a stale claim. */
export async function claimApplication(applicationId: string): Promise<boolean> {
  if (applicationsPaused() || rolloutCreationBlocked()) return false;
  const app = await prisma.application.findUnique({
    where: { id: applicationId },
    select: { ...continuationSelect },
  });
  if (!app || rolloutApplicationIneligibility(app)) return false;
  if (blocksUncertainAutoRetry(app)) return false;
  if (app.answerContinuationJson) {
    if (app.status !== "queued" || answerContinuationIneligibility(app, "queued")) return false;
    const lease = issueApplicationLease();
    const result = await prisma.application.updateMany({ where: {
      id: applicationId, status: "queued", startedAt: app.startedAt,
      answerContinuationJson: app.answerContinuationJson, consentGrantedAt: app.consentGrantedAt,
      submitConfirmation: { in: ["NOT_SUBMITTED", "NEEDS_ANSWERS"] }, completedAt: null, submittedAt: null, submittedVia: null,
      submissionReceiptJson: null, viewedAt: null, lastReplyAt: null, replyCount: 0, userStatus: null,
      submitStartedAt: null,
      OR: [{ leaseToken: null }, { leaseExpiresAt: { lte: lease.startedAt } }],
    }, data: { status: "answers_claimed", leaseToken: lease.leaseToken, leaseExpiresAt: lease.leaseExpiresAt } });
    return result.count === 1;
  }
  const lease = issueApplicationLease();
  const r = await prisma.application.updateMany({
    where: { id: applicationId, status: "queued", startedAt: null, leaseToken: null, completedAt: null,
      createdAt: app.createdAt, consentGrantedAt: app.consentGrantedAt, retryCount: app.retryCount,
      submittedAt: null, submittedVia: null, submitConfirmation: null,
      canaryLog: null, answersUsedJson: null, viewedAt: null, lastReplyAt: null, replyCount: 0, userStatus: null,
      submitStartedAt: null,
    },
    data: lease,
  });
  return r.count === 1;
}

/**
 * Recupera candidature bloccate. Due percorsi:
 * 1. `queued` + lease scaduto (`startedAt` vecchio, mai rilasciato): la presa
 *    viene rilasciata (bounded attempts) oppure va in attesa/azione esplicita.
 *    Non è un replay: l'invio non è mai iniziato. Consentito anche quando
 *    `historicalRetriesBlocked` ferma i retry storici.
 * 2. `optimizing` / `applying` / `submitting` scaduti: solo se i retry storici
 *    sono ammessi. Applying resta riservata se c'è prova di possibile invio.
 */
export async function recoverStuckApplications(): Promise<number> {
  if (applicationsPaused()) return 0;
  const budget = new RecoveryReleaseBudget();
  let recovered = await recoverExpiredQueuedClaims(undefined, budget);
  recovered += await releaseControlledRecoveryHolds(budget);
  if (!historicalRetriesBlocked()) recovered += await recoverStuckInFlight();
  return recovered;
}

const stuckEvidenceSelect = {
  id: true, status: true, startedAt: true, leaseToken: true, leaseExpiresAt: true,
  submitStartedAt: true, retryCount: true, errorMessage: true,
  createdAt: true, submittedAt: true, submittedVia: true, submitConfirmation: true,
  canaryLog: true, answersUsedJson: true, viewedAt: true, lastReplyAt: true,
  replyCount: true, userStatus: true, answerContinuationJson: true,
} as const;

/** Claimed `queued` rows whose worker died before reserve/process. */
export async function recoverExpiredQueuedClaims(now = new Date(), budget = new RecoveryReleaseBudget()): Promise<number> {
  if (applicationsPaused()) return 0;
  const config = applicationRolloutConfig(now);
  if (!config.enabled || !config.startedAt) return 0;
  const stuck = await prisma.application.findMany({
    where: {
      status: "queued",
      ...expiredLeaseWhere(now),
      createdAt: { gt: config.startedAt, lte: now },
      answerContinuationJson: null,
      submittedAt: null,
      submittedVia: null,
    },
    select: stuckEvidenceSelect,
    take: 50,
    orderBy: { startedAt: "asc" },
  });
  let recovered = 0;
  const maxAttempts = maxDrainAttempts();
  for (const app of stuck) {
    if (isIntentionalQueuedHold(app.errorMessage)) continue;
    const reclaimWhere = {
      id: app.id, status: "queued" as const, startedAt: app.startedAt, completedAt: null,
      ...expiredLeaseWhere(now),
    };
    if (blocksUncertainAutoRetry(app)) {
      const changed = await prisma.application.updateMany({
        where: reclaimWhere,
        data: {
          status: "ready_to_apply",
          submitConfirmation: "UNCONFIRMED",
          startedAt: null, leaseToken: null, leaseExpiresAt: null,
          errorMessage: app.submitStartedAt
            ? "Invio già avviato da un worker precedente. Esito da riconciliare, nessun nuovo tentativo automatico."
            : UNCERTAIN_SUBMISSION_MESSAGE,
        },
      });
      recovered += changed.count;
      continue;
    }
    const next = (app.retryCount ?? 0) + 1;
    const exhausted = next >= maxAttempts;
    const changed = await prisma.application.updateMany({
      where: {
        ...reclaimWhere,
        submittedAt: null, submittedVia: null, answerContinuationJson: null, submitStartedAt: null,
      },
      data: exhausted ? {
        status: "ready_to_apply",
        retryCount: next,
        startedAt: null, leaseToken: null, leaseExpiresAt: null,
        errorMessage: staleQueuedClaimExhaustedMessage(maxAttempts),
      } : budget.consume(app.id) ? {
        startedAt: null, leaseToken: null, leaseExpiresAt: null,
        retryCount: next,
        errorMessage: staleQueuedClaimReleaseMessage(),
      } : {
        retryCount: next,
        ...controlledReleaseHoldData(),
      },
    });
    recovered += changed.count;
  }
  return recovered;
}

export async function releaseControlledRecoveryHolds(
  budget = new RecoveryReleaseBudget(),
  now = new Date(),
): Promise<number> {
  const config = applicationRolloutConfig(now);
  if (applicationsPaused() || !config.enabled || !config.startedAt) return 0;
  const held = await prisma.application.findMany({
    where: {
      status: "queued",
      errorMessage: controlledReleaseMessage(),
      startedAt: { not: null },
      completedAt: null,
      submittedAt: null,
      submittedVia: null,
      submitStartedAt: null,
      createdAt: { gt: config.startedAt, lte: now },
    },
    select: { id: true },
    take: 50,
    orderBy: { createdAt: "asc" },
  });
  let released = 0;
  for (const row of held) {
    if (!budget.consume(row.id)) continue;
    const changed = await prisma.application.updateMany({
      where: {
        id: row.id, status: "queued", errorMessage: controlledReleaseMessage(),
        submittedAt: null, submitStartedAt: null,
      },
      data: { startedAt: null, leaseToken: null, leaseExpiresAt: null, errorMessage: null },
    });
    released += changed.count;
  }
  return released;
}

async function recoverStuckInFlight(): Promise<number> {
  const now = new Date();
  const stuck = await prisma.application.findMany({
    where: {
      status: { in: ["optimizing", "applying", "submitting"] },
      ...expiredLeaseWhere(now),
    },
    select: { id: true, status: true, startedAt: true, submitStartedAt: true, submittedAt: true,
      submittedVia: true, submitConfirmation: true, canaryLog: true, answersUsedJson: true,
      viewedAt: true, lastReplyAt: true, replyCount: true, userStatus: true },
    take: 50,
  });
  let recovered = 0;
  for (const app of stuck) {
    // A timed-out applying worker may already have delivered. Never replay it.
    // submit_started means the old worker may have crossed the send boundary.
    const ambiguous = ["applying", "submitting"].includes(app.status)
      || blocksUncertainAutoRetry(app);
    const changed = await prisma.application.updateMany({
      where: { id: app.id, status: app.status, startedAt: app.startedAt, completedAt: null, ...expiredLeaseWhere(now) },
      data: ambiguous ? {
        status: "ready_to_apply", submitConfirmation: "UNCONFIRMED",
        startedAt: null, leaseToken: null, leaseExpiresAt: null,
        errorMessage: app.submitStartedAt
          ? "Invio già avviato da un worker precedente. Esito da riconciliare, nessun nuovo tentativo automatico."
          : "Invio interrotto con esito non verificato. Verifica prima di ritentare per evitare un doppio invio.",
      } : {
        status: "queued", startedAt: null, leaseToken: null, leaseExpiresAt: null,
        errorMessage: `Riavviato: preparazione bloccata per più di ${STALE_CLAIM_MS / 60_000} minuti. Nessun invio iniziato.`,
      },
    });
    recovered += changed.count;
  }
  return recovered;
}

const prioritySelect = claimUserSelect;

/** Paid Pro/Pro+ and active trials first, then oldest first; dedup, capped at `limit`. */
export function orderClaimable(rows: { id: string; createdAt: Date; user?: PriorityUser | null }[], limit: number): string[] {
  const seen = new Set<string>();
  return sortByPaidPriority(rows, r => r.user, r => r.createdAt)
    .filter(r => !seen.has(r.id) && seen.add(r.id))
    .slice(0, limit).map(r => r.id);
}

/** Read-only polling. Historical rows, stale claims and automatic recovery stay frozen. */
export async function findClaimableQueued(limit: number): Promise<string[]> {
  if (applicationsPaused() || rolloutCreationBlocked()) return [];
  const config = applicationRolloutConfig();
  if (!config.enabled || !config.startedAt) return [];
  const now = new Date();
  const attemptCap = maxDrainAttempts();
  const rows = await prisma.application.findMany({
    where: { status: "queued", startedAt: null, leaseToken: null, submitStartedAt: null, completedAt: null, retryCount: { lt: attemptCap },
      createdAt: { gt: config.startedAt, lte: now },
      // Automatic mode also admits rows of auto-mode users (no per-application
      // consent); the worker gate re-checks the user's saved mode.
      ...(config.mode === "automatic"
        ? { OR: [{ consentGrantedAt: null }, { consentGrantedAt: { gt: config.startedAt, lte: now } }] }
        : { consentGrantedAt: { gt: config.startedAt, lte: now } }),
      submittedAt: null, submittedVia: null, submitConfirmation: null,
      canaryLog: null, answersUsedJson: null, viewedAt: null, lastReplyAt: null, replyCount: 0, userStatus: null,
    },
    orderBy: { createdAt: "asc" },
    take: claimScanWindow(limit),
    select: {
      id: true, userId: true, createdAt: true, consentGrantedAt: true, retryCount: true,
      job: { select: { url: true, recruiterEmail: true } },
      user: { select: prioritySelect },
    },
  });
  const continuations = await prisma.application.findMany({
    where: { status: "queued", answerContinuationJson: { not: null }, retryCount: { lt: attemptCap },
      createdAt: { gt: config.startedAt, lte: now }, consentGrantedAt: { gt: config.startedAt, lte: now },
      submitConfirmation: { in: ["NOT_SUBMITTED", "NEEDS_ANSWERS"] }, completedAt: null, submittedAt: null, submittedVia: null,
      submitStartedAt: null,
    }, select: {
      ...continuationSelect,
      job: { select: { url: true, recruiterEmail: true } },
      user: { select: prioritySelect },
    }, orderBy: { createdAt: "asc" }, take: claimScanWindow(limit),
  });
  const admitted = [
    ...rows.filter(row => !rolloutApplicationIneligibility(row, now)),
    ...continuations.filter(row => !answerContinuationIneligibility(row, "queued", undefined, now)),
  ];
  const freeIds = admitted.map(row => row.userId).filter((id): id is string => !!id);
  const usage = await loadQuotaUsageMaps(prisma, freeIds, admitted.map(row => row.id), now);
  return orderClaimable(admitted.filter(row => isQueuedRowSendable(row, usageFor(usage, row.userId), now)), limit);
}

/** Rimette una candidatura in stato prendibile (da chiamare all'enqueue). */
export async function resetClaim(applicationId: string): Promise<void> {
  // Queue publication must not clear ownership, including stale historical claims.
  if (applicationsPaused() || historicalRetriesBlocked()) return;
  await prisma.application
    .updateMany({ where: { id: applicationId, status: "queued" }, data: { startedAt: null } })
    .catch(() => void 0);
}
