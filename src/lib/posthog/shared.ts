export const CONSENT_KEY = "lavorai-cookie-consent";
export const CONSENT_EVENT = "lavorai-consent-changed";
export const CONSENT_COOKIE = "lv_analytics_consent";
export type FunnelEvent =
  | "signup_started" | "signup_completed" | "plan_selected"
  | "card_setup_started" | "card_setup_completed" | "application_preview_viewed"
  | "application_sent" | "free_quota_exhausted" | "upgrade_wall_viewed"
  | "upgrade_clicked" | "subscription_started";
export type FunnelProperties = { plan?: string; target_plan?: string; free_remaining?: number };

/** Explicit allowlist: never forward arbitrary business payloads to PostHog. */
export function safeProperties(properties: FunnelProperties = {}): FunnelProperties {
  const plans = ["free", "pro", "pro_plus"];
  return {
    ...(properties.plan && plans.includes(properties.plan) ? { plan: properties.plan } : {}),
    ...(properties.target_plan && plans.includes(properties.target_plan) ? { target_plan: properties.target_plan } : {}),
    ...(typeof properties.free_remaining === "number" && Number.isFinite(properties.free_remaining)
      ? { free_remaining: Math.max(0, properties.free_remaining) } : {}),
  };
}
