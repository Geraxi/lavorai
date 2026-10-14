import { applicationsPaused } from "@/lib/application-pause";
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { enqueueApplication, cancelApplication } from "@/lib/application-queue";
import { getCurrentUser } from "@/lib/session";
import { isAdmin } from "@/lib/admin";
import { creditRetryRequest, retryCreditFailures, verifyCreditRetryWorkerSchema } from "@/lib/credit-failure-retry";

export const runtime = "nodejs";
export const maxDuration = 120;

/** Preview by default. Live: exact preview IDs + versions, canary=1 / batch<=10.
 * Worker schema is checked read-only; live requests also require an explicit
 * operator confirmation of fresh polling/AI health (see runbook).
 */
async function authorized(req: NextRequest): Promise<boolean> {
  const headerKey = req.headers.get("x-admin-key");
  const expected = process.env.ADMIN_SYNC_KEY;
  if (expected && headerKey === expected) return true;
  const user = await getCurrentUser();
  return isAdmin(user?.email);
}

export async function POST(req: NextRequest) {
  if (!(await authorized(req))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (applicationsPaused()) return NextResponse.json({ error: "applications_paused" }, { status: 503 });

  const parsed = creditRetryRequest.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "validation", issues: parsed.error.issues }, { status: 400 });
  }
  if (!parsed.data.dryRun) {
    try { await verifyCreditRetryWorkerSchema(prisma); }
    catch { return NextResponse.json({ error: "worker_schema_not_ready" }, { status: 503 }); }
  }
  try {
    const result = await retryCreditFailures(parsed.data, {
      db: prisma, cancel: cancelApplication, enqueue: enqueueApplication,
    });
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "credit_retry_read_failed" }, { status: 503 });
  }
}
