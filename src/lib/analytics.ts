/**
 * Single source of truth per gli analytics event della landing page e
 * del funnel di conversione. Ogni interazione tracciata deve usare un
 * `AnalyticsEvent` definito qui — niente magic string nei componenti.
 *
 * Quando colleghi un provider reale (PostHog / Plausible / Vercel
 * Analytics / GA4), sostituisci `trackEvent` con la chiamata effettiva.
 * Per ora è un wrapper console + window.dataLayer (GTM-friendly).
 */

export const AnalyticsEvent = {
  // Hero & CTA architecture
  HERO_CTA_PRIMARY: "hero_cta_primary_click",
  HERO_CTA_SECONDARY: "hero_cta_secondary_click",
  CTA_FINAL: "final_cta_click",
  STICKY_CTA: "sticky_cta_click",
  NAV_SIGNUP: "nav_signup_click",
  NAV_LOGIN: "nav_login_click",

  // Lead magnet (free CV audit at /optimize)
  LEAD_MAGNET_OPEN: "lead_magnet_open",
  LEAD_MAGNET_START: "lead_magnet_start",
  LEAD_MAGNET_SUBMIT: "lead_magnet_submit",
  LEAD_MAGNET_RESULT_VIEW: "lead_magnet_result_view",
  LEAD_MAGNET_UPGRADE: "lead_magnet_upgrade_click",

  // Pricing
  PRICING_VIEW: "pricing_section_view",
  PRICING_CTA: "pricing_cta_click",
  PRICING_TOGGLE: "pricing_period_toggle",

  // Signup funnel
  SIGNUP_START: "signup_start",
  SIGNUP_SUBMIT: "signup_submit",
  SIGNUP_SUCCESS: "signup_success",
  SIGNUP_FAIL: "signup_fail",
  EMAIL_VERIFY_OPEN: "email_verify_open",

  // Proof / content interactions
  FAQ_EXPAND: "faq_expand",
  TESTIMONIAL_INTERACT: "testimonial_interact",
  BOUNDARIES_VIEW: "automation_boundaries_view",
  TRUST_SECTION_VIEW: "trust_section_view",

  // Referral (placeholder for future)
  REFERRAL_INVITE_OPEN: "referral_invite_open",
  REFERRAL_INVITE_SHARE: "referral_invite_share",

  // Language
  LANGUAGE_SWITCH: "language_switch",
} as const;

export type AnalyticsEventName =
  (typeof AnalyticsEvent)[keyof typeof AnalyticsEvent];

type EventPayload = Record<string, string | number | boolean | null | undefined>;

declare global {
  interface Window {
    dataLayer?: Array<Record<string, unknown>>;
  }
}

/**
 * Traccia un evento. In dev logga su console; in prod pusha su
 * `window.dataLayer` (GTM-compatibile) e tenta un beacon su
 * `/api/analytics/event` se configurato. Nessuna dipendenza terza —
 * si può rimpiazzare con PostHog/Plausible quando deciso.
 */
export function trackEvent(
  name: AnalyticsEventName,
  payload?: EventPayload,
): void {
  if (typeof window === "undefined") return;
  const event = {
    event: name,
    ts: Date.now(),
    ...payload,
  };

  if (process.env.NODE_ENV !== "production") {
    // eslint-disable-next-line no-console
    console.debug("[analytics]", name, payload ?? {});
  }

  try {
    window.dataLayer = window.dataLayer ?? [];
    window.dataLayer.push(event);
  } catch {
    /* sandboxed iframe / quota */
  }
}

/**
 * Hook helper per tracciare un view-event UNA volta sola quando il
 * componente diventa visibile (IntersectionObserver). Da usare in
 * sezioni "view di pagina" come pricing, trust, boundaries.
 *
 * Esempio:
 *   useEffect(() => {
 *     const cleanup = observeOnce(ref.current, () =>
 *       trackEvent(AnalyticsEvent.PRICING_VIEW)
 *     );
 *     return cleanup;
 *   }, []);
 */
export function observeOnce(
  el: Element | null,
  cb: () => void,
  threshold = 0.4,
): () => void {
  if (!el || typeof IntersectionObserver === "undefined") {
    cb();
    return () => void 0;
  }
  let fired = false;
  const obs = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!fired && entry.isIntersecting) {
          fired = true;
          cb();
          obs.disconnect();
          return;
        }
      }
    },
    { threshold },
  );
  obs.observe(el);
  return () => obs.disconnect();
}
