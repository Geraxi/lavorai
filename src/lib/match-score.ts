import type { CVProfile } from "@/lib/cv-profile-types";

/**
 * Quick match score tra profilo utente e un job posting.
 *
 * Logica: quanti termini chiave del profilo (skill, ruoli, titoli) compaiono
 * nel testo del job. 0-100.
 *
 * Euristica veloce (no API call) — usata per filtrare al momento dell'apply
 * rispetto a UserPreferences.matchMin. Il vero score ATS (via Claude) viene
 * calcolato dopo nel worker.
 *
 * Quando il profilo è vuoto → ritorna 100 (non filtriamo, meglio che scartare
 * per mancanza dati).
 */
export function quickMatchScore(
  profile: Pick<CVProfile, "skills" | "experiences" | "title" | "summary">,
  jobText: string,
): number {
  const job = (jobText ?? "").toLowerCase();
  if (!job) return 100;

  const terms = new Set<string>();
  const push = (raw: string | undefined | null) => {
    if (!raw) return;
    const v = raw.trim().toLowerCase();
    if (v.length < 2) return;
    terms.add(v);
  };

  for (const s of profile.skills ?? []) push(s.name);
  for (const e of profile.experiences ?? []) push(e.role);
  push(profile.title);

  // Estrai anche bigrammi/trigrammi significativi dal summary per catturare
  // concetti compositi ("product design", "machine learning"…)
  const words = (profile.summary ?? "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3);
  for (let i = 0; i < words.length - 1; i++) {
    const bi = `${words[i]} ${words[i + 1]}`;
    if (bi.length < 6) continue;
    terms.add(bi);
  }

  if (terms.size === 0) return 100;

  let matched = 0;
  for (const t of terms) {
    if (job.includes(t)) matched++;
  }
  const raw = (matched / terms.size) * 100;
  // Ceiling 99: lasciamo spazio per l'ATS score "vero" Claude-generated
  // nel worker per farlo spiccare se è perfetto.
  return Math.round(Math.min(99, raw));
}
