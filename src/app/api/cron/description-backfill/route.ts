import { NextResponse, type NextRequest } from "next/server";
import { backfillTruncatedDescriptions } from "@/lib/scrapers/description-backfill";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Bounded re-fetch of open Job.description rows still at the legacy
 * 2,000-character ingest cap. Also runs at the end of sync-jobs.
 */
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const adminKey = process.env.ADMIN_SYNC_KEY;
  const auth = request.headers.get("authorization");
  const xAdmin = request.headers.get("x-admin-key");
  const authorized =
    (cronSecret && auth === `Bearer ${cronSecret}`) ||
    (adminKey && xAdmin === adminKey);
  if (!authorized) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const t0 = Date.now();
  try {
    const result = await backfillTruncatedDescriptions();
    const ms = Date.now() - t0;
    console.log(`[cron/description-backfill] ${ms}ms`, result);
    return NextResponse.json({ ok: true, ms, ...result });
  } catch (err) {
    console.error("[cron/description-backfill]", err);
    return NextResponse.json(
      { error: "internal", message: err instanceof Error ? err.message : "Errore" },
      { status: 500 },
    );
  }
}
