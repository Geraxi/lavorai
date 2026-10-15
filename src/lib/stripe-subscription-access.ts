import type Stripe from "stripe";

export const CARD_REQUIRED_CHECKOUT = "onboarding_v1";

type ExistingAccess = { stripeSubscriptionId: string | null; subscriptionStatus: string | null } | null;

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
