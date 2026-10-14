import { applicationsPaused } from "@/lib/application-pause";
import { NextResponse, type NextRequest } from "next/server";
import { runAutoApplyCron } from "@/lib/auto-apply-cron";
import { retryPendingReplyForwards } from "@/lib/application-reply-processing";
import { reconcileAcceptedApplicationEmails } from "@/lib/application-email-reconciliation";

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
  if (applicationsPaused()) return NextResponse.json({ ok: true, paused: true, reason: "applications_paused" });
  const t0 = Date.now();
  try {
    // Existing authenticated schedule also drains the durable user-reply outbox.
    const emailReconciliation = await reconcileAcceptedApplicationEmails(20);
    const replyForwards = await retryPendingReplyForwards(20);
    const stats = await runAutoApplyCron();
    const ms = Date.now() - t0;
    console.log(`[cron/auto-apply] ${ms}ms`, stats);
    return NextResponse.json({ ok: true, ms, ...stats, replyForwards, emailReconciliation });
  } catch (err) {
    console.error("[cron/auto-apply]", err);
    return NextResponse.json(
      { error: "internal", message: err instanceof Error ? err.message : "Errore" },
      { status: 500 },
    );
  }
}
