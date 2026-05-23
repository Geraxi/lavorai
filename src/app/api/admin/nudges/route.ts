import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { isAdmin } from "@/lib/admin";
import { findNudgeCandidates, runOnboardingNudges } from "@/lib/onboarding-nudge";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * GET  /api/admin/nudges — anteprima: chi riceverebbe un nudge e per quale step.
 * POST /api/admin/nudges — invia. Body: { dryRun?, onlyEmail?, ignoreCooldown? }.
 * Admin-only (founder).
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!isAdmin(user?.email)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const candidates = await findNudgeCandidates();
  return NextResponse.json({
    count: candidates.length,
    candidates: candidates.map((c) => ({
      email: c.email,
      name: c.name,
      step: c.step,
      createdAt: c.createdAt,
    })),
  });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!isAdmin(user?.email)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: {
    dryRun?: boolean;
    onlyEmail?: string;
    ignoreCooldown?: boolean;
  } = {};
  try {
    body = await request.json();
  } catch {
    // body opzionale
  }

  const result = await runOnboardingNudges({
    dryRun: body.dryRun === true,
    onlyEmail: body.onlyEmail?.trim() || undefined,
    ignoreCooldown: body.ignoreCooldown === true,
  });
  return NextResponse.json(result);
}
