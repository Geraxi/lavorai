import { automaticApplicationsBlocked } from "@/lib/application-rollout";
import { applicationsPaused } from "@/lib/application-pause";
import { backfillMissingCvProfiles } from "@/lib/cv-profile-ensure";
import { recheckLivenessHeldApplications, releaseUnverifiableLivenessHolds } from "@/lib/held-application-release";
import { recoverStuckApplications } from "@/lib/application-claim";
import { recheckSkippedAtsHandoffs } from "@/lib/skip-list-handoff-recheck";

/**
 * Cron self-heal step — girato PRIMA di runAutoApplyCron.
 * Ripara silenziosamente lo stato del sistema:
 *   1. Crea i CVProfile mancanti/vuoti dal CV già caricato (backfill
 *      limitato e idempotente, cv-profile-ensure.ts), poi ricontrolla le
 *      candidature ferme per "disponibilità annuncio non verificabile".
 *   2. Recover expired queued leases (claim taken, never sent) even while
 *      historical retries stay blocked. In-flight or uncertain submissions
 *      are held for review, never replayed.
 *
 * Idempotente. Errori mai fatali: se un CV fallisce riparsing, passa
 * al prossimo. Se un enqueue fallisce, salta.
 */
export interface SelfHealReport {
  cvReparsed: number;
  cvFailed: number;
  cvSkipped: number;
  appsRequeued: number; // Legacy field; no blind requeue is performed.
  appsRecoveredSafely: number;
  appsFailed: number;
  livenessReleased: number;
  livenessClosed: number;
}

const MAX_CV_BACKFILL_PER_RUN = 25;
const CV_BACKFILL_BUDGET_MS = 90_000;

export async function runCronSelfHeal(): Promise<SelfHealReport> {
  const report: SelfHealReport = {
    cvReparsed: 0,
    cvFailed: 0,
    cvSkipped: 0,
    appsRequeued: 0,
    appsRecoveredSafely: 0,
    appsFailed: 0,
    livenessReleased: 0,
    livenessClosed: 0,
  };

  if (applicationsPaused() || automaticApplicationsBlocked()) return report;

  // ---------- 1. Create missing/empty CV profiles from the uploaded CV ----------
  // Bounded + idempotent (see cv-profile-ensure.ts); replaces the old
  // 5-per-run reparse that left most users without a profile for weeks.
  try {
    const cv = await backfillMissingCvProfiles({ max: MAX_CV_BACKFILL_PER_RUN, budgetMs: CV_BACKFILL_BUDGET_MS });
    report.cvReparsed = cv.created + cv.filled;
    report.cvFailed = cv.failed;
    report.cvSkipped = cv.noCv + cv.emptyExtraction + cv.skipped;
  } catch (err) {
    report.cvFailed++;
    const { logCvExtractionFailure } = await import("@/lib/cv-extraction-log");
    logCvExtractionFailure("cv-profile-backfill", err);
  }

  // ---------- 1b. Re-check rows held on a temporary job-availability failure ----------
  try {
    const releasedHeld = await releaseUnverifiableLivenessHolds({ limit: 80 });
    const live = await recheckLivenessHeldApplications({ limit: 50 });
    report.livenessReleased = releasedHeld + live.released;
    report.livenessClosed = live.closed;
  } catch (err) {
    console.error("[self-heal] liveness recheck failed", err instanceof Error ? err.message : err);
  }

  // ---------- 1c. One-time skip-list email recheck (pre-discovery handoffs) ----------
  try {
    if (typeof recheckSkippedAtsHandoffs === "function") {
      const recheck = await recheckSkippedAtsHandoffs({ limit: 20 });
      if (recheck.checked) console.log("[self-heal] skip-list email recheck", recheck);
    }
  } catch (err) {
    console.error("[self-heal] skip-list email recheck failed", err instanceof Error ? err.message : err);
  }

  // ---------- 2. Shared evidence-aware recovery ----------
  // Queued lease release runs even while historicalRetriesBlocked: those
  // rows never started sending. In-flight replay stays gated inside
  // recoverStuckApplications.
  try {
    report.appsRecoveredSafely = await recoverStuckApplications();
  } catch {
    report.appsFailed++;
    console.error("[self-heal] safe application recovery failed");
  }

  if (
    report.cvReparsed +
      report.cvFailed +
      report.appsRecoveredSafely +
      report.appsFailed >
    0
  ) {
    console.log("[self-heal] report", report);
  }

  return report;
}
