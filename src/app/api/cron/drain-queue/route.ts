import { NextResponse, type NextRequest } from "next/server";
import { applicationsPaused } from "@/lib/application-pause";

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
  if (applicationsPaused()) return NextResponse.json({ ok: true, paused: true, reason: "applications_paused" });

  const t0 = Date.now();
  const result: {
    claimed: number; sent: number; completed: number; failed: number; skipped: number;
    parked: number; needsAnswers: number; handoff: number; held: number;
    blockedByReason: Record<string, number>; liveness: boolean | string;
  } = {
    claimed: 0, sent: 0, completed: 0, failed: 0, skipped: 0, parked: 0,
    needsAnswers: 0, handoff: 0, held: 0,
    blockedByReason: {}, liveness: false,
  };
  try {
    const { drainQueuedApplications } = await import("@/lib/queue-drain");
    const drain = await drainQueuedApplications({ startedMs: t0, maxDurationMs: 300_000 });
    result.claimed = drain.claimed;
    result.sent = drain.sent;
    result.completed = drain.sent;
    result.failed = drain.failed;
    result.skipped = drain.skipped;
    result.parked = drain.parked;
    result.needsAnswers = drain.needsAnswers;
    result.handoff = drain.handoff;
    result.held = drain.held;
    result.blockedByReason = drain.blockedByReason;

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
    console.log(`[cron/drain-queue] ${ms}ms`, {
      claimed: result.claimed, sent: result.sent, blockedByReason: result.blockedByReason,
      skipped: result.skipped, failed: result.failed, parked: result.parked,
      needsAnswers: result.needsAnswers, handoff: result.handoff, held: result.held,
      liveness: result.liveness,
    });
    return NextResponse.json({ ok: true, ms, ...result });
  } catch (err) {
    console.error("[cron/drain-queue]", err);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
