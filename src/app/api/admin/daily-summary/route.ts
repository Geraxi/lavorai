import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { isAdmin } from "@/lib/admin";
import { runDailySummary } from "@/lib/daily-summary";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Trigger manuale del daily summary email.
 * Auth: sessione admin OR x-admin-key = ADMIN_SYNC_KEY OR APP_WORKER_SECRET.
 * Body: { onlyEmail?: string, dryRun?: boolean }
 */
async function authorized(req: NextRequest): Promise<boolean> {
  const header = req.headers.get("x-admin-key") ?? req.headers.get("x-worker-secret");
  const admin = process.env.ADMIN_SYNC_KEY;
  const worker = process.env.APP_WORKER_SECRET;
  if (admin && header === admin) return true;
  if (worker && header === worker) return true;
  const user = await getCurrentUser();
  return isAdmin(user?.email);
}

export async function POST(req: NextRequest) {
  if (!(await authorized(req))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const result = await runDailySummary({
    onlyEmail: body?.onlyEmail?.trim() || undefined,
    dryRun: body?.dryRun === true,
  });
  return NextResponse.json(result);
}

export async function GET(req: NextRequest) {
  // Comodità: GET fa dry-run
  if (!(await authorized(req))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const email = new URL(req.url).searchParams.get("email") ?? undefined;
  const result = await runDailySummary({ onlyEmail: email, dryRun: true });
  return NextResponse.json(result);
}
