/**
 * Stima onesta della copertura auto-apply per il verticale di un utente,
 * in base ai suoi ruoli. Serve a evitare il caso Giuseppe: utente Pro+
 * amministrativo/Puglia con verticale scarsamente coperto dal pool ATS
 * (Adzuna SMB IT ha pochissime email recruiter → 15 RTA per lui) che
 * paga aspettando auto-apply e si sente truffato.
 *
 * Categorizzazione basata su empirical: quali verticali hanno alta
 * probabilità di risoluzione a un adapter ATS submit-diretto vs quali
 * finiscono in RTA/email fallback.
 *
 * "high"   → tech/design/marketing/product: >70% arrivano su Greenhouse
 *            /Lever/Ashby/Workable con submit reale confermato.
 * "medium" → sales/finance/HR/operations: mix ATS + LinkedIn/aggregatori,
 *            50-70% submit confermato.
 * "low"    → amministrativo/segretariato/receptionist/PMI Italia/
 *            sanitario/operaio: <30% submit confermato — soprattutto
 *            Adzuna SMB IT senza email pubblica. Consigliato hybrid.
 */

export type CoverageLevel = "high" | "medium" | "low";

export interface CoverageEstimate {
  level: CoverageLevel;
  expectedSubmitRate: string; // per UI, es. ">70%"
  recommendedMode: "auto" | "hybrid";
  reason: string; // testo user-friendly
}

// keyword sets per identificare il verticale del ruolo
const HIGH_COVERAGE = [
  "product designer",
  "ux designer",
  "ui designer",
  "product manager",
  "software engineer",
  "frontend",
  "backend",
  "full stack",
  "fullstack",
  "data scientist",
  "data engineer",
  "machine learning",
  "devops",
  "sre",
  "growth",
  "marketing manager",
  "content marketing",
  "seo",
  "brand",
];

const MEDIUM_COVERAGE = [
  "sales",
  "account executive",
  "account manager",
  "customer success",
  "business development",
  "finance",
  "accountant",
  "controller",
  "hr manager",
  "human resources",
  "recruiter",
  "operations",
  "project manager",
  "consultant",
  "analyst",
];

const LOW_COVERAGE = [
  "amministrativ",
  "segretari",
  "receptionist",
  "back office",
  "front office",
  "impiegat",
  "addetto",
  "commessa",
  "commesso",
  "cassier",
  "cameriere",
  "cuoco",
  "chef",
  "operai",
  "magazzin",
  "trasport",
  "autist",
  "elettricist",
  "idraulic",
  "muratore",
  "meccanico",
  "sanitari",
  "infermier",
  "oss",
  "meteorolog",
  "dj",
  "musicist",
  "estetist",
  "parrucchier",
];

export function estimateCoverage(roles: string[]): CoverageEstimate {
  if (!roles || roles.length === 0) {
    return {
      level: "medium",
      expectedSubmitRate: "n/d",
      recommendedMode: "hybrid",
      reason: "Nessun ruolo impostato. Aggiungi ruoli in preferenze per vedere la copertura.",
    };
  }

  const lower = roles.map((r) => r.toLowerCase().trim());
  const hits = { high: 0, medium: 0, low: 0 };

  for (const role of lower) {
    if (HIGH_COVERAGE.some((k) => role.includes(k))) {
      hits.high++;
      continue;
    }
    if (LOW_COVERAGE.some((k) => role.includes(k))) {
      hits.low++;
      continue;
    }
    if (MEDIUM_COVERAGE.some((k) => role.includes(k))) {
      hits.medium++;
      continue;
    }
    // Default: medium (non identificato → assumiamo medio)
    hits.medium++;
  }

  const total = hits.high + hits.medium + hits.low;
  const highRatio = hits.high / total;
  const lowRatio = hits.low / total;

  // Se la maggioranza dei ruoli è nel bucket "low", warn
  if (lowRatio > 0.5) {
    return {
      level: "low",
      expectedSubmitRate: "<30%",
      recommendedMode: "hybrid",
      reason:
        "I tuoi ruoli sono in verticali (amministrativo/PMI Italia/manuale) dove il nostro auto-submit riesce meno del 30% delle volte. Le altre candidature vengono preparate ma servono un tuo click per l'invio. Ti consigliamo la modalità Hybrid per vedere e approvare ogni candidatura.",
    };
  }

  if (highRatio >= 0.5) {
    return {
      level: "high",
      expectedSubmitRate: ">70%",
      recommendedMode: "auto",
      reason:
        "Il tuo verticale (tech/design/product/marketing) è ben coperto. L'auto-apply funziona molto bene qui: la maggior parte delle candidature vanno direttamente sui portali ATS delle aziende.",
    };
  }

  return {
    level: "medium",
    expectedSubmitRate: "40-60%",
    recommendedMode: "hybrid",
    reason:
      "Il tuo verticale ha una copertura mista. Auto-apply funziona per circa metà delle candidature; le altre vengono preparate per il tuo click. Puoi provare entrambe le modalità e scegliere quella che preferisci.",
  };
}
