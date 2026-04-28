/**
 * Risposte standard alle domande tipiche dei form ATS.
 *
 * Il worker carica questo oggetto da UserPreferences.applicationAnswersJson
 * e lo passa agli adapter Playwright (Greenhouse/Lever/Workable). Ogni
 * adapter scansiona i campi custom della form, fa fuzzy-match label →
 * chiave di questo oggetto, e popola.
 *
 * Tutto è opzionale. Se manca, l'adapter lascia il campo vuoto. Se è
 * required dalla form, il submit fallirà — meglio fallire onesti che
 * mandare risposte inventate.
 */
export interface ApplicationAnswers {
  // ---------- Lavoro ----------
  /** "yes_eu_citizen" | "yes_permit" | "no_needs_sponsorship" */
  workAuthEU?: "yes_eu_citizen" | "yes_permit" | "no_needs_sponsorship";

  /** Aspettativa RAL annua in euro (es. 60000). */
  salaryExpectationEur?: number;

  /** Disposto a trasferirsi per il ruolo. */
  relocate?: boolean;

  /** Notice period: "immediate" | "2weeks" | "1month" | "2months" | "3months_plus" */
  noticePeriod?:
    | "immediate"
    | "2weeks"
    | "1month"
    | "2months"
    | "3months_plus";

  // ---------- Profilo / link ----------
  linkedinUrl?: string;
  githubUrl?: string;

  // ---------- Domande aperte ----------
  /** "linkedin" | "google" | "referral" | "other" */
  howHeard?: "linkedin" | "google" | "referral" | "other";

  /** 1-2 frasi generiche "perché sono interessato/a alle posizioni di
   *  questo tipo". Claude può comunque ri-elaborarle nel cover letter. */
  whyInterested?: string;

  // ---------- EEO (US-style; opzionali, default = decline) ----------
  /** "male" | "female" | "non_binary" | "prefer_not" */
  eeoGender?: "male" | "female" | "non_binary" | "prefer_not";
  /** "yes" | "no" | "prefer_not" */
  eeoVeteran?: "yes" | "no" | "prefer_not";
  /** "yes" | "no" | "prefer_not" */
  eeoDisability?: "yes" | "no" | "prefer_not";
}

export function parseAnswers(raw: string | null | undefined): ApplicationAnswers {
  if (!raw) return {};
  try {
    const obj = JSON.parse(raw);
    if (!obj || typeof obj !== "object") return {};
    return obj as ApplicationAnswers;
  } catch {
    return {};
  }
}

export function serializeAnswers(a: ApplicationAnswers): string {
  // Strip undefined/null/empty per non gonfiare il blob
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(a)) {
    if (v === undefined || v === null) continue;
    if (typeof v === "string" && v.trim() === "") continue;
    clean[k] = v;
  }
  return JSON.stringify(clean);
}

// ---------- Etichette UI ----------

export const WORK_AUTH_LABEL: Record<NonNullable<ApplicationAnswers["workAuthEU"]>, string> = {
  yes_eu_citizen: "Cittadino UE",
  yes_permit: "Ho permesso di lavoro UE",
  no_needs_sponsorship: "Mi serve sponsorship",
};

export const NOTICE_LABEL: Record<NonNullable<ApplicationAnswers["noticePeriod"]>, string> = {
  immediate: "Immediata",
  "2weeks": "2 settimane",
  "1month": "1 mese",
  "2months": "2 mesi",
  "3months_plus": "3 mesi o più",
};

export const HOW_HEARD_LABEL: Record<NonNullable<ApplicationAnswers["howHeard"]>, string> = {
  linkedin: "LinkedIn",
  google: "Google / Search",
  referral: "Referral / Passaparola",
  other: "Altro",
};

export const EEO_LABEL = {
  prefer_not: "Preferisco non rispondere",
  yes: "Sì",
  no: "No",
  male: "Uomo",
  female: "Donna",
  non_binary: "Non binario",
};

// ---------- Mapping per adapter (fuzzy → answer) ----------

/**
 * Per ogni chiave di ApplicationAnswers, lista di pattern (lowercase, IT/EN)
 * che il fuzzy-matcher dell'adapter usa per mappare label form → answer.
 * Ordinato dal più specifico al più generico.
 */
export const FIELD_HINTS: Record<keyof ApplicationAnswers, string[]> = {
  workAuthEU: [
    "work authorization",
    "authorized to work",
    "right to work",
    "work permit",
    "eu citizen",
    "permesso di lavoro",
    "autorizzazione",
    "visa sponsor",
    "sponsorship",
  ],
  salaryExpectationEur: [
    "salary expectation",
    "expected salary",
    "compensation expectation",
    "ral",
    "stipendio",
    "retribuzione",
  ],
  relocate: [
    "willing to relocate",
    "relocation",
    "relocate",
    "trasferirsi",
    "trasferimento",
  ],
  noticePeriod: [
    "notice period",
    "preavviso",
    "when can you start",
    "earliest start",
    "disponibilità",
    "availability",
  ],
  linkedinUrl: ["linkedin", "linkedin url", "linkedin profile"],
  githubUrl: ["github", "github url", "github profile"],
  howHeard: [
    "how did you hear",
    "where did you hear",
    "how did you find",
    "come ci hai conosciuto",
    "come hai saputo",
  ],
  whyInterested: [
    "why are you interested",
    "why this role",
    "why do you want",
    "perché sei interessato",
    "perché questo ruolo",
    "motivation",
    "motivazione",
  ],
  eeoGender: ["gender", "genere", "sex"],
  eeoVeteran: ["veteran", "veterano", "military service"],
  eeoDisability: ["disability", "disabled", "disabilità"],
};
