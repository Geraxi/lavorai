import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { isAdmin } from "@/lib/admin";

export const runtime = "nodejs";

/**
 * POST /api/admin/resend-verification — refused.
 * Bulk resend of old verification notices is a backlog send and is not allowed.
 * Affected unverified users request a fresh link themselves via
 * POST /api/auth/verify-email/resend (new token, old unused tokens invalidated,
 * rate-limited). Expired links are never replayed.
 */
export async function POST() {
  const me = await getCurrentUser();
  if (!isAdmin(me?.email)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({
    error: "backlog_send_refused",
    message: "Nessun reinvio di massa. Gli utenti non verificati richiedono un nuovo link da POST /api/auth/verify-email/resend.",
  }, { status: 409 });
}
