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

  // Premium feature gates (true = incluso nel tier)
  /** Modulo Founder Coach (Opportunity Analyzer + Equity + Vocab + ...) */
  hasFounderCoach: boolean;
  /** Interview Copilot live (teleprompter + Whisper + auto-question detect) */
  hasInterviewCopilot: boolean;

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
    tagline: "Prova il sistema. Vedi le candidature partire da sole.",
    monthlyApplications: 3,
    portals: 0,
    coverLetter: "basic",
    analytics: "none",
    prioritySupport: false,
    hasFounderCoach: false,
    hasInterviewCopilot: false,
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
    tagline: "Per chi cerca attivamente. 50 candidature al mese, zero sforzo.",
    monthlyApplications: 50,
    portals: 1,
    coverLetter: "basic",
    analytics: "basic",
    prioritySupport: false,
    hasFounderCoach: false,
    hasInterviewCopilot: false,
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
    tagline: "Modalità full-auto. LavorAI gira 24/7 su ogni portale italiano.",
    monthlyApplications: "unlimited",
    portals: "all",
    coverLetter: "advanced",
    analytics: "advanced",
    prioritySupport: true,
    hasFounderCoach: true,
    hasInterviewCopilot: true,
    features: [
      "🎯 Founder Interview Coach (Opportunity Analyzer + Equity + Vocab)",
      "🎤 Interview Copilot live con teleprompter + audio capture",
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
    badge: "Scelto dall'83% di chi trova lavoro con LavorAI",
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
 *
 * Le email vengono canonicalizzate prima del match (vedi canonicalEmail):
 *  - Gmail: punti e "+tag" sono ignorati → foo.bar+x@gmail.com == foobar@gmail.com
 *  - googlemail.com trattato come gmail.com
 *  - Altri provider: solo lowercase + trim
 */
const LIFETIME_PRO_PLUS_EMAILS_RAW = [
  "antonella.lasalandra07@gmail.com",
  "umbertogeraci0@gmail.com",
];

function canonicalEmail(raw: string): string {
  const trimmed = raw.trim().toLowerCase();
  const at = trimmed.lastIndexOf("@");
  if (at < 0) return trimmed;
  let local = trimmed.slice(0, at);
  let domain = trimmed.slice(at + 1);
  // Strip +tag (Gmail-style plus addressing) — valido su molti provider
  const plus = local.indexOf("+");
  if (plus >= 0) local = local.slice(0, plus);
  if (domain === "googlemail.com") domain = "gmail.com";
  if (domain === "gmail.com") {
    // Gmail ignora i punti nel local part
    local = local.replace(/\./g, "");
  }
  return `${local}@${domain}`;
}

const LIFETIME_PRO_PLUS_EMAILS = new Set<string>(
  LIFETIME_PRO_PLUS_EMAILS_RAW.map(canonicalEmail),
);

export function isLifetimeProPlus(email: string | null | undefined): boolean {
  if (!email) return false;
  return LIFETIME_PRO_PLUS_EMAILS.has(canonicalEmail(email));
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

/**
 * Feature gate set: tutte le entitlement check le centralizziamo qui
 * così UI, server e API leggono dalla stessa logica. Aggiungere una
 * nuova feature premium = aggiungere una entry sotto + un boolean
 * sui TierConfig sopra. Niente if-tier sparsi nel codebase.
 */
export type PremiumFeature = "founder_coach" | "interview_copilot";

const FEATURE_TIER_REQUIRED: Record<PremiumFeature, Tier> = {
  founder_coach: "pro_plus",
  interview_copilot: "pro_plus",
};

export function canAccess(
  user: { tier?: string | null; email?: string | null },
  feature: PremiumFeature,
): boolean {
  const eff = effectiveTier(user);
  const required = FEATURE_TIER_REQUIRED[feature];
  // Ordine: free < pro < pro_plus
  const rank: Record<Tier, number> = { free: 0, pro: 1, pro_plus: 2 };
  return rank[eff] >= rank[required];
}

export function requiredTierFor(feature: PremiumFeature): Tier {
  return FEATURE_TIER_REQUIRED[feature];
}

/** UX copy helper per il paywall in-page */
export const FEATURE_LABELS: Record<PremiumFeature, { name: string; blurb: string }> = {
  founder_coach: {
    name: "Founder Interview Coach",
    blurb:
      "Opportunity Analyzer, Equity Coach, Negotiation Scripts e vocabolario founder-level. Pensato per CTO, Tech Co-Founder e ruoli AI Builder.",
  },
  interview_copilot: {
    name: "Interview Copilot live",
    blurb:
      "Teleprompter live durante il colloquio: audio capture da Google Meet via Chrome extension, Whisper trascrizione automatica, suggerimenti AI in <3s.",
  },
};
