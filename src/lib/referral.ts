import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";

/**
 * Referral: ogni utente ha un codice univoco da condividere. Quando un
 * referred diventa pagante, l'invitante guadagna un credito pari a un
 * mese del suo piano. Gli abbonati ricevono un credito Stripe cumulabile
 * sul prossimo rinnovo; gli altri lo usano al prossimo checkout.
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

/** Stats: quanti referred, quanti hanno completato il primo pagamento. */
export async function getReferralStats(userId: string) {
  const referrals = await prisma.user.findMany({
    where: { referredById: userId },
    select: { id: true, referralRewardedAt: true, createdAt: true },
  });
  const total = referrals.length;
  const paying = referrals.filter((r) => r.referralRewardedAt !== null).length;
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
 * Se l'invitante ha un abbonamento vivo, il credito Stripe viene applicato
 * sul prossimo rinnovo; altrimenti resta in `referralCredits` e viene usato
 * al prossimo checkout. Un customer balance, a differenza di un coupon sulla
 * subscription, accumula correttamente più referral. Idempotente via
 * `referralRewardedAt` sull'invitato.
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
    select: { id: true, email: true, stripeCustomerId: true, stripeSubscriptionId: true, subscriptionStatus: true },
  });
  if (!referrer) return "no_referrer";

  let appliedNow = false;
  if (referrer.stripeCustomerId && referrer.stripeSubscriptionId && referrer.subscriptionStatus === "active") {
    try {
      const { stripe } = await import("@/lib/stripe");
      const client = stripe();
      const subscription = await client.subscriptions.retrieve(referrer.stripeSubscriptionId);
      const price = subscription.items.data[0]?.price;
      if (price?.unit_amount && price.currency) {
        await client.customers.createBalanceTransaction(
          referrer.stripeCustomerId,
          {
            amount: -price.unit_amount,
            currency: price.currency,
            description: "LavorAI referral reward · 1 month credit",
          },
          { idempotencyKey: `referral-credit:${referredUserId}` },
        );
        appliedNow = true;
      }
    } catch (err) {
      console.error("[referral] renewal credit failed, keeping checkout credit", err);
    }
  }
  if (!appliedNow) {
    await prisma.user.update({ where: { id: referrer.id }, data: { referralCredits: { increment: 1 } } });
  }
  await prisma.subscriptionEvent.create({
    data: { userId: referrer.id, action: "referral_reward", reason: appliedNow ? "renewal_credit" : "checkout_credit" },
  }).catch(() => void 0);
  console.log(`[referral] reward → ${referrer.email} (${appliedNow ? "renewal credit" : "checkout credit"}) for ${referred.email}`);
  return "rewarded";
}
