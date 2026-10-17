import { answerContinuationIneligibility, continuationSelect } from "./application-answer-continuation";
import { applicationRolloutConfig, historicalRetriesBlocked, rolloutApplicationIneligibility, rolloutCreationBlocked } from "@/lib/application-rollout";
import { applicationsPaused } from "@/lib/application-pause";
import { prisma } from "@/lib/db";
import { hasPotentialSubmission } from "@/lib/application-worker-gates";

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

/** One fresh, unclaimed, explicitly confirmed application. Never steal a stale claim. */
export async function claimApplication(applicationId: string): Promise<boolean> {
  if (applicationsPaused() || rolloutCreationBlocked()) return false;
  const app = await prisma.application.findUnique({
    where: { id: applicationId },
    select: { ...continuationSelect },
  });
  if (!app || rolloutApplicationIneligibility(app)) return false;
  if (app.answerContinuationJson) {
    if (app.status !== "queued" || answerContinuationIneligibility(app, "queued")) return false;
    const result = await prisma.application.updateMany({ where: {
      id: applicationId, status: "queued", startedAt: app.startedAt,
      answerContinuationJson: app.answerContinuationJson, consentGrantedAt: app.consentGrantedAt,
      submitConfirmation: "NOT_SUBMITTED", completedAt: null, submittedAt: null, submittedVia: null,
      submissionReceiptJson: null, viewedAt: null, lastReplyAt: null, replyCount: 0, userStatus: null,
    }, data: { status: "answers_claimed" } });
    return result.count === 1;
  }
  const r = await prisma.application.updateMany({
    where: { id: applicationId, status: "queued", startedAt: null, completedAt: null,
      createdAt: app.createdAt, consentGrantedAt: app.consentGrantedAt, retryCount: 0,
      submittedAt: null, submittedVia: null, submitConfirmation: null,
      canaryLog: null, answersUsedJson: null, viewedAt: null, lastReplyAt: null, replyCount: 0, userStatus: null,
    },
    data: { startedAt: new Date() },
  });
  return r.count === 1;
}

/**
 * Recupera candidature bloccate in `optimizing` o `applying` da troppo tempo.
 * Un worker crash, timeout AI, o Playwright hang lasciano la candidatura in
 * uno stato intermedio senza completedAt. Solo optimizing senza prove di invio
 * torna queued; applying resta riservata per verifica, senza replay automatico.
 */
export async function recoverStuckApplications(): Promise<number> {
  if (applicationsPaused() || historicalRetriesBlocked()) return 0;
  const stale = new Date(Date.now() - STALE_CLAIM_MS);
  const stuck = await prisma.application.findMany({
    where: {
      status: { in: ["optimizing", "applying", "submitting"] },
      OR: [{ startedAt: { lt: stale } }, { startedAt: null, createdAt: { lt: stale } }],
      completedAt: null,
    },
    select: { id: true, status: true, startedAt: true, submittedAt: true,
      submittedVia: true, submitConfirmation: true, canaryLog: true, answersUsedJson: true,
      viewedAt: true, lastReplyAt: true, replyCount: true, userStatus: true },
    take: 50,
  });
  let recovered = 0;
  for (const app of stuck) {
    // A timed-out applying worker may already have delivered. Never replay it.
    // Even pre-marker legacy applying rows require manual outcome verification.
    const ambiguous = ["applying", "submitting"].includes(app.status) || hasPotentialSubmission(app);
    const changed = await prisma.application.updateMany({
      where: { id: app.id, status: app.status, startedAt: app.startedAt, completedAt: null },
      data: ambiguous ? {
        status: "ready_to_apply", submitConfirmation: "UNCONFIRMED",
        errorMessage: "Invio interrotto con esito non verificato. Verifica prima di ritentare per evitare un doppio invio.",
      } : {
        status: "queued", startedAt: null,
        errorMessage: `Riavviato: preparazione bloccata per più di ${STALE_CLAIM_MS / 60_000} minuti. Nessun invio iniziato.`,
      },
    });
    recovered += changed.count;
  }
  return recovered;
}

/** Read-only polling. Historical rows, stale claims and automatic recovery stay frozen. */
export async function findClaimableQueued(limit: number): Promise<string[]> {
  if (applicationsPaused() || rolloutCreationBlocked()) return [];
  const config = applicationRolloutConfig();
  if (!config.enabled || !config.startedAt) return [];
  const now = new Date();
  const rows = await prisma.application.findMany({
    where: { status: "queued", startedAt: null, completedAt: null, retryCount: 0,
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
    take: limit,
    select: { id: true, createdAt: true, consentGrantedAt: true, retryCount: true },
  });
  const continuations = await prisma.application.findMany({
    where: { status: "queued", answerContinuationJson: { not: null }, retryCount: 0,
      createdAt: { gt: config.startedAt, lte: now }, consentGrantedAt: { gt: config.startedAt, lte: now },
      submitConfirmation: "NOT_SUBMITTED", completedAt: null, submittedAt: null, submittedVia: null,
    }, select: continuationSelect, orderBy: { createdAt: "asc" }, take: limit,
  });
  return [...rows.filter(row => !rolloutApplicationIneligibility(row, now)).map(row => row.id),
    ...continuations.filter(row => !answerContinuationIneligibility(row, "queued", undefined, now)).map(row => row.id)].slice(0, limit);
}

/** Rimette una candidatura in stato prendibile (da chiamare all'enqueue). */
export async function resetClaim(applicationId: string): Promise<void> {
  // Queue publication must not clear ownership, including stale historical claims.
  if (applicationsPaused() || historicalRetriesBlocked()) return;
  await prisma.application
    .updateMany({ where: { id: applicationId, status: "queued" }, data: { startedAt: null } })
    .catch(() => void 0);
}
