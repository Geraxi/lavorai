/**
 * Parsing tollerante dell'output JSON dei modelli.
 *
 * Errori reali visti in produzione:
 *  - "Unexpected token '`', \"```json" → fence non all'inizio/fine esatto
 *    del testo (preambolo tipo "Ecco il JSON:" o coda dopo la fence);
 *  - "Bad control character in string literal" → newline/tab grezzi dentro
 *    una stringa (summary lunghi con a capo).
 *
 * Strategia: 1) togli le fence ovunque, 2) isola il primo blocco {…}/[…]
 * bilanciato, 3) JSON.parse; se fallisce, 4) escapa i caratteri di controllo
 * che compaiono dentro le stringhe e riprova.
 */
export function parseModelJson<T = unknown>(text: string): T {
  const candidates = [extractJsonBlock(stripFences(text))];
  candidates.push(escapeControlCharsInStrings(candidates[0]));
  let lastErr: unknown;
  for (const c of candidates) {
    try {
      return JSON.parse(c) as T;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

export function stripFences(text: string): string {
  return text.replace(/```(?:json|JSON)?\s*/g, "").replace(/```/g, "").trim();
}

/** Primo oggetto/array JSON bilanciato nel testo (ignora preamboli e code). */
export function extractJsonBlock(text: string): string {
  const start = (() => {
    const i = text.indexOf("{");
    const j = text.indexOf("[");
    if (i < 0) return j;
    if (j < 0) return i;
    return Math.min(i, j);
  })();
  if (start < 0) return text.trim();
  const open = text[start];
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let k = start; k < text.length; k++) {
    const ch = text[k];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) return text.slice(start, k + 1);
    }
  }
  // Non bilanciato (output troncato): restituisci dall'inizio, fallirà con un errore chiaro.
  return text.slice(start).trim();
}

/** Escapa \n \r \t e altri control char SOLO dentro le stringhe JSON. */
export function escapeControlCharsInStrings(json: string): string {
  let out = "";
  let inStr = false;
  let esc = false;
  for (const ch of json) {
    if (inStr) {
      if (esc) {
        esc = false;
        out += ch;
        continue;
      }
      if (ch === "\\") {
        esc = true;
        out += ch;
        continue;
      }
      if (ch === '"') {
        inStr = false;
        out += ch;
        continue;
      }
      const code = ch.charCodeAt(0);
      if (code < 0x20) {
        out += ch === "\n" ? "\\n" : ch === "\r" ? "\\r" : ch === "\t" ? "\\t" : "";
        continue;
      }
      out += ch;
      continue;
    }
    if (ch === '"') inStr = true;
    out += ch;
  }
  return out;
}
