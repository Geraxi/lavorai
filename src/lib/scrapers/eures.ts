import type { JobListItem } from "@/lib/adzuna";
import { stripHtml } from "./feed-utils";

/**
 * EURES (Commissione europea / ELA): motore pubblico di ricerca delle
 * offerte dei servizi pubblici per l'impiego, Italia inclusa. Nessuna auth.
 * Sola lettura: l'utente si candida sul sito dell'annuncio (link-out).
 *   POST https://europa.eu/eures/api/jv-searchengine/public/jv-search/search
 */

const SEARCH = "https://europa.eu/eures/api/jv-searchengine/public/jv-search/search";
const DETAIL = "https://europa.eu/eures/api/jv-searchengine/public/jv/id/";

interface EuresHit {
  id?: string;
  title?: string;
  description?: string;
  employer?: { name?: string } | string;
  locations?: Array<{ city?: string; countryCode?: string; region?: string }> | null;
  locationMap?: Record<string, string[]>;
  creationDate?: string | number;
  lastModificationDate?: string | number;
  positionOffering?: string;
  jvUrl?: string;
  url?: string;
  jobCategoriesCodes?: string[];
}

export async function fetchEuresJobs(keyword: string, opts: { country?: string; pages?: number; perPage?: number } = {}): Promise<JobListItem[]> {
  const out: JobListItem[] = [];
  const pages = opts.pages ?? 1;
  for (let page = 1; page <= pages; page++) {
    try {
      const res = await fetch(SEARCH, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json", "User-Agent": "Mozilla/5.0 LavorAI/1.0 jobs-sync" },
        body: JSON.stringify({
          keywords: [{ keyword, specificSearchCode: "EVERYWHERE" }],
          locationCodes: [opts.country ?? "it"],
          page,
          resultsPerPage: opts.perPage ?? 50,
          sortSearch: "MOST_RECENT",
          requestLanguage: "it",
          sessionId: "lavorai",
        }),
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) { console.warn(`[eures] "${keyword}" → ${res.status}`); break; }
      const data = (await res.json()) as { jvs?: EuresHit[]; numberRecords?: number };
      const hits = Array.isArray(data.jvs) ? data.jvs : [];
      for (const h of hits) {
        const j = mapHit(h, keyword);
        if (j) out.push(j);
      }
      if (hits.length < (opts.perPage ?? 50)) break;
    } catch (err) {
      console.warn(`[eures] "${keyword}" failed`, err instanceof Error ? err.message : err);
      break;
    }
  }
  return out;
}

function mapHit(h: EuresHit, keyword: string): JobListItem | null {
  if (!h.id || !h.title) return null;
  const employer = typeof h.employer === "string" ? h.employer : h.employer?.name ?? null;
  const locs = (h.locations ?? []).map((l) => [l.city, l.region].filter(Boolean).join(", ")).filter(Boolean);
  const nuts = h.locationMap ? Object.values(h.locationMap).flat()[0] ?? null : null;
  const loc = locs[0] ?? (nuts ? nutsToRegion(nuts) : null) ?? "Italia";
  const description = stripHtml(h.description).slice(0, 2000);
  const tsRaw = h.creationDate ?? h.lastModificationDate;
  const tsNum = tsRaw != null && /^\d+$/.test(String(tsRaw)) ? Number(tsRaw) : tsRaw ? Date.parse(String(tsRaw)) : NaN;
  const postedAt = isNaN(tsNum) ? new Date() : new Date(tsNum);
  return {
    id: "",
    externalId: String(h.id),
    source: "eures",
    sourceSlug: null,
    title: stripHtml(h.title),
    company: employer,
    location: loc,
    description,
    // Pagina pubblica EURES dell'annuncio (contiene il link al sito dell'inserzionista).
    url: h.jvUrl || h.url || `https://eures.europa.eu/jobs-and-recruiting/job-detail_it?jvId=${encodeURIComponent(h.id)}`,
    contractType: h.positionOffering ?? null,
    remote: /remote|remoto|smart working/i.test(`${h.title} ${description.slice(0, 200)}`),
    salaryMin: null,
    salaryMax: null,
    category: keyword,
    postedAt,
    recruiterEmail: null,
    recruiterScrapedAt: null,
  } as unknown as JobListItem;
}

const NUTS_IT: Record<string, string> = {
  ITC1: "Piemonte", ITC2: "Valle d'Aosta", ITC3: "Liguria", ITC4: "Lombardia", ITH1: "Trentino-Alto Adige", ITH2: "Trentino-Alto Adige",
  ITH3: "Veneto", ITH4: "Friuli-Venezia Giulia", ITH5: "Emilia-Romagna", ITI1: "Toscana", ITI2: "Umbria", ITI3: "Marche", ITI4: "Lazio",
  ITF1: "Abruzzo", ITF2: "Molise", ITF3: "Campania", ITF4: "Puglia", ITF5: "Basilicata", ITF6: "Calabria", ITG1: "Sicilia", ITG2: "Sardegna",
};
function nutsToRegion(code: string): string {
  const c = code.toUpperCase();
  return NUTS_IT[c.slice(0, 4)] ?? (c.startsWith("IT") ? "Italia" : c);
}

/** Sweep giornaliero: parole chiave generali + categorie protette. */
export const EURES_DEFAULT_KEYWORDS = [
  "categorie protette", "legge 68", "sviluppatore", "developer", "product designer", "data analyst", "project manager",
  "marketing", "sales", "customer service", "contabile", "amministrazione", "ingegnere", "infermiere", "logistica", "HR",
];

export async function fetchEuresMulti(keywords: string[] = EURES_DEFAULT_KEYWORDS): Promise<JobListItem[]> {
  const out: JobListItem[] = [];
  for (const k of keywords) out.push(...(await fetchEuresJobs(k, { country: "it", pages: 1, perPage: 50 })));
  const seen = new Set<string>();
  return out.filter((j) => (seen.has(j.externalId) ? false : (seen.add(j.externalId), true)));
}
