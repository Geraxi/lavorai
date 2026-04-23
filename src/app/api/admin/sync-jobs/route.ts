import { NextResponse, type NextRequest } from "next/server";
import { syncAtsJobs } from "@/lib/scrapers/sync-jobs";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * POST /api/admin/sync-jobs
 * Sync pubblico delle job da Greenhouse + Lever nelle nostre tabelle.
 * Autenticato via header X-Admin-Key == env ADMIN_SYNC_KEY.
 * Chiamabile anche da un cron esterno (es. GitHub Actions / Vercel Cron).
 */
export async function POST(request: NextRequest) {
  const headerKey = request.headers.get("x-admin-key");
  const expected = process.env.ADMIN_SYNC_KEY;
  if (!expected || headerKey !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const result = await syncAtsJobs();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[api/admin/sync-jobs]", err);
    return NextResponse.json(
      { error: "internal", message: err instanceof Error ? err.message : "Errore" },
      { status: 500 },
    );
  }
}
