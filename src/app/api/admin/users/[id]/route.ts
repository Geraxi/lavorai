import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { isAdmin } from "@/lib/admin";
import { deleteUserCompletely } from "@/lib/admin-user-actions";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/admin/users/[id]  { action: "delete" | "suspend" | "unsuspend" | "reset_credits" }
 * Solo admin. L'account admin non può essere eliminato/sospeso.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const me = await getCurrentUser();
  if (!isAdmin(me?.email)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { action?: string };
  const target = await prisma.user.findUnique({ where: { id }, select: { id: true, email: true, suspendedAt: true } });
  if (!target) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (isAdmin(target.email) && body.action !== "reset_credits") {
    return NextResponse.json({ error: "forbidden", message: "L'account admin non può essere sospeso o eliminato." }, { status: 403 });
  }

  switch (body.action) {
    case "delete": {
      const r = await deleteUserCompletely(target.id);
      console.log(`[admin/users] deleted ${target.email} by ${me?.email} (${r.cancelledApplications} candidature annullate)`);
      return NextResponse.json({ ok: true, ...r });
    }
    case "suspend": {
      await prisma.user.update({ where: { id }, data: { suspendedAt: new Date() } });
      // Ferma anche l'auto-apply.
      await prisma.userPreferences.updateMany({ where: { userId: id }, data: { autoApplyMode: "off", autoApplyOn: false } }).catch(() => void 0);
      await prisma.session.deleteMany({ where: { userId: id } }).catch(() => void 0);
      return NextResponse.json({ ok: true, suspendedAt: new Date().toISOString() });
    }
    case "unsuspend": {
      await prisma.user.update({ where: { id }, data: { suspendedAt: null } });
      return NextResponse.json({ ok: true });
    }
    case "reset_credits": {
      await prisma.user.update({ where: { id }, data: { quotaResetAt: new Date() } });
      return NextResponse.json({ ok: true, quotaResetAt: new Date().toISOString() });
    }
    default:
      return NextResponse.json({ error: "bad_action" }, { status: 400 });
  }
}
