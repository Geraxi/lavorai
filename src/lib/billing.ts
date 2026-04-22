/**
 * Subscription tier definitions + entitlements.
 * Singolo source of truth — UI, paywall middleware, e Stripe pricing
 * leggono da qui.
 */

export type Tier = "free" | "pro" | "pro_plus";

export interface TierConfig {
  id: Tier;
  name: string;
  price: number; // EUR
  priceDisplay: string;
  priceSuffix: string;
  tagline: string;

  // Limits
  monthlyApplications: number | "unlimited";
  portals: number | "all";
  coverLetter: "none" | "basic" | "advanced";
  analytics: "none" | "basic" | "advanced";
  prioritySupport: boolean;

  // Features (per landing bullet list, in ordine)
  features: string[];

  // Stripe price ID (set via env in prod)
  stripePriceIdEnv: string | null;

  // CTA copy
  cta: string;
  highlight?: boolean;
  badge?: string;
}

export const TIERS: Record<Tier, TierConfig> = {
  free: {
    id: "free",
    name: "Free",
    price: 0,
    priceDisplay: "€0",
    priceSuffix: "",
    tagline: "Per iniziare senza rischi.",
    monthlyApplications: 3,
    portals: 0,
    coverLetter: "basic",
    analytics: "none",
    prioritySupport: false,
    features: [
      "3 candidature totali",
      "CV optimization AI",
      "Cover letter generata",
      "Formato DOCX",
      "Supporto via community",
    ],
    stripePriceIdEnv: null,
    cta: "Inizia gratis",
  },
  pro: {
    id: "pro",
    name: "Pro",
    price: 19.99,
    priceDisplay: "€19.99",
    priceSuffix: "/ mese",
    tagline: "Per candidature regolari.",
    monthlyApplications: 50,
    portals: 1,
    coverLetter: "basic",
    analytics: "basic",
    prioritySupport: false,
    features: [
      "50 candidature al mese",
      "Auto-apply su 1 portale a scelta",
      "CV optimization AI",
      "Cover letter AI",
      "Formato DOCX",
      "Analytics base",
      "Supporto via email",
    ],
    stripePriceIdEnv: "STRIPE_PRICE_ID_PRO",
    cta: "Scegli Pro",
  },
  pro_plus: {
    id: "pro_plus",
    name: "Pro+",
    price: 39.99,
    priceDisplay: "€39.99",
    priceSuffix: "/ mese",
    tagline: "Tutto incluso, zero limiti.",
    monthlyApplications: "unlimited",
    portals: "all",
    coverLetter: "advanced",
    analytics: "advanced",
    prioritySupport: true,
    features: [
      "Candidature illimitate",
      "Auto-apply su tutti i portali (LinkedIn, InfoJobs, Indeed, Subito)",
      "CV optimization AI multi-variante",
      "Cover letter AI personalizzata",
      "Formato DOCX, PDF e Europass",
      "Analytics avanzata (funnel, geo, heatmap)",
      "Supporto prioritario (<4h)",
      "API access (in arrivo)",
      "Cancelli in qualsiasi momento",
    ],
    stripePriceIdEnv: "STRIPE_PRICE_ID_PRO_PLUS",
    cta: "Scegli Pro+",
    highlight: true,
    badge: "Più scelto",
  },
};

export const TIER_LIST: TierConfig[] = [TIERS.free, TIERS.pro, TIERS.pro_plus];

/**
 * Ritorna i limiti effettivi per un tier.
 */
export function getLimits(tier: Tier): {
  monthlyApplications: number;
  portals: number;
  hasAdvancedAnalytics: boolean;
  hasPrioritySupport: boolean;
} {
  const t = TIERS[tier];
  return {
    monthlyApplications:
      t.monthlyApplications === "unlimited" ? Infinity : t.monthlyApplications,
    portals: t.portals === "all" ? Infinity : t.portals,
    hasAdvancedAnalytics: t.analytics === "advanced",
    hasPrioritySupport: t.prioritySupport,
  };
}

/**
 * Helper UI: ritorna il tier corretto da stringa DB.
 */
export function normalizeTier(t: string | null | undefined): Tier {
  if (t === "pro" || t === "pro_plus") return t;
  return "free";
}

/**
 * Whitelist di email con accesso Pro+ permanente senza pagamento.
 * Bypassa paywall, rate limit mensile, gate di feature premium.
 * Aggiungere email SOLO qui (lowercase) — non in DB — così non c'è modo
 * di trasformarsi in Pro+ senza un deploy.
 */
const LIFETIME_PRO_PLUS_EMAILS = new Set<string>([
  "antonella.lasalandra.07@gmail.com",
  "umbertogeraci0@gmail.com",
]);

export function isLifetimeProPlus(email: string | null | undefined): boolean {
  if (!email) return false;
  return LIFETIME_PRO_PLUS_EMAILS.has(email.trim().toLowerCase());
}

/**
 * Ritorna il tier effettivo per un utente, considerando la whitelist.
 * Usare questo ovunque si prenda la decisione "può l'utente X fare Y?"
 * invece di `normalizeTier(user.tier)`.
 */
export function effectiveTier(user: {
  tier?: string | null;
  email?: string | null;
}): Tier {
  if (isLifetimeProPlus(user.email)) return "pro_plus";
  return normalizeTier(user.tier);
}
