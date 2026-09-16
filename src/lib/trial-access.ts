/** Paths that remain usable after expiry are authentication, billing and account rights. */
const featurePages = ["dashboard", "applications", "cv", "preferences", "analytics", "inbox", "settings", "materiali", "discover", "optimize", "interview-buddy", "interview", "founder-coach", "jobs", "questions", "onboarding"];
const featureApis = ["applications", "cv", "cv-profile", "preferences", "questions", "sessions", "interview", "interview-buddy", "founder-coach", "onboarding", "optimize", "sidebar-stats", "user", "referral", "popups"];
export function requiresTrialAccess(path: string): boolean {
  const parts = path.split("/");
  return parts[1] === "api" ? featureApis.includes(parts[2]) : featurePages.includes(parts[1]);
}
