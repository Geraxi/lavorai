import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { isAdmin, isTestAccount } from "@/lib/admin";
import { sendTrialStartedEmail, startTrial } from "@/lib/trial";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * POST /api/admin/grant-trial?dry=1
 * Una tantum: agli utenti Free esistenti (senza abbonamento, senza prova
 * già assegnata) concede 7 giorni di Pro da oggi e invia l'email
 * "Ti abbiamo attivato Pro per 7 giorni". Solo admin.
 */
export async function POST(req: NextRequest) {
  const me = await getCurrentUser();
  if (!isAdmin(me?.email)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const dry = req.nextUrl.searchParams.get("dry") === "1";

  const users = await prisma.user.findMany({
    where: { tier: "free", stripeSubscriptionId: null, trialEndsAt: null, suspendedAt: null, emailVerified: { not: null } },
    select: { id: true, email: true, name: true, locale: true, trialEndsAt: true },
  });
  const targets = users.filter((u) => !isTestAccount(u.email) && !isAdmin(u.email));
  const details: { email: string; status: string }[] = [];
  let granted = 0;
  for (const u of targets) {
    if (dry) { details.push({ email: u.email, status: "dry_run" }); continue; }
    try {
      const ends = await startTrial(u.id);
      granted++;
      const r = await sendTrialStartedEmail({ ...u, trialEndsAt: ends }, { granted: true });
      details.push({ email: u.email, status: r.sent ? "granted+email" : `granted, email ${r.reason ?? "skipped"}` });
    } catch (err) {
      details.push({ email: u.email, status: "error: " + (err instanceof Error ? err.message.slice(0, 80) : "?") });
    }
  }
  return NextResponse.json({ ok: true, dry, candidates: targets.length, granted, details });
}
