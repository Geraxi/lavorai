import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { isAdmin, isTestAccount } from "@/lib/admin";
import { sendVerificationEmail } from "@/lib/email-verification";

export const runtime = "nodejs";

/** POST /api/admin/resend-verification — reinvia l'email di verifica a tutti gli account non verificati. Solo admin. */
export async function POST() {
  const me = await getCurrentUser();
  if (!isAdmin(me?.email)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const users = await prisma.user.findMany({ where: { emailVerified: null, suspendedAt: null }, select: { id: true, email: true, locale: true } });
  const targets = users.filter((u) => !isTestAccount(u.email));
  const details: string[] = [];
  for (const u of targets) {
    await sendVerificationEmail(u.id, u.email, u.locale).then(() => details.push(`${u.email} sent`)).catch((err) => details.push(`${u.email} error ${err instanceof Error ? err.message : "?"}`));
  }
  return NextResponse.json({ ok: true, count: targets.length, details });
}
