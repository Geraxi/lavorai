/** Paths that remain usable after expiry are authentication, billing and account rights. */
const featurePages = ["dashboard", "applications", "cv", "preferences", "analytics", "inbox", "settings", "materiali", "discover", "optimize", "interview-buddy", "interview", "founder-coach", "jobs", "questions", "onboarding"];
const featureApis = ["applications", "cv", "cv-profile", "preferences", "questions", "sessions", "interview", "interview-buddy", "founder-coach", "onboarding", "optimize", "sidebar-stats", "user", "referral", "popups"];
export function requiresTrialAccess(path: string): boolean {
  // Public CV intake only stages a document for later verified login. It does
  // not optimize, mark onboarding complete, activate a trial or send anything.
  if (["/optimize", "/optimize/", "/api/optimize/stage", "/api/optimize/stage/"].includes(path)) return false;
  const parts = path.split("/");
  return parts[1] === "api" ? featureApis.includes(parts[2]) : featurePages.includes(parts[1]);
}

/**
 * Paths an expired-trial free account may still use. The cron keeps applying
 * for these users on the free weekly quota, so they must be able to answer the
 * form questions that hold their applications. Privacy consent is recorded via
 * /api/account/privacy-consent, which is not trial-gated here.
 */
const expiredTrialAllowedPaths = ["/api/questions", "/api/questions/"];
export function allowedAfterTrialExpiry(path: string): boolean {
  return expiredTrialAllowedPaths.includes(path);
}

/**
 * Where an expired-trial account lands instead of a gated page. The settings
 * consent section and the questions page have working equivalents outside the
 * app shell, so links from our emails (/settings#privacy-consent) and from
 * application holds (/questions) still let the user act. Browsers keep the
 * URL fragment across the redirect, so #privacy-consent scrolls to the form.
 */
export function expiredTrialRedirect(path: string): string {
  if (path === "/questions" || path.startsWith("/questions/")) return "/trial-expired/questions";
  return "/trial-expired";
}
