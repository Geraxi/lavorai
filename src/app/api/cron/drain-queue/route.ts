import { NextResponse, type NextRequest } from "next/server";
import { applicationsPaused } from "@/lib/application-pause";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Vercel Cron (ogni 5 min) + backup GitHub Actions (ogni 15 min).
 * Sostituisce il polling DB del worker Railway: prende le candidature
 * `queued` non ancora in carico (claim atomico) e le elabora entro il
 * budget della function. Ogni ~30 min esegue anche il liveness recheck.
 */
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (applicationsPaused()) return NextResponse.json({ ok: true, paused: true, reason: "applications_paused" });

  const t0 = Date.now();
  const concurrency = Math.max(1, Number(process.env.WORKER_CONCURRENCY ?? 2) || 2);
  const { findClaimableQueued, claimApplication } = await import("@/lib/application-claim");
  const { processApplication } = await import("@/lib/application-worker");

  const result = { claimed: 0, completed: 0, failed: 0, liveness: false as boolean | string };
  try {
    const ids = await findClaimableQueued(concurrency);
    await Promise.all(ids.map(async (id) => {
      if (!(await claimApplication(id))) return;
      result.claimed++;
      try {
        await processApplication(id);
        result.completed++;
      } catch (err) {
        result.failed++;
        console.error(`[cron/drain-queue] ${id} failed:`, err instanceof Error ? err.message : err);
      }
    }));

    // Liveness recheck circa ogni 30 min (minuti 0 e 30 UTC, slot da 5 min).
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
    console.log(`[cron/drain-queue] ${ms}ms`, result);
    return NextResponse.json({ ok: true, ms, ...result });
  } catch (err) {
    console.error("[cron/drain-queue]", err);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
