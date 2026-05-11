/**
 * Decodifica HTML entities + strip tag + collassa whitespace.
 * Usato dagli scraper ATS prima di salvare la `description` in DB.
 *
 * Era stato un bug visibile in /discover: alcune sorgenti (Greenhouse,
 * Ashby) restituiscono HTML già escaped (`&lt;div&gt;...&lt;/p&gt;`),
 * il regex `replace(/<[^>]+>/g, " ")` non match-ava quei tag escaped
 * → il testo finale conteneva visibile `&lt;div class=&quot;...`.
 */
const ENTITY_MAP: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&nbsp;": " ",
  "&ndash;": "–",
  "&mdash;": "—",
  "&hellip;": "…",
  "&laquo;": "«",
  "&raquo;": "»",
  "&copy;": "©",
  "&reg;": "®",
  "&trade;": "™",
  "&euro;": "€",
  "&pound;": "£",
  "&yen;": "¥",
};

export function decodeHtmlEntities(input: string): string {
  if (!input) return "";
  let s = input;
  // Named entities note
  for (const [entity, ch] of Object.entries(ENTITY_MAP)) {
    if (s.includes(entity)) s = s.split(entity).join(ch);
  }
  // Numeric decimal entities (&#123;)
  s = s.replace(/&#(\d+);/g, (_, code) => {
    const n = Number(code);
    return Number.isFinite(n) ? String.fromCodePoint(n) : _;
  });
  // Numeric hex entities (&#x1F;)
  s = s.replace(/&#x([0-9a-f]+);/gi, (_, code) => {
    const n = parseInt(code, 16);
    return Number.isFinite(n) ? String.fromCodePoint(n) : _;
  });
  return s;
}

/**
 * Pulizia completa di un blob HTML grezzo:
 *   1. Decode entities  → "&lt;p&gt;" diventa "<p>"
 *   2. Strip tags        → "<p>foo</p>" diventa " foo "
 *   3. Re-decode         → cattura entities annidate dopo strip
 *   4. Collassa spazi    → "  foo  bar  " diventa "foo bar"
 */
export function cleanHtmlText(input: string | null | undefined): string {
  if (!input) return "";
  let s = decodeHtmlEntities(input);
  s = s.replace(/<[^>]+>/g, " ");
  s = decodeHtmlEntities(s);
  s = s.replace(/\s+/g, " ").trim();
  return s;
}
