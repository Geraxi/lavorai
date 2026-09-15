import { NextResponse, type NextRequest } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/db";
import { isAdmin, isTestAccount } from "@/lib/admin";
import { sendTrialStartedEmail } from "@/lib/trial";

export const runtime = "nodejs";
export const maxDuration = 180;

const TOKEN_HASH = "a5e09641db9b37e5b341747c009bc9a93ecf3795a60c37703c6e93a287e64d90";
const EXPIRES_AT = Date.UTC(2026, 8, 15, 12, 0, 0);
const EXCLUDED_NAME = "giuseppe lonoce";

function authorized(token: string) {
  const received = createHash("sha256").update(token).digest();
  const expected = Buffer.from(TOKEN_HASH, "hex");
  return received.length === expected.length && timingSafeEqual(received, expected);
}

/** One-time launch: activate a seven-day trial and notify all existing Free users except the named exclusion. */
export async function POST(request: NextRequest) {
  if (Date.now() > EXPIRES_AT) return NextResponse.json({ error: "expired" }, { status: 410 });
  if (!authorized(request.headers.get("x-trial-launch-token") ?? "")) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const now = new Date();
  const ends = new Date(now.getTime() + 7 * 86400_000);
  const candidates = await prisma.user.findMany({
    where: { emailVerified: { not: null }, suspendedAt: null, tier: "free", stripeSubscriptionId: null },
    select: { id: true, email: true, name: true, locale: true, trialEndsAt: true },
  });
  const targets = candidates.filter((user) => !isAdmin(user.email) && !isTestAccount(user.email) && user.name?.trim().toLowerCase() !== EXCLUDED_NAME);
  const alreadyNotified = new Set((await prisma.emailLog.findMany({
    where: { kind: "trial_granted", to: { in: targets.map((user) => user.email) } },
    select: { to: true },
  })).map((entry) => entry.to.trim().toLowerCase()));
  let activated = 0;
  let sent = 0;
  let failed = 0;
  for (const user of targets) {
    await prisma.user.update({ where: { id: user.id }, data: { trialEndsAt: ends, proTrialUsedAt: now } });
    activated++;
    if (alreadyNotified.has(user.email.trim().toLowerCase())) continue;
    try {
      const result = await sendTrialStartedEmail({ ...user, trialEndsAt: ends }, { granted: true });
      if (result.sent) sent++;
      else failed++;
    } catch { failed++; }
  }
  return NextResponse.json({ ok: true, recipients: targets.length, activated, sent, failed });
}
