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
