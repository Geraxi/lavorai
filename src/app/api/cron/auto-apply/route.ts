import { applicationsPaused } from "@/lib/application-pause";
import { NextResponse, type NextRequest } from "next/server";
import { runAutoApplyCron } from "@/lib/auto-apply-cron";
import { retryPendingReplyForwards } from "@/lib/application-reply-processing";
import { reconcileAcceptedApplicationEmails } from "@/lib/application-email-reconciliation";
import { deployedAppVersion } from "@/lib/deployed-version";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Vercel Cron — invocato ogni 2 ore.
 * Scova e accoda candidature per gli utenti in modalità autoApplyMode="auto".
 *
 * Auth: Vercel manda "Authorization: Bearer <CRON_SECRET>" se settato;
 * accetta anche X-Admin-Key per run manuali.
 */
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const adminKey = process.env.ADMIN_SYNC_KEY;
  const auth = request.headers.get("authorization");
  const xAdmin = request.headers.get("x-admin-key");
  const authorized =
    (cronSecret && auth === `Bearer ${cronSecret}`) ||
    (adminKey && xAdmin === adminKey);

  if (!authorized) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (applicationsPaused()) return NextResponse.json({ ok: true, paused: true, reason: "applications_paused", deployedVersion: deployedAppVersion() });
  // Cron UTC 8,9,12,13,16,17: esegue solo quando a Roma sono le 10, 14 o 18
  // (copre CET e CEST). Run manuali con X-Admin-Key bypassano il guard.
  const romeHour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Rome", hour: "2-digit", hour12: false }).format(new Date()));
  if (!xAdmin && ![10, 14, 18].includes(romeHour)) {
    return NextResponse.json({ ok: true, skipped: true, reason: "outside_rome_send_window", romeHour });
  }
  const t0 = Date.now();
  try {
    // Existing authenticated schedule also drains the durable user-reply outbox.
    const emailReconciliation = await reconcileAcceptedApplicationEmails(20);
    const replyForwards = await retryPendingReplyForwards(20);
    // Utenti con CV ma senza CVProfile: backfill con budget breve (function 300s).
    const { backfillMissingCvProfiles } = await import("@/lib/cv-profile-ensure");
    await backfillMissingCvProfiles({ max: 20, budgetMs: 60_000 })
      .catch(async (err) => {
        const { logCvExtractionFailure } = await import("@/lib/cv-extraction-log");
        logCvExtractionFailure("cv-profile-backfill", err);
      });
    const stats = await runAutoApplyCron();
    const remaining = 280_000 - (Date.now() - t0);
    let drain = null;
    if (remaining > 20_000) {
      const { drainQueuedApplications } = await import("@/lib/queue-drain");
      drain = await drainQueuedApplications({ startedMs: t0, maxDurationMs: 280_000 });
      stats.attempted = drain.attempted;
      stats.accepted = drain.accepted;
      stats.failed = drain.failed + stats.errors;
      stats.blockedByReason = { ...stats.blockedByReason, ...drain.blockedByReason };
      stats.awaitingAction = drain.awaitingAction + stats.applicationsHandedOff + stats.applicationsAwaitingConsent;
      stats.deployedVersion = drain.deployedVersion;
    }
    const ms = Date.now() - t0;
    console.log(`[cron/auto-apply] ${ms}ms version=${stats.deployedVersion}`, stats);
    return NextResponse.json({ ok: true, ms, ...stats, drain, replyForwards, emailReconciliation, deployedVersion: stats.deployedVersion ?? deployedAppVersion() });
  } catch (err) {
    console.error("[cron/auto-apply]", err);
    return NextResponse.json(
      { error: "internal", message: err instanceof Error ? err.message : "Errore" },
      { status: 500 },
    );
  }
}
