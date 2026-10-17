import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { isAdmin } from "@/lib/admin";
import { ensureCvProfileFromUpload } from "@/lib/cv-profile-ensure";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Admin-only: build the CVProfile for exactly one user from the CV they
 * already uploaded (same path as upload + backfill). Never overwrites a
 * profile with content and never marks anything as user-verified.
 * GET so an operator can run it from the admin session without a client
 * control (the bulk reparse button uses window.confirm()).
 */
export async function GET(request: NextRequest) {
  const admin = await getCurrentUser();
  if (!isAdmin(admin?.email)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const email = request.nextUrl.searchParams.get("email")?.trim().toLowerCase() ?? "";
  if (!email || email.length > 160) {
    return NextResponse.json({ error: "invalid_email" }, { status: 400 });
  }
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, email: true } });
  if (!user) return NextResponse.json({ error: "user_not_found" }, { status: 404 });
  const result = await ensureCvProfileFromUpload(user.id);
  return NextResponse.json({ ok: result !== "error", email: user.email, result });
}
