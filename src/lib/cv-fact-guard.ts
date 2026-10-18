/**
 * Guard deterministico sui fatti del CV su misura.
 *
 * Il prompt (src/lib/prompts/cv-optimization.ts) chiede già al modello di
 * non inventare nulla. Questo modulo lo verifica DOPO la generazione, senza
 * AI: datori di lavoro, istituti, titoli di studio e anni delle date devono
 * essere tracciabili al testo del CV originale (più l'eventuale contesto che
 * l'utente ha scritto di suo pugno).
 *
 * Politica di riparazione ("quando hai dubbi: ometti"):
 *  - esperienza con datore di lavoro NON tracciabile (nessun token in comune
 *    con il CV) → rimossa;
 *  - anno in una data non presente nel CV → data svuotata (mai inventata);
 *  - istituto/titolo di studio non tracciabile → segnalato (può essere una
 *    traduzione legittima, es. "University of Milan" ↔ "Università degli
 *    Studi di Milano"), rimosso solo se non ha nessun token in comune.
 *
 * Funzioni pure: testate in scripts/test-cv-fact-guard.ts.
 */
import type { OptimizedCVData } from "@/types/cv";

export type FactIssueKind =
  | "employer_not_in_source"
  | "employer_partial_match"
  | "date_not_in_source"
  | "institution_not_in_source"
  | "institution_partial_match"
  | "degree_not_in_source";

export interface FactIssue {
  kind: FactIssueKind;
  /** Valore prodotto dal modello. */
  value: string;
  /** Dove: "experiences[2].company", "education[0].endDate", ... */
  path: string;
  /** Azione applicata da repairCvFacts. */
  action: "removed" | "cleared" | "kept";
}

export interface FactCheckResult {
  ok: boolean;
  issues: FactIssue[];
}

// Parole che non identificano un'organizzazione (forme societarie, articoli,
// parole generiche di istituti) — escluse dal confronto per token.
const STOPWORDS = new Set([
  "srl", "spa", "snc", "sas", "srls", "inc", "ltd", "llc", "gmbh", "ag", "sa", "bv", "plc", "co", "corp", "company",
  "group", "gruppo", "the", "and", "for", "del", "della", "delle", "dei", "degli", "di", "da", "and", "of", "at",
  "presso", "con", "per", "via", "spa", "holding", "italia", "italy",
]);

export function normalizeFactText(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function significantTokens(input: string): string[] {
  return normalizeFactText(input)
    .split(" ")
    .filter((token) => token.length >= 2 && !STOPWORDS.has(token));
}

/** Quota (0..1) dei token significativi di `value` presenti nel sorgente. */
export function traceability(value: string, source: string): number {
  const normValue = normalizeFactText(value);
  if (!normValue) return 1;
  const normSource = ` ${normalizeFactText(source)} `;
  if (normSource.includes(` ${normValue} `)) return 1;
  const tokens = significantTokens(value);
  if (tokens.length === 0) return 1;
  const sourceTokens = new Set(normSource.trim().split(" "));
  const found = tokens.filter((token) => sourceTokens.has(token)).length;
  return found / tokens.length;
}

const PRESENT = /^(presente|present|current|attuale|oggi|today|in corso|ongoing|now)$/i;

/** Anni a 4 cifre (1950–2049) citati in una data. */
export function yearsIn(value: string): string[] {
  return Array.from(value.matchAll(/\b(19[5-9]\d|20[0-4]\d)\b/g), (match) => match[1]);
}

function dateTraceable(value: string, source: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || PRESENT.test(trimmed)) return true;
  const years = yearsIn(trimmed);
  if (years.length === 0) return true; // nessun anno da verificare (es. "In corso")
  const sourceYears = new Set(yearsIn(source));
  // Accetta anche anni scritti a due cifre nel CV ('19, 03/19).
  return years.every((year) => sourceYears.has(year) || new RegExp(`(?:'|/|-|\\.)${year.slice(2)}\\b`).test(source));
}

const UNSPECIFIED_INSTITUTION = /universit[aà] \(non specificata\)|not specified|non specificat/i;

/** Verifica senza modificare. */
export function checkCvFacts(source: string, cv: OptimizedCVData): FactCheckResult {
  return runFactGuard(source, cv, false).result;
}

/**
 * Verifica e ripara. Restituisce una COPIA del CV con i fatti non
 * tracciabili rimossi/svuotati e l'elenco delle segnalazioni.
 */
export function repairCvFacts(source: string, cv: OptimizedCVData): { cv: OptimizedCVData; result: FactCheckResult } {
  return runFactGuard(source, cv, true);
}

function runFactGuard(source: string, cv: OptimizedCVData, repair: boolean): { cv: OptimizedCVData; result: FactCheckResult } {
  const issues: FactIssue[] = [];
  const experiences = Array.isArray(cv.experiences) ? cv.experiences : [];
  const education = Array.isArray(cv.education) ? cv.education : [];

  const keptExperiences = experiences.flatMap((experience, index) => {
    const company = String(experience?.company ?? "").trim();
    const score = company ? traceability(company, source) : 1;
    if (company && score === 0) {
      issues.push({ kind: "employer_not_in_source", value: company, path: `experiences[${index}].company`, action: repair ? "removed" : "kept" });
      return repair ? [] : [experience];
    }
    if (company && score < 0.6) {
      issues.push({ kind: "employer_partial_match", value: company, path: `experiences[${index}].company`, action: "kept" });
    }
    const next = { ...experience };
    for (const field of ["startDate", "endDate"] as const) {
      const value = String(experience?.[field] ?? "");
      if (!dateTraceable(value, source)) {
        issues.push({ kind: "date_not_in_source", value, path: `experiences[${index}].${field}`, action: repair ? "cleared" : "kept" });
        if (repair) next[field] = "";
      }
    }
    return [next];
  });

  const keptEducation = education.flatMap((entry, index) => {
    const institution = String(entry?.institution ?? "").trim();
    const degree = String(entry?.degree ?? "").trim();
    const institutionScore = institution && !UNSPECIFIED_INSTITUTION.test(institution) ? traceability(institution, source) : 1;
    const degreeScore = degree ? traceability(degree, source) : 1;
    if (institutionScore === 0 && degreeScore === 0) {
      issues.push({ kind: "institution_not_in_source", value: `${degree} · ${institution}`, path: `education[${index}]`, action: repair ? "removed" : "kept" });
      return repair ? [] : [entry];
    }
    if (institutionScore < 0.6) {
      issues.push({ kind: "institution_partial_match", value: institution, path: `education[${index}].institution`, action: "kept" });
    }
    if (degreeScore === 0) {
      issues.push({ kind: "degree_not_in_source", value: degree, path: `education[${index}].degree`, action: "kept" });
    }
    const next = { ...entry };
    for (const field of ["startDate", "endDate"] as const) {
      const value = String(entry?.[field] ?? "");
      if (!dateTraceable(value, source)) {
        issues.push({ kind: "date_not_in_source", value, path: `education[${index}].${field}`, action: repair ? "cleared" : "kept" });
        if (repair) next[field] = "";
      }
    }
    return [next];
  });

  const blocking = issues.some((issue) => issue.kind === "employer_not_in_source" || issue.kind === "institution_not_in_source" || issue.kind === "date_not_in_source");
  return {
    cv: repair ? { ...cv, experiences: keptExperiences, education: keptEducation } : cv,
    result: { ok: !blocking, issues },
  };
}
