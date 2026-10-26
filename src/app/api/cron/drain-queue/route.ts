import { NextResponse, type NextRequest } from "next/server";
import { applicationsPaused } from "@/lib/application-pause";
import { deployedAppVersion } from "@/lib/deployed-version";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Vercel Cron (ogni 5 min) + backup GitHub Actions (ogni 15 min).
 * Parks unsendable queued rows (quota, consent, skip-list, exhausted
 * attempts), then atomically claims a configurable batch of sendable
 * rows and processes them within the function budget.
 */
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  // A separate exact-cohort drain runs while every ordinary producer remains held.
  const {customerRolloutConfig}=await import('@/lib/customer-rollout');
  if(customerRolloutConfig()){
    const {drainCustomerRollout}=await import('@/lib/customer-rollout-drain');
    const {processApplication}=await import('@/lib/application-worker');
    try{return NextResponse.json({ok:true,customerRollout:await drainCustomerRollout(id=>processApplication(id)),deployedVersion:deployedAppVersion()});}
    catch{return NextResponse.json({error:'customer_rollout_failed_closed'},{status:500});}
  }
  if (applicationsPaused()) return NextResponse.json({ ok: true, paused: true, reason: "applications_paused", deployedVersion: deployedAppVersion() });

  const t0 = Date.now();
  const result: {
    claimed: number; attempted: number; accepted: number; sent: number; emailSent: number; portalSent: number;
    completed: number; failed: number; skipped: number;
    parked: number; needsAnswers: number; handoff: number; held: number; awaitingAction: number;
    blockedByReason: Record<string, number>; liveness: boolean | string; deployedVersion: string;
  } = {
    claimed: 0, attempted: 0, accepted: 0, sent: 0, emailSent: 0, portalSent: 0, completed: 0, failed: 0, skipped: 0, parked: 0,
    needsAnswers: 0, handoff: 0, held: 0, awaitingAction: 0,
    blockedByReason: {}, liveness: false, deployedVersion: deployedAppVersion(),
  };
  try {
    const { drainQueuedApplications } = await import("@/lib/queue-drain");
    const drain = await drainQueuedApplications({ startedMs: t0, maxDurationMs: 300_000 });
    result.claimed = drain.claimed;
    result.attempted = drain.attempted;
    result.accepted = drain.accepted;
    result.sent = drain.sent;
    result.emailSent = drain.emailSent;
    result.portalSent = drain.portalSent;
    result.completed = drain.sent;
    result.failed = drain.failed;
    result.skipped = drain.skipped;
    result.parked = drain.parked;
    result.needsAnswers = drain.needsAnswers;
    result.handoff = drain.handoff;
    result.held = drain.held;
    result.awaitingAction = drain.awaitingAction;
    result.blockedByReason = drain.blockedByReason;
    result.deployedVersion = drain.deployedVersion;

    if (new Date().getUTCMinutes() % 30 < 5 && Date.now() - t0 < 200_000) {
      try {
        const { recheckLivenessHeldApplications } = await import("@/lib/held-application-release");
        await recheckLivenessHeldApplications({ limit: 25 });
        result.liveness = true;
      } catch (err) {
        result.liveness = "failed";
        console.error("[cron/drain-queue] liveness recheck failed", err instanceof Error ? err.message : err);
      }
    }
    const ms = Date.now() - t0;
    console.log(`[cron/drain-queue] ${ms}ms version=${result.deployedVersion}`, {
      attempted: result.attempted, accepted: result.accepted, failed: result.failed,
      blockedByReason: result.blockedByReason, awaitingAction: result.awaitingAction,
      claimed: result.claimed, sent: result.sent, emailSent: result.emailSent, portalSent: result.portalSent,
      skipped: result.skipped, parked: result.parked,
      needsAnswers: result.needsAnswers, handoff: result.handoff, held: result.held,
      liveness: result.liveness, deployedVersion: result.deployedVersion,
    });
    return NextResponse.json({ ok: true, ms, ...result });
  } catch (err) {
    console.error("[cron/drain-queue]", err);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
