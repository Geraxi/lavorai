import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";

/**
 * Referral: ogni utente ha un codice univoco da condividere. Quando un
 * referred sale a Pro, entrambi guadagnano 1 mese gratis (gestione reward
 * via Stripe coupon / admin alert in v1).
 *
 * Codice: 8 char alfanumerici case-insensitive (lowercase). Generato al
 * primo accesso alla sezione referral (lazy) — evita migrazione di massa.
 */

const COOKIE = "lv_ref";

function genCode(): string {
  return randomBytes(6)
    .toString("base64url")
    .toLowerCase()
    .replace(/[-_]/g, "")
    .slice(0, 8);
}

/**
 * Restituisce il codice dell'utente, creandolo se assente. Idempotent.
 * Resiliente a collisioni (random 6 byte → spazio enorme; in pratica mai).
 */
export async function ensureReferralCode(userId: string): Promise<string> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { referralCode: true } });
  if (u?.referralCode) return u.referralCode;
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = genCode();
    try {
      await prisma.user.update({ where: { id: userId }, data: { referralCode: code } });
      return code;
    } catch {
      // collisione rarissima → riprova
    }
  }
  throw new Error("Could not generate unique referral code");
}

/** Stats: quanti referred, quanti paganti. */
export async function getReferralStats(userId: string) {
  const referrals = await prisma.user.findMany({
    where: { referredById: userId },
    select: { id: true, tier: true, createdAt: true },
  });
  const total = referrals.length;
  const paying = referrals.filter((r) => r.tier === "pro" || r.tier === "pro_plus").length;
  const me = await prisma.user.findUnique({ where: { id: userId }, select: { referralCredits: true } });
  const rewards = await prisma.subscriptionEvent.count({ where: { userId, action: "referral_reward" } }).catch(() => 0);
  return { total, paying, credits: me?.referralCredits ?? 0, rewards };
}

/** Risolve un codice → userId. Null se inesistente o suo (no self-referral). */
export async function resolveReferralCode(code: string, selfUserId?: string): Promise<string | null> {
  const c = code.trim().toLowerCase();
  if (!c) return null;
  const u = await prisma.user.findUnique({ where: { referralCode: c }, select: { id: true } });
  if (!u) return null;
  if (selfUserId && u.id === selfUserId) return null;
  return u.id;
}

export const REFERRAL_COOKIE = COOKIE;

/**
 * Premio referral: quando un utente invitato diventa pagante (status
 * "active", cioè dopo la prova), l'invitante riceve 1 mese gratis.
 * Se l'invitante ha un abbonamento vivo, il coupon 100%×1 viene applicato
 * subito su Stripe; altrimenti resta in `referralCredits` e viene usato al
 * suo prossimo checkout. Idempotente via `referralRewardedAt` sull'invitato.
 */
export async function rewardReferralIfDue(referredUserId: string): Promise<"rewarded" | "already" | "no_referrer"> {
  const referred = await prisma.user.findUnique({
    where: { id: referredUserId },
    select: { referredById: true, referralRewardedAt: true, email: true },
  });
  if (!referred?.referredById) return "no_referrer";
  if (referred.referralRewardedAt) return "already";
  const claimed = await prisma.user.updateMany({
    where: { id: referredUserId, referralRewardedAt: null },
    data: { referralRewardedAt: new Date() },
  });
  if (claimed.count === 0) return "already";

  const referrer = await prisma.user.findUnique({
    where: { id: referred.referredById },
    select: { id: true, email: true, stripeSubscriptionId: true, subscriptionStatus: true },
  });
  if (!referrer) return "no_referrer";

  let appliedNow = false;
  if (referrer.stripeSubscriptionId && (referrer.subscriptionStatus === "active" || referrer.subscriptionStatus === "trialing")) {
    try {
      const { stripe, ensureReferralCoupon } = await import("@/lib/stripe");
      const coupon = await ensureReferralCoupon(stripe());
      await stripe().subscriptions.update(referrer.stripeSubscriptionId, { discounts: [{ coupon }] });
      appliedNow = true;
    } catch (err) {
      console.error("[referral] coupon apply failed, keeping credit", err);
    }
  }
  if (!appliedNow) {
    await prisma.user.update({ where: { id: referrer.id }, data: { referralCredits: { increment: 1 } } });
  }
  await prisma.subscriptionEvent.create({
    data: { userId: referrer.id, action: "referral_reward", reason: appliedNow ? "stripe" : "credit" },
  }).catch(() => void 0);
  console.log(`[referral] reward → ${referrer.email} (${appliedNow ? "coupon on sub" : "credit"}) for ${referred.email}`);
  return "rewarded";
}
