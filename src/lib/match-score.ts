import type { CVProfile } from "@/lib/cv-profile-types";

/**
 * Quick match score tra profilo utente e un job posting. 0-100.
 *
 * Euristica: overlap tra i termini chiave del profilo (skill, ruoli,
 * titolo, bigrammi di summary) e il testo del job.
 *
 * ⚠️ Formula precedente: `matched / profile.size`. Penalizzava profili
 * ricchi: 25 skill × 6 match = 24%. Utenti con CV pieni venivano tagliati
 * fuori a threshold anche bassi. Riscritta per essere simmetrica e meno
 * punitiva.
 *
 * Nuova formula: ibrido F1-like. Considera sia il recall (quanti dei
 * termini del profilo toccano il job) sia la precision (quanta della
 * sostanza del job è coperta dal profilo). Boost se il TITOLO del job
 * contiene un ruolo noto del profilo (segnale forte).
 *
 * Ritorna 100 se non c'è testo job o profilo vuoto (evita falsi negativi).
 */
export function quickMatchScore(
  profile: Pick<CVProfile, "skills" | "experiences" | "title" | "summary">,
  jobText: string,
): number {
  const job = (jobText ?? "").toLowerCase();
  if (!job) return 100;

  const profileTerms = new Set<string>();
  const push = (raw: string | undefined | null) => {
    if (!raw) return;
    const v = raw.trim().toLowerCase();
    if (v.length < 2) return;
    profileTerms.add(v);
  };

  const roleTerms = new Set<string>();
  for (const s of profile.skills ?? []) push(s.name);
  for (const e of profile.experiences ?? []) {
    push(e.role);
    if (e.role) roleTerms.add(e.role.toLowerCase());
  }
  if (profile.title) {
    push(profile.title);
    roleTerms.add(profile.title.toLowerCase());
  }

  // Bigrammi significativi dal summary
  const sumWords = (profile.summary ?? "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3);
  for (let i = 0; i < sumWords.length - 1; i++) {
    const bi = `${sumWords[i]} ${sumWords[i + 1]}`;
    if (bi.length < 6) continue;
    profileTerms.add(bi);
  }

  if (profileTerms.size === 0) return 100;

  // Unique tokens nel job (per precision)
  const jobTokens = new Set(
    job
      .replace(/[^\p{L}\p{N}\s-]/gu, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 3 && !STOPWORDS.has(w)),
  );

  let matched = 0;
  let matchedJobTokens = 0;
  for (const t of profileTerms) {
    if (job.includes(t)) {
      matched++;
      // Se il termine profilo è una singola parola presente come token
      // job "vero" (non solo substring), conta anche come precision win
      if (!t.includes(" ") && jobTokens.has(t)) matchedJobTokens++;
    }
  }

  // Recall: % termini profilo presenti nel job
  const recall = matched / profileTerms.size;
  // Precision proxy: quanti dei jobTokens coincidono con term profilo
  // (cap denominatore a 40 per non svalutare job con descrizioni
  // lunghissime piene di boilerplate legale)
  const precisionDen = Math.min(jobTokens.size, 40);
  const precision = precisionDen === 0 ? 0 : matchedJobTokens / precisionDen;

  // Blend: se abbiamo sia recall che precision > 0 usiamo F1, altrimenti
  // usiamo la media semplice per non azzerare un buon recall quando
  // la precision è 0 per via dei token boilerplate.
  const base =
    recall > 0 && precision > 0
      ? (2 * recall * precision) / (recall + precision)
      : recall * 0.5 + precision * 0.5;
  let score = base * 100;

  // Boost forte: il titolo job contiene un ruolo dichiarato (es. "Senior
  // Product Designer" quando l'utente ha "Product Designer" tra le esperienze)
  const jobHead = job.slice(0, 160);
  for (const r of roleTerms) {
    if (r.length >= 4 && jobHead.includes(r)) {
      score = Math.max(score, 55); // almeno 55% se il ruolo matcha a testa
      score += 15; // bonus additivo
      break;
    }
  }

  return Math.round(Math.min(99, Math.max(0, score)));
}

const STOPWORDS = new Set([
  "the", "and", "for", "with", "you", "are", "our", "that", "this", "will",
  "have", "has", "from", "your", "can", "any", "all", "who", "what", "when",
  "how", "why", "per", "con", "una", "uno", "gli", "nel", "nella", "dei",
  "delle", "degli", "anche", "come", "alla", "dalla", "dello", "della",
  "team", "work", "role", "job", "company", "azienda", "lavoro", "ruolo",
  "we", "us", "is", "be", "or", "an", "a", "in", "on", "to", "of", "by",
]);
