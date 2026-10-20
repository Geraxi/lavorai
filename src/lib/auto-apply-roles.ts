/**
 * Role titles that drive the auto-apply candidate search.
 *
 * Saved roles (preferences.rolesJson) are the user's explicit search intent and
 * are the only source when present. Session ("round") titles are a fallback
 * for legacy accounts without saved roles, and they are filtered: many were
 * created from ATS department names ("Product", "Engineering", "8569
 * Merchantxp - Pm", "It Jobs"), and a one-word department title matches
 * thousands of unrelated postings (Stripe "Product Counsel", "Account
 * Executive, Product"), which filled the 200-job pool with irrelevant jobs.
 */
const JUNK_ROLE_TITLES = new Set([
  "product", "engineering", "ai", "ki", "ia", "remote", "remoto", "generico", "generic", "general",
  "unknown", "altro", "other", "others", "misc", "it", "it jobs", "jobs", "all", "tutti",
  "design", "marketing", "sales", "operations", "finance", "legal", "people", "people team",
  "business development", "security compliance", "enterprise applications", "creative design",
  "office of cpo", "product operations", "product management", "engineering product and design",
  "core devops", "web ui ux design", "ml foundations", "subscriptions", "web presence platform",
]);

const DEPARTMENT_SUFFIX = /\b(team|department|dept|office|division|org|organization|platform|foundations)$/i;
/** Real job titles name a role ("engineer", "manager", "designer"…). */
const ROLE_NOUN = /\b(engineer|developer|designer|manager|lead|head|director|architect|analyst|scientist|consultant|specialist|founder|cto|ceo|vp|officer|administrator|admin|researcher|writer|marketer|recruiter|representative|executive|associate|intern|sviluppatore|sviluppatrice|ingegnere|progettista|responsabile|programmatore)s?\b/i;

export function isJunkSessionTitle(raw: string): boolean {
  const t = raw.trim().replace(/\s+/g, " ");
  if (!t || t.includes("·")) return true;
  if (/\d/.test(t)) return true; // ATS department codes: "8569 Merchantxp - Pm"
  if (/(?:^|\s-\s|\s)(pm|pmm)$/i.test(t) && !/\bproduct manager\b/i.test(t)) return true;
  const key = t.toLowerCase();
  if (JUNK_ROLE_TITLES.has(key)) return true;
  if (DEPARTMENT_SUFFIX.test(t) && !ROLE_NOUN.test(t)) return true;
  // One or two generic words with no role noun ("Creative Design", "Risk").
  return !ROLE_NOUN.test(t) && t.split(" ").length <= 3;
}

function addRole(out: Map<string, string>, raw: unknown) {
  if (typeof raw !== "string") return;
  const t = raw.trim();
  if (t && !out.has(t.toLowerCase())) out.set(t.toLowerCase(), t);
}

/** Lowercase key → display title, in priority order. */
export function searchRoleTitles(
  rolesJson: string | null | undefined,
  sessions: { title: string | null; label: string; sentCount: number; targetCount: number }[],
): Map<string, string> {
  const out = new Map<string, string>();
  try {
    const arr: unknown = JSON.parse(rolesJson ?? "[]");
    if (Array.isArray(arr)) for (const r of arr) addRole(out, r);
  } catch { /* malformed → fallback */ }
  if (out.size) return out;
  for (const s of sessions) {
    if (s.sentCount >= s.targetCount) continue;
    const t = (s.title ?? s.label).trim();
    if (!isJunkSessionTitle(t)) addRole(out, t);
  }
  return out;
}
