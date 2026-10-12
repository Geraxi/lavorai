/** Immutable rollout boundary. Once launched, never move/remove this timestamp:
 * doing so would change existing users' billing terms. Readiness is a separate
 * kill switch and must never change cohort membership. */
export const CARD_TRIAL_DAYS = 3;
export const CARD_TRIAL_POLICY = "card_preview_v1";
export function isCardTrialCohort(user: { createdAt?: Date | string | null; billingPolicy?: string | null }): boolean {
  if (user.billingPolicy === CARD_TRIAL_POLICY) return true;
  const cutoff = process.env.CARD_TRIAL_COHORT_START;
  if (!cutoff) return false; // unreleased by default
  const start = Date.parse(cutoff);
  if (!Number.isFinite(start)) throw new Error("Invalid CARD_TRIAL_COHORT_START; billing rollout is unavailable");
  if (!user.createdAt) return false; // no legacy trial can be inferred without createdAt
  return new Date(user.createdAt).getTime() >= start;
}
export function cardTrialEnrollmentAvailable(): boolean {
  return Boolean(process.env.CARD_TRIAL_COHORT_START && process.env.OPENAI_API_KEY && process.env.OPENAI_MODEL_STRONG)
    && process.env.CARD_TRIAL_PROVIDER_READY === "verified";
}
export function cardTrialHasPaidAccess(row: { status: string; paidThrough: Date | string | null }, now = Date.now()): boolean {
  return row.status === "active" && !!row.paidThrough && new Date(row.paidThrough).getTime() > now;
}
export function cardTrialHasPreviewAccess(row: { status: string; cardVerifiedAt: Date | string | null; trialEndsAt: Date | string | null }, now = Date.now()): boolean {
  return row.status === "trialing" && !!row.cardVerifiedAt && !!row.trialEndsAt && new Date(row.trialEndsAt).getTime() > now;
}
/** Setup and billing remain reachable while application/AI access is closed. */
export function isCardTrialSetupPath(path: string, method = "GET"): boolean {
  return path === "/onboarding" || path === "/start-membership" || path === "/settings"
    || path === "/api/onboarding/cv" || path === "/api/onboarding/demo"
    || path.startsWith("/api/stripe/") || path.startsWith("/api/auth/")
    || (method === "GET" && path === "/api/onboarding/status");
}
