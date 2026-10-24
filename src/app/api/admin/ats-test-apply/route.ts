import { applicationsPaused } from "@/lib/application-pause";
import { historicalRetriesBlocked } from "@/lib/application-rollout";
import { prepareAndRunAtsTest } from "@/lib/ats-test-capability";
import { isAdmin } from "@/lib/admin";
import { processApplication } from "@/lib/application-worker";
import { prisma } from "@/lib/db";
import { findPortalAdapter } from "@/lib/portal-adapters";
import { getCurrentUser } from "@/lib/session";
import { NextResponse, type NextRequest } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * POST /api/admin/ats-test-apply
 *
 * Restricted ATS test: dedicated test user + allowlisted destination only.
 * Reuses processApplication (adapter, status, evidence). Does not enqueue
 * (poller would drop dry-run / single-shot flags). Does not loosen
 * historicalRetriesBlocked or uncertain-submission guards.
 *
 * Body: { realSubmit?: boolean, jobUrl?: string }
 * Real submit requires ATS_TEST_REAL_SUBMIT plus realSubmit=true. Single-shot.
 */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!isAdmin(user?.email)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (applicationsPaused()) return NextResponse.json({ error: "applications_paused" }, { status: 503 });
  // Consulted, not bypassed: this route creates a fresh application rather
  // than replaying historical rows. The existing /admin/test-apply path stays
  // blocked by historicalRetriesBlocked().
  void historicalRetriesBlocked();

  let body: { realSubmit?: boolean; jobUrl?: string } = {};
  try {
    body = await request.json();
  } catch {
    // optional
  }

  const run = await prepareAndRunAtsTest({
    adminOk: true,
    realSubmit: body.realSubmit === true,
    jobUrl: body.jobUrl,
  }, {
    prisma,
    processApplication,
    findPortalAdapter,
  });

  if (!run.ok) {
    return NextResponse.json({ ok: false, error: run.reason }, { status: run.status ?? 400 });
  }
  return NextResponse.json({
    ok: true,
    mode: run.mode,
    applicationId: run.applicationId,
    jobId: run.jobId,
    destination: run.destination,
    adapter: run.adapter,
    result: run.result,
  });
}
