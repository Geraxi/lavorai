import { NextResponse, type NextRequest } from "next/server";
import { syncAtsJobs } from "@/lib/scrapers/sync-jobs";
import { getCurrentUser } from "@/lib/session";
import { isAdmin } from "@/lib/admin";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Sync delle job (ATS + demand-driven) nelle nostre tabelle.
 *
 * Due modalità di auth:
 *  - header X-Admin-Key == env ADMIN_SYNC_KEY (cron esterno / script)
 *  - sessione admin loggata (founder) → trigger manuale dal pannello
 *
 * POST = trigger da UI/script. GET = comodo trigger browser per il founder.
 */
async function authorized(request: NextRequest): Promise<boolean> {
  const headerKey = request.headers.get("x-admin-key");
  const expected = process.env.ADMIN_SYNC_KEY;
  if (expected && headerKey === expected) return true;
  const user = await getCurrentUser();
  return isAdmin(user?.email);
}

async function handle(request: NextRequest) {
  if (!(await authorized(request))) {
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

export async function POST(request: NextRequest) {
  return handle(request);
}

export async function GET(request: NextRequest) {
  return handle(request);
}
