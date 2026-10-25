import { historicalRetriesBlocked } from "@/lib/application-rollout";
import {
  atsTestRealSubmitEnabled,
  parseAtsTestDestinations,
  prepareAndRunAtsTest,
} from "@/lib/ats-test-capability";
import { isAdmin } from "@/lib/admin";
import { processApplication } from "@/lib/application-worker";
import { checkOrigin } from "@/lib/csrf";
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
 * Reuses processApplication (adapter, status, evidence). Mints a branded
 * pause-exemption token for that one call. Does not enqueue. Does not
 * loosen historicalRetriesBlocked or uncertain-submission guards.
 *
 * Body: { realSubmit?: boolean, jobUrl?: string }
 * Real submit requires ATS_TEST_REAL_SUBMIT === "true" plus realSubmit=true.
 * Pause is skipped only because this route creates the token.
 */
async function authorize(request: NextRequest) {
  const user = await getCurrentUser();
  if (!isAdmin(user?.email)) {
    return { ok: false as const, status: 403, error: "forbidden" };
  }
  if (!checkOrigin(request)) {
    return { ok: false as const, status: 403, error: "forbidden_origin" };
  }
  return { ok: true as const };
}

export async function GET(request: NextRequest) {
  const auth = await authorize(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  return NextResponse.json({
    ok: true,
    realSubmitEnabled: atsTestRealSubmitEnabled(),
    destinations: parseAtsTestDestinations(),
  });
}

export async function POST(request: NextRequest) {
  const auth = await authorize(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
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
    realSubmitEnabled: atsTestRealSubmitEnabled(),
  });
}
