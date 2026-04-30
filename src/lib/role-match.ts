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

function tokenize(s: string): string[] {
  return s
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

function significantTokens(s: string): string[] {
  return tokenize(s).filter((t) => t.length >= 3 && !STOPWORDS.has(t));
}

/**
 * True se il titolo contiene tutti i token significativi del ruolo.
 * Match con stemming leggero — "Product Designer" matcha "Product Design
 * Lead", "Product Designers", "Product Design Manager".
 */
export function titleMatchesRole(title: string, role: string): boolean {
  const roleTokens = significantTokens(role);
  if (roleTokens.length === 0) return false;
  const titleStems = new Set(tokenize(title).map(stem));
  return roleTokens.every((rt) => titleStems.has(stem(rt)));
}

/** True se almeno uno dei ruoli combacia col titolo. */
export function titleMatchesAnyRole(title: string, roles: string[]): boolean {
  for (const r of roles) {
    if (titleMatchesRole(title, r)) return true;
  }
  return false;
}
