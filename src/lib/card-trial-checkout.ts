import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { stripe, tierToPriceId } from "@/lib/stripe";
import { CARD_TRIAL_DAYS, CARD_TRIAL_POLICY, cardTrialEnrollmentAvailable } from "@/lib/card-trial-policy";
import type { CardTrialEnrollment } from "@/lib/card-trial-store";
import type { CurrentUser } from "@/lib/user-selects";

/** Serialized per account. Stripe idempotency keys survive a lost response or DB
 * rollback. An unresolved checkout must be reconciled, never replaced blindly. */
export async function createCardTrialCheckout(user: CurrentUser, tier: "pro" | "pro_plus", reactivate = false): Promise<{ url: string | null; tier: "pro" | "pro_plus"; alreadySubscribed?: boolean }> {
  if (!cardTrialEnrollmentAvailable()) throw new Error("PREVIEW_UNAVAILABLE");
  if (!user.emailVerified) throw new Error("EMAIL_VERIFICATION_REQUIRED");
  const price = tierToPriceId(tier);
  if (!price) throw new Error("PRICE_UNAVAILABLE");
  const s = stripe();
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  // Persist the attempt before any network side effect. Reuse it after failures.
  const attempt = randomUUID();
  await prisma.$executeRaw`INSERT INTO "CardTrialEnrollment" ("userId", "tier", "checkoutAttempt") VALUES (${user.id}, ${tier}, ${attempt}) ON CONFLICT ("userId") DO NOTHING`;
  const result = await prisma.$transaction(async tx => {
    const [row] = await tx.$queryRaw<CardTrialEnrollment[]>`SELECT * FROM "CardTrialEnrollment" WHERE "userId" = ${user.id} FOR UPDATE`;
    if (!row) throw new Error("ENROLLMENT_UNAVAILABLE");
    const portal = async () => {
      if (!row.customerId) throw new Error("ENROLLMENT_UNAVAILABLE");
      const session = await s.billingPortal.sessions.create({ customer: row.customerId, return_url: `${site}/start-membership` });
      return { url: session.url, tier: row.tier, alreadySubscribed: true };
    };
    let previous = null;
    if (row.subscriptionId) {
      if (!reactivate) return portal();
      const old = await s.subscriptions.retrieve(row.subscriptionId);
      const oldCustomer = typeof old.customer === "string" ? old.customer : old.customer.id;
      if (!row.customerId || oldCustomer !== row.customerId) throw new Error("SUBSCRIPTION_CUSTOMER_MISMATCH");
      // Scheduled cancellation is still a live subscription. Only a verified,
      // terminal cancellation permits a new paid subscription.
      if (old.status !== "canceled") return portal();
      if (row.checkoutSessionId) previous = await s.checkout.sessions.retrieve(row.checkoutSessionId);
      const previousSubscription = previous && (typeof previous.subscription === "string" ? previous.subscription : previous.subscription?.id);
      if (row.checkoutKind !== "paid_reactivation" || (previous?.status === "complete" && previousSubscription === row.subscriptionId)) {
        // Commit the new key before making any checkout/customer creation call.
        // Keep the old subscription and all trial/preview evidence intact.
        await tx.$executeRaw`UPDATE "CardTrialEnrollment" SET "checkoutAttempt"=${randomUUID()}, "checkoutAttemptStartedAt"=now(), "checkoutKind"='paid_reactivation', "status"='canceled', "paidThrough"=NULL, "paidInvoiceId"=NULL, "cancelAtPeriodEnd"=false, "checkoutSessionId"=NULL, "checkoutUrl"=NULL, "checkoutExpiresAt"=NULL, "tier"=${tier}, "updatedAt"=now() WHERE "userId"=${user.id}`;
        // The API observed authoritative cancellation before its webhook.
        // Revoke stale entitlement in the same committed transaction: after
        // rotation, old-subscription events no longer own the pending checkout.
        await tx.user.update({ where: { id: user.id }, data: {
          subscriptionStatus: "canceled", tier: "free", currentPeriodEnd: null,
          stripePriceId: null, cancelAtPeriodEnd: false,
        }, select: { id: true } });
        return { restartExpired: true } as const;
      }
    } else if (reactivate || row.checkoutKind === "paid_reactivation" || row.trialStartedAt || row.cardVerifiedAt) {
      throw new Error("PRIOR_SUBSCRIPTION_REQUIRES_REVIEW");
    }
    if (row.checkoutSessionId) {
      previous ??= await s.checkout.sessions.retrieve(row.checkoutSessionId);
      if (previous.status === "open" && previous.url) return { url: previous.url, tier: row.tier };
      if (previous.status === "complete") throw new Error("CHECKOUT_CONFIRMATION_PENDING");
      if (previous.status !== "expired") throw new Error("CHECKOUT_CONFIRMATION_PENDING");
      // Keep the selected tier and checkoutKind stable across expired retries.
      await tx.$executeRaw`UPDATE "CardTrialEnrollment" SET "checkoutAttempt"=${randomUUID()}, "checkoutAttemptStartedAt"=now(), "checkoutSessionId"=NULL, "checkoutUrl"=NULL, "checkoutExpiresAt"=NULL, "updatedAt"=now() WHERE "userId"=${user.id}`;
      return { restartExpired: true } as const;
    }
    // Stripe prunes idempotency keys after at least 24 hours. An unresolved
    // older request needs reconciliation, not blind creation with an old key.
    if (Date.now() - new Date(row.checkoutAttemptStartedAt).getTime() >= 23 * 3600_000) throw new Error("CHECKOUT_RECONCILIATION_REQUIRED");
    let customerId = row.customerId ?? user.stripeCustomerId;
    if (!customerId) {
      const customer = await s.customers.create({ email: user.email, name: user.name ?? undefined, metadata: { userId: user.id } }, { idempotencyKey: `card-trial-customer:${user.id}` });
      customerId = customer.id;
    }
    const existing = await s.subscriptions.list({ customer: customerId, status: "all", limit: 100 });
    if (existing.has_more) throw new Error("PRIOR_SUBSCRIPTION_REQUIRES_REVIEW");
    const belongsToAttempt = (sub: typeof existing.data[number]) =>
      sub.metadata?.userId === user.id && sub.metadata.policy === CARD_TRIAL_POLICY
      && sub.metadata.attempt === row.checkoutAttempt
      && sub.metadata.checkoutKind === (row.checkoutKind ?? "trial") && sub.metadata.tier === row.tier;
    // A lost response may already have created this exact attempt's subscription.
    // Replaying its still-fresh idempotency key recovers the same session. Never
    // bypass this guard for another subscription or another checkout attempt.
    if (row.checkoutKind === "paid_reactivation") {
      if (existing.data.some(sub => sub.status !== "canceled" && !belongsToAttempt(sub))) return portal();
    } else if (existing.data.some(sub => !belongsToAttempt(sub))) throw new Error("PRIOR_SUBSCRIPTION_REQUIRES_REVIEW");
    // Use the tier fixed in the durable attempt, so retries cannot change the
    // parameters associated with a Stripe idempotency key.
    const fixedPrice = tierToPriceId(row.tier);
    if (!fixedPrice) throw new Error("PRICE_UNAVAILABLE");
    const session = await s.checkout.sessions.create({
      customer: customerId, mode: "subscription", payment_method_types: ["card"],
      payment_method_collection: "always", line_items: [{ price: fixedPrice, quantity: 1 }],
      client_reference_id: user.id,
      metadata: { userId: user.id, policy: CARD_TRIAL_POLICY, attempt: row.checkoutAttempt, checkoutKind: row.checkoutKind ?? "trial" },
      subscription_data: {
        ...(row.checkoutKind === "paid_reactivation" ? {} : {
          trial_period_days: CARD_TRIAL_DAYS,
          trial_settings: { end_behavior: { missing_payment_method: "cancel" as const } },
        }),
        metadata: { userId: user.id, tier: row.tier, policy: CARD_TRIAL_POLICY, attempt: row.checkoutAttempt, checkoutKind: row.checkoutKind ?? "trial" },
      },
      custom_text: { submit: { message: row.checkoutKind === "paid_reactivation"
        ? (user.locale === "en"
          ? "Paid reactivation: no new trial. Your selected monthly plan is charged now and renews monthly unless canceled. Manage or cancel from Manage billing."
          : "Riattivazione a pagamento: nessuna nuova prova. Il piano mensile scelto viene addebitato ora e si rinnova ogni mese salvo disdetta. Gestisci o disdici da Gestisci abbonamento.")
        : user.locale === "en"
        ? "3-day limited preview: one tailored CV and cover letter; no applications sent. Your selected monthly plan renews automatically after the trial unless canceled before the displayed end date. Cancel from Manage billing."
        : "Anteprima limitata di 3 giorni: un CV e una lettera su misura; nessuna candidatura inviata. Il piano mensile scelto si rinnova automaticamente alla fine della prova salvo disdetta prima della data indicata. Disdici da Gestisci abbonamento." } },
      success_url: `${site}/start-membership?subscribed=1`, cancel_url: `${site}/start-membership?canceled=1`,
      locale: user.locale === "en" ? "en" : "it",
      // Promotions/referrals for this cohort require an explicit release
      // decision. Preserve all legacy credits; do not consume or remove them.
    }, { idempotencyKey: `card-trial-checkout:${user.id}:${row.checkoutAttempt}` });
    await tx.$executeRaw`UPDATE "CardTrialEnrollment" SET "customerId"=${customerId}, "checkoutSessionId"=${session.id}, "checkoutUrl"=${session.url}, "checkoutExpiresAt"=${new Date(session.expires_at * 1000)}, "updatedAt"=now() WHERE "userId"=${user.id}`;
    await tx.user.update({ where: { id: user.id }, data: { stripeCustomerId: customerId }, select: { id: true } });
    return { url: session.url, tier: row.tier };
  }, { timeout: 30_000 });
  if ("restartExpired" in result) return createCardTrialCheckout(user, tier, reactivate);
  return result;
}
