import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { isAdmin } from "@/lib/admin";
import { findUpgradeCandidates, runUpgradeNudges } from "@/lib/upgrade-nudge";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * GET  /api/admin/upgrade-nudges — anteprima destinatari.
 * POST /api/admin/upgrade-nudges — invia. Body { dryRun?, onlyEmail?, ignoreCooldown? }.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!isAdmin(user?.email)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const candidates = await findUpgradeCandidates();
  return NextResponse.json({
    count: candidates.length,
    candidates: candidates.map((c) => ({
      email: c.email,
      name: c.name,
      applications: c.applicationsCount,
      daysSinceSignup: c.daysSinceSignup,
      reason: c.reason,
    })),
    limitHitCount: candidates.filter((c) => c.reason === "limit_hit").length,
    genericCount: candidates.filter((c) => c.reason === "generic").length,
    noAppsCount: candidates.filter((c) => c.reason === "no_apps").length,
  });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!isAdmin(user?.email)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  let body: { dryRun?: boolean; onlyEmail?: string; ignoreCooldown?: boolean } = {};
  try {
    body = await request.json();
  } catch {}
  const result = await runUpgradeNudges({
    dryRun: body.dryRun === true,
    onlyEmail: body.onlyEmail?.trim() || undefined,
    ignoreCooldown: body.ignoreCooldown === true,
  });
  return NextResponse.json(result);
}
