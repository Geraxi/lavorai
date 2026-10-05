import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { runAutoApplyForUser } from "@/lib/auto-apply-cron";
import { getCurrentUser } from "@/lib/session";
import { isAdmin } from "@/lib/admin";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Run one guarded auto-apply pass for exactly one named user.
 * This is intentionally admin-only and does not bypass any eligibility,
 * subscription, daily-cap, match, location, role, or duplicate checks.
 */
async function runForNamedUser(name: string) {
  const admin = await getCurrentUser();
  if (!isAdmin(admin?.email)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  if (!name || name.length > 120) {
    return NextResponse.json({ error: "invalid_name" }, { status: 400 });
  }

  const matches = await prisma.user.findMany({
    where: { name: { equals: name, mode: "insensitive" } },
    select: { id: true, name: true, email: true },
    take: 2,
  });
  if (matches.length !== 1) {
    return NextResponse.json({ error: matches.length ? "ambiguous_user" : "user_not_found" }, { status: 404 });
  }

  const user = matches[0];
  const stats = await runAutoApplyForUser(user.id);
  return NextResponse.json({
    ok: true,
    user: { name: user.name, email: user.email },
    stats,
  });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  return runForNamedUser(name);
}

// Kept admin-only so an operator can run a one-off, named pass from the
// production admin session without a separate client-side control.
export async function GET(request: NextRequest) {
  return runForNamedUser(request.nextUrl.searchParams.get("name")?.trim() ?? "");
}
