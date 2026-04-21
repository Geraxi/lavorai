import Stripe from "stripe";
import { TIERS, type Tier } from "@/lib/billing";

let cached: Stripe | null = null;

/**
 * Stripe client lazy. La chiave viene dall'env STRIPE_SECRET_KEY.
 * In dev puoi usare chiavi di test (sk_test_...).
 */
export function stripe(): Stripe {
  if (cached) return cached;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error(
      "STRIPE_SECRET_KEY mancante. Aggiungila a .env.local per usare il billing.",
    );
  }
  cached = new Stripe(key, { apiVersion: "2026-03-25.dahlia" });
  return cached;
}

/**
 * Mapping da Stripe priceId al tier business.
 * Letto da env in modo che lo stesso codice lavori in test e prod.
 */
export function priceIdToTier(priceId: string): Tier | null {
  if (priceId === process.env.STRIPE_PRICE_ID_PRO) return "pro";
  if (priceId === process.env.STRIPE_PRICE_ID_PRO_PLUS) return "pro_plus";
  return null;
}

export function tierToPriceId(tier: Tier): string | null {
  const cfg = TIERS[tier];
  if (!cfg.stripePriceIdEnv) return null;
  return process.env[cfg.stripePriceIdEnv] ?? null;
}
