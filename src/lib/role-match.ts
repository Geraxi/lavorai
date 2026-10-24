/**
 * Role-title matching shared between /jobs browse and auto-apply cron.
 *
 * Goal: quando l'utente dichiara "Product Designer" tra i suoi ruoli,
 * deve vedere / candidarsi a "Senior Product Designer" ma NON a
 * "Product Engineer" o "Graphic Designer".
 *
 * Strategia: tokenizzo sia il titolo che il ruolo atteso, e richiedo
 * che TUTTI i token significativi del ruolo siano presenti come parole
 * intere nel titolo (case-insensitive). Token < 3 caratteri e stopword
 * comuni (senior, junior, lead, staff, principal, ecc.) non contano.
 */

const STOPWORDS = new Set([
  "senior",
  "junior",
  "jr",
  "sr",
  "lead",
  "staff",
  "principal",
  "mid",
  "entry",
  "intern",
  "stage",
  "stagista",
  "il",
  "la",
  "di",
  "da",
  "a",
  "e",
  "the",
  "of",
  "for",
  "and",
  "to",
  "in",
  "on",
  "with",
  "remote",
  "remoto",
  "full-time",
  "part-time",
  "contract",
]);

/** "Full-Stack"/"Full Stack"/"Fullstack" are one word for matching. */
export function canonicalCompounds(s: string): string {
  return s
    .replace(/\bfull[\s-]?stack\b/gi, "fullstack")
    .replace(/\bfront[\s-]?end\b/gi, "frontend")
    .replace(/\bback[\s-]?end\b/gi, "backend");
}

/** Developer, Dev and Engineer name the same job in titles ("Full-Stack
 * Developer" = "Fullstack Engineer"). "Engineering"/"Development" are not
 * included: they are departments ("Engineering Manager"). */
export const ENGINEER_SYNONYMS = new Set([
  "engineer", "engineers", "developer", "developers", "dev", "devs",
  "sviluppatore", "sviluppatori", "sviluppatrice", "programmer", "programmers",
]);

function tokenize(s: string): string[] {
  return canonicalCompounds(s)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Stem leggero italiano + inglese: rimuove desinenze comuni così che
 * "designer" matchi "design", "designers"; "engineer" matchi "engineering",
 * ecc. NON aggressivo: solo le terminazioni più frequenti.
 */
function stem(t: string): string {
  if (t.length < 5) return t;
  // -ers, -ors, -ings, -ions plurale
  if (t.endsWith("ers")) return t.slice(0, -3);
  if (t.endsWith("ors")) return t.slice(0, -3);
  if (t.endsWith("ings")) return t.slice(0, -4);
  if (t.endsWith("ions")) return t.slice(0, -4);
  // -er, -or → -e (designer → design, engineer → enginee → cap a 5+)
  if (t.endsWith("er") && t.length > 5) return t.slice(0, -2);
  if (t.endsWith("or") && t.length > 5) return t.slice(0, -2);
  // -ing, -ion
  if (t.endsWith("ing") && t.length > 5) return t.slice(0, -3);
  if (t.endsWith("ion") && t.length > 5) return t.slice(0, -3);
  // plurali italiani semplici (-i / -e finale dopo radice ≥4)
  if ((t.endsWith("i") || t.endsWith("e")) && t.length > 5) return t.slice(0, -1);
  // plurale inglese -s
  if (t.endsWith("s") && t.length > 4) return t.slice(0, -1);
  return t;
}

/** Two-letter role acronyms that carry the meaning of a title: without them
 * "AI Engineer" reduced to "Engineer" and matched every engineering job. */
export const ROLE_ACRONYMS = new Set(["ai", "ml", "ui", "ux", "qa", "bi", "ki", "ia", "ar", "vr"]);

export function significantTokens(s: string): string[] {
  return tokenize(s).filter((t) => (t.length >= 3 || ROLE_ACRONYMS.has(t)) && !STOPWORDS.has(t));
}

const INTERNSHIP_WORDS = new Set([
  "intern", "interns", "internship", "internships",
  "tirocinio", "tirocini", "tirocinante", "tirocinanti",
  "stagista", "stagisti", "stagiare",
  "werkstudent", "werkstudents",
]);
const STAGE_PREFIX = new Set(["early", "late", "multi", "growth", "next", "on", "off", "seed"]);

/** Internship / stage / tirocinio / working-student titles — not "early-stage". */
export function isInternshipTitle(s: string): boolean {
  const tokens = tokenize(s);
  if (tokens.some((t) => INTERNSHIP_WORDS.has(t))) return true;
  const joined = tokens.join(" ");
  if (/\bworking student\b/.test(joined) || /\bstudent worker\b/.test(joined)) return true;
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i] === "stage" && !STAGE_PREFIX.has(tokens[i - 1] ?? "")) return true;
  }
  return false;
}

function wantsInternship(roles: string[], seniority?: string | null): boolean {
  if (seniority && isInternshipTitle(seniority)) return true;
  return roles.some((role) => isInternshipTitle(role));
}

/**
 * True se il titolo contiene tutti i token significativi del ruolo.
 * Match con stemming leggero — "Product Designer" matcha "Product Design
 * Lead", "Product Designers", "Product Design Manager".
 * Internship / intern / stage / tirocinio / working-student titles match
 * only when the selected role or seniority itself asks for internships.
 */
export function titleMatchesRole(title: string, role: string, seniority?: string | null): boolean {
  if (isInternshipTitle(title) && !wantsInternship([role], seniority)) return false;
  const roleTokens = significantTokens(role);
  if (roleTokens.length === 0) return isInternshipTitle(title) && wantsInternship([role], seniority);
  const key = (t: string) => (ENGINEER_SYNONYMS.has(t) ? "#engineer" : stem(t));
  const titleStems = new Set(tokenize(title).map(key));
  return roleTokens.every((rt) => titleStems.has(key(rt)));
}

/** True se almeno uno dei ruoli combacia col titolo. */
export function titleMatchesAnyRole(title: string, roles: string[], seniority?: string | null): boolean {
  if (isInternshipTitle(title) && !wantsInternship(roles, seniority)) return false;
  for (const r of roles) {
    if (titleMatchesRole(title, r, seniority)) return true;
  }
  return false;
}
