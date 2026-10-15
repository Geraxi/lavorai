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
    tagline: "5 candidature gratuite totali, senza scadenza. Carta richiesta, nessun addebito automatico.",
    monthlyApplications: 5,
    portals: 1,
    coverLetter: "basic",
    analytics: "none",
    prioritySupport: false,
    hasFounderCoach: false,
    hasInterviewCopilot: false,
    features: [
      "5 candidature totali, senza scadenza",
      "CV e lettera su misura per ogni posizione",
      "Anteprima di CV e lettera prima dell’invio",
      "Risposte dei recruiter nella Inbox",
      "Analisi ATS del CV",
      "Carta obbligatoria, nessun abbonamento automatico",
    ],
    stripePriceIdEnv: null,
    cta: "Inizia con Free",
  },
  pro: {
    id: "pro",
    name: "Pro",
    price: 19.99,
    priceDisplay: "€19,99",
    priceSuffix: "/ mese",
    tagline: "50 candidature al mese con CV e lettera su misura.",
    monthlyApplications: 50,
    portals: 1,
    coverLetter: "basic",
    analytics: "basic",
    prioritySupport: false,
    hasFounderCoach: false,
    hasInterviewCopilot: false,
    features: [
      "50 candidature al mese",
      "Candidature automatiche sui portali supportati",
      "CV optimization AI",
      "Cover letter AI",
      "Formato DOCX",
      "Analytics base",
      "Supporto via email",
    ],
    stripePriceIdEnv: "STRIPE_PRICE_ID_PRO",
    cta: "Attiva il piano",
  },
  pro_plus: {
    id: "pro_plus",
    name: "Pro+",
    price: 39.99,
    priceDisplay: "€39.99",
    priceSuffix: "/ mese",
    tagline: "Candidature senza limite, tutti i portali supportati e Founder Coach. Disdici quando vuoi.",
    monthlyApplications: "unlimited",
    portals: "all",
    coverLetter: "advanced",
    analytics: "advanced",
    prioritySupport: true,
    hasFounderCoach: true,
    hasInterviewCopilot: true,
    features: [
      // Marker [icon] viene parsato dal pricing renderer → Icon component
      // del design system (premium, niente emoji). Vedi PricingCard.
      "[target] Founder Interview Coach (Opportunity Analyzer + Equity + Vocab)",
      "[sparkles] Interview Copilot live con teleprompter + audio capture {soon}",
      "Candidature illimitate",
      "Auto-apply su tutti gli ATS supportati (Greenhouse, Lever, Ashby, Workable, Personio, Recruitee e altri)",
      "CV optimization AI multi-variante",
      "Cover letter AI personalizzata",
      "Formato DOCX, PDF e Europass",
      "Analytics avanzata (funnel, geo, heatmap)",
      "Supporto prioritario (<4h)",
      "API access {soon}",
      "Cancelli in qualsiasi momento",
    ],
    stripePriceIdEnv: "STRIPE_PRICE_ID_PRO_PLUS",
    cta: "Attiva il piano",
    highlight: true,
    badge: "Consigliato",
  },
};

export const TIER_LIST: TierConfig[] = [TIERS.free, TIERS.pro, TIERS.pro_plus];

/** Free quota is lifetime; historical trial dates are read, never created. */
export const FREE_APPLICATION_LIMIT = 5;
export const FREE_UPGRADE_MESSAGE = "Passa a Pro, EUR 19,99/mese";
export function usesFreeQuota(user: Parameters<typeof effectiveTier>[0]): boolean {
  return effectiveTier(user) === "free";
}

// One-time transition explicitly requested on 23 September 2026. These are
// absolute timestamps: login, deployment and onboarding never restart them.
export const EARLY_USER_TRIAL_COHORT_CUTOFF = "2026-09-23T12:43:08.000Z";
export const EARLY_USER_TRIAL_FINAL_END = "2026-09-25T12:43:08.000Z";

export function trialEnd(user: { createdAt?: Date | string; trialGraceEndsAt?: Date | string | null; trialEndsAt?: Date | string | null }): Date | null {
  const createdAt = user.createdAt ? new Date(user.createdAt) : null;
  // The legacy field identifies the original extension recipients only. Its
  // stored date no longer grants any configurable/rolling grace period.
  if (createdAt && createdAt.getTime() < Date.parse(EARLY_USER_TRIAL_COHORT_CUTOFF)
      && user.trialGraceEndsAt && Number.isFinite(new Date(user.trialGraceEndsAt).getTime())) {
    return new Date(EARLY_USER_TRIAL_FINAL_END);
  }
  return user.trialEndsAt ? new Date(user.trialEndsAt) : null;
}

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
  createdAt?: Date | string;
  trialGraceEndsAt?: Date | string | null; trialEndsAt?: Date | string | null;
}): Tier {
  if (isLifetimeProPlus(user.email)) return "pro_plus";
  const base = normalizeTier(user.tier);
  // Only explicitly stored, existing trials grant Pro until their original expiry.
  if (base === "free" && (trialEnd(user)?.getTime() ?? 0) > Date.now()) return "pro";
  return base;
}

/** Stato della prova gratuita per UI/email. */
export function trialState(user: { tier?: string | null; createdAt?: Date | string;
  trialGraceEndsAt?: Date | string | null; trialEndsAt?: Date | string | null; stripeSubscriptionId?: string | null }): {
  status: "none" | "active" | "ended";
  endsAt: Date | null;
  daysLeft: number;
} {
  if (!trialEnd(user) || normalizeTier(user.tier) !== "free") return { status: "none", endsAt: null, daysLeft: 0 };
  const endsAt = trialEnd(user)!;
  const msLeft = endsAt.getTime() - Date.now();
  return { status: msLeft > 0 ? "active" : "ended", endsAt, daysLeft: Math.max(0, Math.ceil(msLeft / 86400_000)) };
}

/**
 * Cap giornaliero effettivo. Le preferenze controllano Pro/Pro+, mentre Free
 * mantiene il cap storico; il nuovo piano Free usa anche il limite lifetime al momento dell’invio.
 */
export function dailyApplicationLimit(
  user: { tier?: string | null; email?: string | null; createdAt?: Date | string;
  trialGraceEndsAt?: Date | string | null; trialEndsAt?: Date | string | null; stripeSubscriptionId?: string | null },
  preferredCap?: number | null,
): number {
  if (isLifetimeProPlus(user.email)) return Math.max(1, Math.min(100, preferredCap ?? 100));
  if (normalizeTier(user.tier) === "free") {
    return FREE_APPLICATION_LIMIT;
  }
  return Math.max(1, Math.min(100, preferredCap ?? 10));
}

/** Free pages remain accessible after quota exhaustion; sending has its own gate. */
export function isApplicationAccessPaused(
  user: { tier?: string | null; email?: string | null; createdAt?: Date | string;
  trialGraceEndsAt?: Date | string | null; trialEndsAt?: Date | string | null; stripeSubscriptionId?: string | null },
): boolean {
  return false; // Free remains accessible after quota exhaustion; only sending is gated.
}

/** A customer ID or checkout return URL is insufficient: require server-verified
 * setup completion for Free, or an existing verified paid/trial subscription. */
export function requiresPaymentMethodBeforeApp(
  user: {
    tier?: string | null;
    email?: string | null;
    createdAt?: Date | string;
    trialGraceEndsAt?: Date | string | null;
    trialEndsAt?: Date | string | null;
    subscriptionStatus?: string | null;
    cardSetupAt?: Date | string | null;
  },
): boolean {
  if (isLifetimeProPlus(user.email) || normalizeTier(user.tier) !== "free") return false;
  if (user.subscriptionStatus === "active" || user.subscriptionStatus === "trialing") return false;
  return !user.cardSetupAt;
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
    name: "Interview Copilot live (in arrivo)",
    blurb:
      "Teleprompter live durante il colloquio: audio capture da Google Meet, trascrizione automatica, suggerimenti AI in tempo reale. Funzionalità in arrivo — ti avvisiamo appena è pronta. Nel frattempo usa il Mock Interview per allenarti.",
  },
};
