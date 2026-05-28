import { NextResponse, type NextRequest } from "next/server";
import { runAutoApplyCron } from "@/lib/auto-apply-cron";
import { getCurrentUser } from "@/lib/session";
import { isAdmin } from "@/lib/admin";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Trigger manuale del cron auto-apply.
 * Auth: header X-Admin-Key == ADMIN_SYNC_KEY (script) OPPURE sessione
 * admin loggata (bottone founder).
 *
 * Scova e accoda candidature per gli utenti in modalità "auto" (queued +
 * enqueue) e "hybrid" (awaiting_consent, da approvare).
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
  const t0 = Date.now();
  try {
    const stats = await runAutoApplyCron();
    return NextResponse.json({ ok: true, ms: Date.now() - t0, ...stats });
  } catch (err) {
    console.error("[api/admin/run-auto-apply]", err);
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
