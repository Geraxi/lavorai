import { NextResponse, type NextRequest } from "next/server";
import { syncAtsJobs } from "@/lib/scrapers/sync-jobs";

export const runtime = "nodejs";
export const maxDuration = 300; // 5 min max per Vercel hobby

/**
 * Vercel Cron entry point — invocato ogni 6 ore.
 * Auth: Vercel Cron manda header "authorization: Bearer <CRON_SECRET>" se
 * impostato. In alternativa accetta anche X-Admin-Key (run manuale).
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
  const t0 = Date.now();
  try {
    const result = await syncAtsJobs();
    const ms = Date.now() - t0;
    console.log(`[cron/sync-jobs] ${ms}ms`, result);
    return NextResponse.json({ ok: true, ms, ...result });
  } catch (err) {
    console.error("[cron/sync-jobs]", err);
    return NextResponse.json(
      { error: "internal", message: err instanceof Error ? err.message : "Errore" },
      { status: 500 },
    );
  }
}
