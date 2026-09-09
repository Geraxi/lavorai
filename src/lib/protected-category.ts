/**
 * Categorie protette (L. 68/99): riconoscimento degli annunci riservati o
 * aperti in via prioritaria alle persone iscritte al collocamento mirato
 * (art. 1: persone con disabilità; art. 18: orfani, vedove, profughi…).
 *
 * Gli annunci italiani lo segnalano quasi sempre nel titolo o nelle prime
 * righe: "categorie protette", "L. 68/99", "legge 68", "art. 1",
 * "collocamento mirato", "invalidità civile ≥ 46%".
 */
const PROTECTED_RE =
  /categorie?\s+protett[ae]|categoria\s+protetta|\bl(?:egge)?\.?\s*68\s*[\/-]\s*99|\blegge\s+68\b|\bl\.?\s*68\b|collocamento\s+mirato|invalidit[àa]\s+civile|art(?:icolo|\.)?\s*1\s+(?:della\s+)?l(?:egge)?\.?\s*68|art(?:icolo|\.)?\s*18\s+(?:della\s+)?l(?:egge)?\.?\s*68|disabilit[àa]\s+(?:certificata|riconosciuta)|iscritt[oi]\s+alle\s+liste\s+(?:del\s+)?collocamento/i;

/** Frasi usate per la ricerca dedicata su Adzuna (una query per frase). */
export const PROTECTED_SEARCH_PHRASES = ["categorie protette", "legge 68/99", "collocamento mirato"];

export function isProtectedCategoryJob(title: string | null | undefined, description: string | null | undefined): boolean {
  const text = `${title ?? ""}\n${(description ?? "").slice(0, 3000)}`;
  return PROTECTED_RE.test(text);
}

/** Domanda di un form che chiede l'appartenenza alle categorie protette. */
export function isProtectedCategoryQuestion(label: string): boolean {
  return /categorie?\s+protett|legge\s*68|l\.?\s*68|collocamento\s+mirato|invalidit[àa]\s+civile|protected\s+categor/i.test(label);
}
