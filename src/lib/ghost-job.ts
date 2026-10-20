/**
 * Ghost-job scanner: stima trasparente del rischio che un annuncio sia
 * "fantasma" (pubblicato senza un'assunzione reale in corso).
 *
 * Modulo PURO: nessun accesso a DB/rete. Riceve l'annuncio e (opzionale) gli
 * altri annunci della stessa azienda già presenti in cache, e restituisce un
 * livello (basso/medio/alto) con le motivazioni in italiano. Se i dati non
 * bastano restituisce "dati_insufficienti" invece di inventare un punteggio.
 *
 * Euristiche ispirate a santifer/career-ops (MIT): detect-reposts.mjs
 * (identità del titolo come INSIEME di parole, span minimo di 1 giorno così
 * che più posizioni pubblicate in contemporanea non contino come repost,
 * finestra di 90 giorni) e il blocco "legitimacy" delle modalità di
 * valutazione (anzianità dell'annuncio, dettaglio della JD, frasi generiche,
 * link di candidatura non più attivo).
 */

export type GhostRiskLevel = "basso" | "medio" | "alto" | "dati_insufficienti";

export interface GhostJobInput {
  id: string;
  title: string;
  company: string | null;
  location: string | null;
  description: string;
  remote: boolean;
  salaryMin: number | null;
  salaryMax: number | null;
  postedAt: Date | string | null;
  closedAt?: Date | string | null;
  source?: string | null;
}

export interface GhostJobSibling {
  id: string;
  title: string;
  company: string | null;
  location: string | null;
  postedAt: Date | string | null;
  closedAt?: Date | string | null;
}

export interface GhostJobResult {
  level: GhostRiskLevel;
  /** Somma dei pesi dei segnali scattati; null se dati insufficienti. */
  score: number | null;
  /** Motivazioni leggibili (italiano) che hanno contribuito al rischio. */
  reasons: string[];
  /** Segnali che non è stato possibile valutare per mancanza di dati. */
  missing: string[];
}

const DAY = 86_400_000;
export const REPOST_WINDOW_DAYS = 90;
export const MIN_REPOST_SPAN_DAYS = 1;
/** Fonti che troncano la descrizione: lunghezza/genericità non valutabili. */
const TRUNCATED_DESCRIPTION_SOURCES = new Set(["adzuna", "linkedin", "mock"]);

const STOPWORDS = new Set(["a", "e", "di", "da", "in", "per", "il", "la", "lo", "i", "gli", "le", "the", "of", "and", "for", "to", "m", "f", "mf", "fm", "x"]);

/** Normalizza testo: minuscolo, senza accenti/punteggiatura. */
export function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z0-9+#]+/g, " ")
    .trim();
}

export function normalizeCompany(s: string | null | undefined): string {
  if (!s) return "";
  return normalizeText(s)
    .replace(/\b(s ?r ?l ?s?|s ?p ?a|s ?a ?s|s ?n ?c|inc|ltd|llc|gmbh|spa|srl|group|gruppo|italia|italy)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Identità del titolo = insieme ordinato delle parole significative.
 * Tollera ordine/punteggiatura ma NON unisce titoli che differiscono per
 * città, seniority o lingua (come detect-reposts.mjs).
 */
export function titleIdentityKey(title: string): string {
  const words = normalizeText(title).split(" ").filter((w) => w && !STOPWORDS.has(w));
  return [...new Set(words)].sort().join(" ");
}

function toTime(d: Date | string | null | undefined): number | null {
  if (!d) return null;
  const t = new Date(d).getTime();
  return Number.isFinite(t) ? t : null;
}

const GENERIC_PHRASES: RegExp[] = [
  /ambiente (giovane e )?dinamico/, /team (giovane|dinamico)/, /giovane e dinamic/,
  /forte motivazione/, /voglia di crescere/, /fast[- ]paced/, /self[- ]starter/,
  /rock ?star/, /\bninja\b/, /opportunita unica/, /ottime prospettive di crescita/,
  /competitive salary/, /stipendio competitivo/, /retribuzione commisurata/,
  /work hard,? play hard/, /dynamic environment/, /passione per/,
];
const EVERGREEN_PHRASES: RegExp[] = [
  /candidatur[ae] spontane/, /talent pool/, /future (opportunities|openings)/,
  /opportunita future/, /sempre alla ricerca/, /always looking for/,
  /database (di )?candidat/, /posizioni future/, /evergreen/,
];

/** Conta frasi generiche (fluff) ed "evergreen" (talent pool) nel testo. */
export function genericPhraseHits(text: string): { generic: number; evergreen: number } {
  const t = normalizeText(text);
  return {
    generic: GENERIC_PHRASES.filter((r) => r.test(t)).length,
    evergreen: EVERGREEN_PHRASES.filter((r) => r.test(t)).length,
  };
}

export function scoreGhostJob(
  job: GhostJobInput,
  siblings: GhostJobSibling[] = [],
  now: Date = new Date(),
): GhostJobResult {
  const reasons: string[] = [];
  const missing: string[] = [];
  let score = 0;
  const nowT = now.getTime();

  // 1. Link non più attivo (rilevato dal liveness check del worker).
  if (toTime(job.closedAt) != null) {
    score += 4;
    reasons.push("Il link di candidatura risulta non più attivo");
  }

  // 2. Anzianità dell'annuncio.
  const posted = toTime(job.postedAt);
  if (posted == null) {
    missing.push("data di pubblicazione");
  } else {
    const age = Math.floor((nowT - posted) / DAY);
    if (age > 60) { score += 2; reasons.push(`Pubblicato da ${age} giorni`); }
    else if (age > 30) { score += 1; reasons.push(`Pubblicato da ${age} giorni`); }
  }

  // 3/4. Ripubblicazioni e ruoli identici aperti (serve l'azienda).
  const company = normalizeCompany(job.company);
  if (!company) {
    missing.push("azienda");
  } else {
    const key = titleIdentityKey(job.title);
    const same = siblings.filter(
      (s) => s.id !== job.id && normalizeCompany(s.company) === company && titleIdentityKey(s.title) === key,
    );
    // Repost: stesso ruolo comparso in date diverse (span >= 1 giorno) entro 90 giorni.
    const dates = [posted, ...same.map((s) => toTime(s.postedAt))]
      .filter((t): t is number => t != null && nowT - t <= REPOST_WINDOW_DAYS * DAY);
    const days = [...new Set(dates.map((t) => Math.floor(t / DAY)))].sort((a, b) => a - b);
    const span = days.length ? days[days.length - 1] - days[0] : 0;
    if (days.length >= 2 && span >= MIN_REPOST_SPAN_DAYS) {
      const times = days.length - 1;
      score += times >= 2 ? 3 : 2;
      reasons.push(`Ripubblicato ${times} ${times === 1 ? "volta" : "volte"} negli ultimi ${REPOST_WINDOW_DAYS} giorni`);
    }
    // Molte copie identiche aperte insieme (stessa sede): possibile "vetrina".
    const loc = normalizeText(job.location ?? "");
    const openIdentical = same.filter(
      (s) => toTime(s.closedAt) == null && normalizeText(s.location ?? "") === loc,
    ).length;
    if (openIdentical >= 2) {
      score += 1;
      reasons.push(`${openIdentical + 1} annunci identici aperti per la stessa azienda e sede`);
    }
  }

  // 5. Dettaglio dell'annuncio.
  if (job.salaryMin == null && job.salaryMax == null) {
    score += 1;
    reasons.push("Retribuzione non indicata");
  }
  if (!job.location?.trim() && !job.remote) {
    score += 1;
    reasons.push("Sede di lavoro non indicata");
  }

  // 6. Descrizione: lunghezza e genericità (solo se non troncata dalla fonte).
  const truncated = TRUNCATED_DESCRIPTION_SOURCES.has((job.source ?? "").toLowerCase());
  const desc = (job.description ?? "").trim();
  if (truncated) {
    missing.push("descrizione completa");
  } else if (!desc) {
    score += 1;
    reasons.push("Descrizione assente");
  } else {
    if (desc.length < 300) { score += 1; reasons.push("Descrizione molto breve"); }
  }
  const hits = genericPhraseHits(`${job.title}\n${desc}`);
  if (hits.evergreen > 0) {
    score += 2;
    reasons.push("Linguaggio da candidatura spontanea / talent pool");
  }
  if (hits.generic >= 2) {
    score += 1;
    reasons.push("Testo generico, con poche informazioni concrete sul ruolo");
  }

  // Senza data E senza azienda non possiamo dire nulla di affidabile.
  if (posted == null && !company && toTime(job.closedAt) == null) {
    return { level: "dati_insufficienti", score: null, reasons: ["Dati insufficienti per valutare l'annuncio"], missing };
  }

  const level: GhostRiskLevel = score >= 5 ? "alto" : score >= 3 ? "medio" : "basso";
  return { level, score, reasons, missing };
}

export const GHOST_LEVEL_LABEL: Record<GhostRiskLevel, string> = {
  basso: "Rischio basso",
  medio: "Rischio medio",
  alto: "Rischio alto",
  dati_insufficienti: "Dati insufficienti",
};

/** Riassunto compatto per tooltip/aria-label. */
export function ghostSummary(r: GhostJobResult): string {
  const head = `Annuncio fantasma: ${GHOST_LEVEL_LABEL[r.level].toLowerCase()}`;
  const body = r.reasons.length ? r.reasons.join(" · ") : "Nessun segnale di rischio";
  const tail = r.missing.length && r.level !== "dati_insufficienti" ? ` (non valutato: ${r.missing.join(", ")})` : "";
  return `${head}. ${body}${tail}`;
}
