import type { Tier } from "@/lib/billing";
import type Stripe from "stripe";
import type { Prisma } from "@prisma/client";

export const CARD_REQUIRED_CHECKOUT = "onboarding_v1";

type ExistingAccess = { stripeSubscriptionId: string | null; subscriptionStatus: string | null; tier?: string; stripePriceId?: string | null } | null;

/** Called only with the current subscription retrieved from Stripe on the server. */
export function subscriptionAccessStatus(sub: Stripe.Subscription, existing: ExistingAccess = null): string {
  if (sub.pause_collection) return "paused";
  // Existing subscriptions retain their entitlements. For this checkout version,
  // active/trialing can only be stored after card verification. Keep that proof
  // for the SAME subscription when a card is later replaced or removed.
  if (!["active", "trialing"].includes(sub.status) || sub.metadata.cardRequired !== CARD_REQUIRED_CHECKOUT) return sub.status;
  if (existing?.stripeSubscriptionId === sub.id && ["active", "trialing"].includes(existing.subscriptionStatus ?? "")) return sub.status;
  const setup = sub.pending_setup_intent;
  if (setup && (typeof setup === "string" || setup.status !== "succeeded")) return "pending_payment_method";
  const customer = typeof sub.customer === "object" && !sub.customer.deleted ? sub.customer : null;
  const method = sub.default_payment_method ?? customer?.invoice_settings.default_payment_method;
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const owner = method && typeof method === "object"
    ? typeof method.customer === "string" ? method.customer : method.customer?.id
    : null;
  return method && typeof method === "object" && method.type === "card" && owner === customerId
    ? sub.status : "pending_payment_method";
}

export const CARD_VERIFICATION_EXPAND = [
  "default_payment_method", "customer.invoice_settings.default_payment_method", "pending_setup_intent",
];

/** Applied in the database write as well as the earlier snapshot check. */
export function subscriptionAccessWriteGuard(existing: ExistingAccess): Prisma.UserWhereInput {
  // The caller reads this snapshot BEFORE retrieving Stripe. If cancellation or
  // another grant wins meanwhile, retry instead of overwriting its newer state.
  return {
    stripeSubscriptionId: existing?.stripeSubscriptionId ?? null,
    subscriptionStatus: existing?.subscriptionStatus ?? null,
  };
}

/** Rotating the current Pro Price must not revoke an existing subscription or trial. */
export function subscriptionTier(priceId: string | undefined, mapped: Tier | null, subscriptionId: string, existing: ExistingAccess): Tier {
  if (mapped) return mapped;
  if (priceId && existing?.stripeSubscriptionId === subscriptionId && existing.stripePriceId === priceId
    && (existing.tier === "pro" || existing.tier === "pro_plus")) return existing.tier;
  return "free";
}
