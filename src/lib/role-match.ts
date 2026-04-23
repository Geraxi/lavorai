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

function significantTokens(s: string): string[] {
  return tokenize(s).filter((t) => t.length >= 3 && !STOPWORDS.has(t));
}

/** True se il titolo contiene tutti i token significativi del ruolo. */
export function titleMatchesRole(title: string, role: string): boolean {
  const roleTokens = significantTokens(role);
  if (roleTokens.length === 0) return false;
  const titleTokens = new Set(tokenize(title));
  return roleTokens.every((t) => titleTokens.has(t));
}

/** True se almeno uno dei ruoli combacia col titolo. */
export function titleMatchesAnyRole(title: string, roles: string[]): boolean {
  for (const r of roles) {
    if (titleMatchesRole(title, r)) return true;
  }
  return false;
}
