import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isAdmin, isTestAccount } from "@/lib/admin";
import { claimTrialExtension } from "@/lib/trial-extension";

export const runtime = "nodejs";

/**
 * Activates the one-off extra free week on the user's own click (banner on
 * /trial-expired). Same-origin, session-owned, idempotent. The week then needs
 * a card like any active trial, so the client goes to /start-membership.
 * Records nothing else: no consent, no subscription, no email (the cron sends
 * the confirmation email later within the quota).
 */
export async function POST(request: NextRequest) {
  const headers = { "Cache-Control": "no-store" };
  if (request.headers.get("origin") !== request.nextUrl.origin || request.headers.get("sec-fetch-site") === "cross-site") {
    return NextResponse.json({ error: "invalid_origin" }, { status: 403, headers });
  }
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthenticated" }, { status: 401, headers });
  try {
    const r = await claimTrialExtension(prisma, session.user.id, { isTest: isTestAccount, isAdmin });
    if (!r.ok) return NextResponse.json({ error: r.reason }, { status: r.reason === "disabled" ? 404 : 403, headers });
    return NextResponse.json({ ok: true, endsAt: r.endsAt.toISOString(), already: r.already, redirect: "/start-membership" }, { headers });
  } catch {
    return NextResponse.json({ error: "service_unavailable" }, { status: 503, headers });
  }
}
