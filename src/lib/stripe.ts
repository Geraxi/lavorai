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
/** Legge un price ID dall'env ripulito da spazi/newline (copia-incolla su Vercel). */
function envPriceId(name: string | null | undefined): string | null {
  if (!name) return null;
  const v = process.env[name]?.trim();
  return v ? v : null;
}

export function priceIdToTier(priceId: string): Tier | null {
  const id = priceId.trim();
  if (!id) return null;
  if (id === envPriceId("STRIPE_PRICE_ID_PRO")) return "pro";
  if (id === envPriceId("STRIPE_PRICE_ID_PRO_PLUS")) return "pro_plus";
  return null;
}

export function tierToPriceId(tier: Tier): string | null {
  return envPriceId(TIERS[tier].stripePriceIdEnv);
}


/** Coupon referral: 1 mese gratis (100%, una volta). Creato al volo se manca. */
export const REFERRAL_COUPON_ID = "LAVORAI-REFERRAL-1M";
export async function ensureReferralCoupon(s: Stripe): Promise<string> {
  try {
    await s.coupons.retrieve(REFERRAL_COUPON_ID);
  } catch {
    await s.coupons.create({ id: REFERRAL_COUPON_ID, percent_off: 100, duration: "once", name: "Referral · 1 mese gratis" });
  }
  return REFERRAL_COUPON_ID;
}
