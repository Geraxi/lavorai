import { NextResponse, type NextRequest } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/db";
import { isAdmin, isTestAccount } from "@/lib/admin";
import { sendTrialStartedEmail } from "@/lib/trial";

export const runtime = "nodejs";
export const maxDuration = 60;

// Capability valida per un solo lancio operativo, senza esporre segreti di
// produzione. L'endpoint scade e viene rimosso subito dopo l'invio.
const TOKEN_HASH = "ab7f8e30e764cef993bb23d1aea845b01a0ec0a68aea2977cb4176c0011daead";
const EXPIRES_AT = Date.UTC(2026, 8, 15, 11, 45, 0);

function authorized(token: string): boolean {
  const received = createHash("sha256").update(token).digest();
  const expected = Buffer.from(TOKEN_HASH, "hex");
  return received.length === expected.length && timingSafeEqual(received, expected);
}

/**
 * One-time delivery for the historical-user trial launch. It can only reach
 * users marked by the launch backfill and never re-sends a logged email.
 */
export async function POST(request: NextRequest) {
  if (Date.now() > EXPIRES_AT) return NextResponse.json({ error: "expired" }, { status: 410 });
  if (!authorized(request.headers.get("x-trial-launch-token") ?? "")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const candidates = await prisma.user.findMany({
    where: {
      emailVerified: { not: null },
      tier: "free",
      stripeSubscriptionId: null,
      suspendedAt: null,
      trialEndsAt: { gt: now },
      conversionEvents: {
        some: {
          name: "trial_started",
          propertiesJson: { contains: "existing_user_launch" },
        },
      },
    },
    select: { id: true, email: true, name: true, locale: true, trialEndsAt: true },
  });

  const targets = candidates.filter((user) => !isAdmin(user.email) && !isTestAccount(user.email));
  const delivered = new Set(
    (await prisma.emailLog.findMany({
      where: { kind: "trial_granted", to: { in: targets.map((user) => user.email) } },
      select: { to: true },
    })).map((entry) => entry.to.trim().toLowerCase()),
  );

  let sent = 0;
  let skipped = 0;
  let failed = 0;
  for (const user of targets) {
    if (!user.trialEndsAt || delivered.has(user.email.trim().toLowerCase())) {
      skipped++;
      continue;
    }
    try {
      const result = await sendTrialStartedEmail(user, { granted: true });
      if (result.sent) sent++;
      else skipped++;
    } catch {
      failed++;
    }
  }

  return NextResponse.json({ ok: true, candidates: targets.length, sent, skipped, failed });
}
