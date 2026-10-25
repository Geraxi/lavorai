import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { sendRecruiterEmailOnce } from "@/lib/recruiter-delivery";
import {
  adminEmailTestAuthorized,
  prepareAndRunEmailTest,
  readEmailTestDelivery,
} from "@/lib/email-test-capability";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Controlled email test. Works while APPLICATIONS_PAUSED=true.
 * No APPLICATION_RECOVERY_RELEASE / LAVORAI_RELEASE_CANARY gate.
 * Auth: X-Admin-Key == ADMIN_SYNC_KEY only. An admin session is not enough.
 *
 * First post-deploy step: one POST to this route with destination
 * reply+release_canary_email_20261013_owner@inbound.lavorai.it and a fresh
 * runKey. The JSON records the sanitized provider result (error name,
 * statusCode, message, or email id if accepted). Then GET the same runKey
 * and destination to see inbound delivery. Never put the admin key in logs.
 */
function authorized(req: NextRequest): boolean {
  return adminEmailTestAuthorized({ headerKey: req.headers.get("x-admin-key") });
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const result = await prepareAndRunEmailTest(body && typeof body === "object" ? body : {}, {
    prisma,
    send: (input) => sendRecruiterEmailOnce(input),
  });
  if (!result.ok) {
    const status = result.reason === "email_test_duplicate_key" ? 409 : 400;
    return NextResponse.json({ error: result.reason }, { status });
  }
  return NextResponse.json({
    ok: true,
    applicationId: result.applicationId,
    runKey: result.runKey,
    destination: result.destination,
    attemptKey: result.attemptKey,
    result: result.result,
    provider: result.provider,
    delivery: result.delivery,
    employerConfirmed: false,
  });
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const result = await readEmailTestDelivery({
    runKey: url.searchParams.get("runKey"),
    destination: url.searchParams.get("destination"),
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: 400 });
  }
  return NextResponse.json({
    ok: true,
    applicationId: result.applicationId,
    runKey: result.runKey,
    destination: result.destination,
    attemptKey: result.attemptKey,
    delivery: result.delivery,
    employerConfirmed: false,
  });
}
