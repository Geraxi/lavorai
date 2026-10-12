import { prisma } from "@/lib/db";
import { stripe } from "@/lib/stripe";

interface RewardIntent {
  referredUserId: string;
  referrerId: string;
  mode: "stripe" | "checkout";
  customerId: string | null;
  amountCents: number | null;
  currency: string | null;
  firstAttemptAt: Date | null;
  stripeTransactionId: string | null;
  completedAt: Date | null;
}
interface ReferredUser { id: string; referredById: string | null; referralRewardedAt: Date | null }
const RETRY_WINDOW_MS = 23 * 3600_000;
const DESCRIPTION = "LavorAI referral reward · 1 month credit";
type Outcome = "rewarded" | "already" | "no_referrer";

/** New-cohort only. Call after durable evidence of the first cash payment.
 * Provider outcomes are never converted into a second, local reward. Pending
 * intents retain their exact destination and value across retries and changes
 * to the referrer's subscription. Older ambiguous attempts require reconciliation.
 */
export async function rewardCardTrialReferralIfDue(referredUserId: string): Promise<Outcome> {
  const prepared = await prisma.$transaction(async tx => {
    // The user row exists before an intent and serializes both creation and completion.
    const [referred] = await tx.$queryRaw<ReferredUser[]>`SELECT "id", "referredById", "referralRewardedAt" FROM "User" WHERE "id"=${referredUserId} FOR UPDATE`;
    if (!referred) return { outcome: "no_referrer" as Outcome };
    if (referred.referralRewardedAt) return { outcome: "already" as Outcome };
    let [intent] = await tx.$queryRaw<RewardIntent[]>`SELECT * FROM "CardTrialReferralReward" WHERE "referredUserId"=${referredUserId} FOR UPDATE`;
    if (intent?.completedAt) return { outcome: "already" as Outcome };
    if (!intent) {
      if (!referred.referredById) return { outcome: "no_referrer" as Outcome };
      const referrer = await tx.user.findUnique({ where: { id: referred.referredById }, select: {
        id: true, stripeCustomerId: true, stripeSubscriptionId: true, subscriptionStatus: true,
      } });
      if (!referrer) return { outcome: "no_referrer" as Outcome };
      let customerId: string | null = null;
      let amountCents: number | null = null;
      let currency: string | null = null;
      const mode = referrer.stripeCustomerId && referrer.stripeSubscriptionId && referrer.subscriptionStatus === "active" ? "stripe" : "checkout";
      if (mode === "stripe") {
        // Read-only preparation. A failed read cannot consume or redirect a reward.
        const subscription = await stripe().subscriptions.retrieve(referrer.stripeSubscriptionId!);
        const owner = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
        if (owner !== referrer.stripeCustomerId) throw new Error("REFERRAL_SUBSCRIPTION_OWNERSHIP_MISMATCH");
        const price = subscription.items.data[0]?.price;
        if (!price || !Number.isSafeInteger(price.unit_amount) || price.unit_amount! <= 0 || !price.currency) {
          throw new Error("REFERRAL_PRICE_REQUIRES_RECONCILIATION");
        }
        customerId = referrer.stripeCustomerId;
        amountCents = price.unit_amount;
        currency = price.currency;
      }
      const firstAttemptAt = mode === "stripe" ? new Date() : null;
      await tx.$executeRaw`INSERT INTO "CardTrialReferralReward" ("referredUserId", "referrerId", "mode", "customerId", "amountCents", "currency", "firstAttemptAt") VALUES (${referredUserId}, ${referrer.id}, ${mode}, ${customerId}, ${amountCents}, ${currency}, ${firstAttemptAt})`;
      intent = { referredUserId, referrerId: referrer.id, mode, customerId, amountCents, currency, firstAttemptAt, stripeTransactionId: null, completedAt: null };
    }
    if (intent.mode === "checkout") {
      await tx.user.update({ where: { id: intent.referrerId }, data: { referralCredits: { increment: 1 } }, select: { id: true } });
      await tx.user.update({ where: { id: referredUserId }, data: { referralRewardedAt: new Date() }, select: { id: true } });
      await tx.$executeRaw`UPDATE "CardTrialReferralReward" SET "completedAt"=now() WHERE "referredUserId"=${referredUserId}`;
      await tx.subscriptionEvent.create({ data: { userId: intent.referrerId, action: "referral_reward", reason: "checkout_credit" } });
      return { outcome: "rewarded" as Outcome };
    }
    return { intent };
  }, { timeout: 30_000 });
  if ("outcome" in prepared) return prepared.outcome!;
  const intent = prepared.intent;
  const age = intent.firstAttemptAt ? Date.now() - intent.firstAttemptAt.getTime() : NaN;
  if (!Number.isFinite(age) || age < 0 || age >= RETRY_WINDOW_MS) throw new Error("REFERRAL_CREDIT_REQUIRES_RECONCILIATION");
  if (intent.mode !== "stripe" || !intent.customerId || !Number.isSafeInteger(intent.amountCents) || intent.amountCents! <= 0 || !intent.currency) {
    throw new Error("REFERRAL_INTENT_REQUIRES_RECONCILIATION");
  }
  // This mutation occurs only after the frozen intent and attempt time commit.
  // Timeout/lost response leaves the intent pending; no fallback credit is safe.
  const credited = await stripe().customers.createBalanceTransaction(intent.customerId, {
    amount: -intent.amountCents!, currency: intent.currency, description: DESCRIPTION,
  }, { idempotencyKey: `referral-credit:${referredUserId}` });
  const creditedCustomer = typeof credited.customer === "string" ? credited.customer : credited.customer?.id;
  if (!credited.id || creditedCustomer !== intent.customerId || credited.amount !== -intent.amountCents! || credited.currency !== intent.currency) {
    throw new Error("REFERRAL_CREDIT_RESULT_REQUIRES_RECONCILIATION");
  }
  return prisma.$transaction(async tx => {
    const [referred] = await tx.$queryRaw<ReferredUser[]>`SELECT "id", "referredById", "referralRewardedAt" FROM "User" WHERE "id"=${referredUserId} FOR UPDATE`;
    const [pending] = await tx.$queryRaw<RewardIntent[]>`SELECT * FROM "CardTrialReferralReward" WHERE "referredUserId"=${referredUserId} FOR UPDATE`;
    if (!referred || !pending) throw new Error("REFERRAL_INTENT_MISSING");
    if (pending.completedAt) return "already" as const;
    if (referred.referralRewardedAt || pending.mode !== intent.mode || pending.referrerId !== intent.referrerId || pending.customerId !== intent.customerId || pending.amountCents !== intent.amountCents || pending.currency !== intent.currency) {
      throw new Error("REFERRAL_INTENT_REQUIRES_RECONCILIATION");
    }
    await tx.user.update({ where: { id: referredUserId }, data: { referralRewardedAt: new Date() }, select: { id: true } });
    await tx.$executeRaw`UPDATE "CardTrialReferralReward" SET "stripeTransactionId"=${credited.id}, "completedAt"=now() WHERE "referredUserId"=${referredUserId}`;
    await tx.subscriptionEvent.create({ data: { userId: intent.referrerId, action: "referral_reward", reason: "renewal_credit" } });
    return "rewarded" as const;
  }, { timeout: 30_000 });
}
