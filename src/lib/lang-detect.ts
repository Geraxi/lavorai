/**
 * Rilevatore lingua IT vs EN semplice a stop-words.
 * Ritorna "it" | "en" con fallback "it" su empate/testo vuoto.
 */

const IT_WORDS = [
  "il","la","lo","gli","le","di","da","del","della","e","ed","per","con","su",
  "un","una","che","non","sono","siamo","azienda","lavoro","ruolo","anni",
  "esperienza","richiesta","offriamo","cerchiamo","stiamo","candidato","candidatura",
  "competenze","conoscenza","capacità","team","sviluppo","progetto","ingegnere",
  "sviluppatore","gestione","responsabile","italiano","italia",
];

const EN_WORDS = [
  "the","and","of","to","in","is","are","for","with","on","as","we","our",
  "you","your","a","an","experience","years","role","job","team","developer",
  "engineer","project","required","requirements","responsibilities","skills",
  "about","company","work","will","should","must","candidate","looking","hiring",
];

export function detectLanguage(text: string): "it" | "en" {
  if (!text) return "it";
  const tokens = text
    .toLowerCase()
    .replace(/[^a-zàèéìòù\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  const itSet = new Set(IT_WORDS);
  const enSet = new Set(EN_WORDS);
  let it = 0;
  let en = 0;
  for (const t of tokens) {
    if (itSet.has(t)) it++;
    if (enSet.has(t)) en++;
  }
  // Piccolo bias pro-IT: in caso di pareggio teniamo italiano.
  return en > it ? "en" : "it";
}
