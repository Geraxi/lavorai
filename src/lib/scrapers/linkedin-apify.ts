import type { JobListItem } from "@/lib/adzuna";

/**
 * LinkedIn discovery via Apify — NON submit.
 *
 * Strategia: usiamo Apify LinkedIn Jobs Scraper per allargare il pool di
 * annunci ben oltre le API pubbliche di Greenhouse/Lever. MOLTI annunci
 * su LinkedIn sono repost di posizioni ospitate su Greenhouse, Lever,
 * Workable, BambooHR — il bottone "Apply" porta fuori.
 *
 * Qui filtriamo a QUEL sottoinsieme: teniamo solo job il cui applyUrl
 * punta a un ATS che i nostri adapter Playwright sanno compilare.
 * L'utente vede più opportunità, ma il submit resta sul form ATS
 * originale — zero rischio ban LinkedIn.
 *
 * Env:
 *   APIFY_TOKEN            — API token Apify (obbligatorio)
 *   APIFY_LINKEDIN_ACTOR   — default "bebity~linkedin-jobs-scraper"
 *
 * Costo indicativo: ~$0.50 per 1000 job scrapati.
 */

const APIFY_ACTOR =
  process.env.APIFY_LINKEDIN_ACTOR ?? "apimaestro~linkedin-jobs-scraper-api";

/**
 * Domini ATS che sappiamo compilare via Playwright
 * (vedi src/lib/portal-adapters/*).
 */
const SUPPORTED_ATS_HOSTS = [
  "boards.greenhouse.io",
  "job-boards.greenhouse.io",
  "jobs.greenhouse.io",
  "jobs.lever.co",
  "jobs.eu.lever.co",
  "apply.workable.com",
  ".workable.com/j/",
];

function isSupportedAts(url: string): boolean {
  const lower = url.toLowerCase();
  return SUPPORTED_ATS_HOSTS.some((h) => lower.includes(h));
}

/**
 * Forma del job restituito dall'attore Apify. I nomi dei campi variano
 * leggermente tra attori diversi — qui cerchiamo tutte le varianti note.
 */
/**
 * Shape restituita da apimaestro/linkedin-jobs-scraper-api.
 * Alcuni alias extra (camelCase) coperti per compatibilità con altri attori.
 */
interface ApifyRaw {
  // apimaestro — snake_case
  job_id?: string;
  job_title?: string;
  job_url?: string; // LinkedIn internal — skip
  apply_url?: string; // external (ATS) apply link
  company?: string;
  location?: string;
  description?: string;
  work_type?: string;
  posted_at?: string;
  posted_at_epoch?: number;
  is_easy_apply?: boolean;
  // generic/camelCase fallbacks (bebity, altri attori)
  id?: string;
  title?: string;
  companyName?: string;
  applyUrl?: string;
  applyLink?: string;
  externalApplyLink?: string;
  externalApplyUrl?: string;
  jobUrl?: string;
  descriptionHtml?: string;
  descriptionText?: string;
  workType?: string;
  employmentType?: string;
  postedAt?: string;
  listedAt?: string | number;
}

function pickExternalApplyUrl(j: ApifyRaw): string | null {
  const candidates = [
    j.apply_url,
    j.externalApplyUrl,
    j.externalApplyLink,
    j.applyUrl,
    j.applyLink,
    j.jobUrl,
  ];
  for (const c of candidates) {
    if (!c || typeof c !== "string") continue;
    if (c.toLowerCase().includes("linkedin.com")) continue;
    if (isSupportedAts(c)) return c;
  }
  return null;
}

function pickExternalId(j: ApifyRaw, fallbackUrl: string): string {
  return (
    j.job_id ??
    j.id ??
    fallbackUrl.replace(/^https?:\/\//, "").slice(0, 120)
  );
}

function parsePostedAt(j: ApifyRaw): Date {
  if (j.posted_at_epoch) return new Date(j.posted_at_epoch);
  const v = j.posted_at ?? j.postedAt ?? j.listedAt;
  if (!v) return new Date();
  if (typeof v === "number") return new Date(v);
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

/**
 * Una singola query = un ruolo + location. L'attore ritorna fino a
 * `maxPerQuery` job. Teniamo solo quelli con applyUrl su ATS supportato.
 */
export async function fetchLinkedinViaApify(
  queries: { search: string; location?: string }[],
  maxPerQuery = 50,
): Promise<JobListItem[]> {
  const token = process.env.APIFY_TOKEN;
  if (!token) {
    console.warn("[linkedin-apify] APIFY_TOKEN non settato, skip");
    return [];
  }

  const all: JobListItem[] = [];
  for (const q of queries) {
    const runUrl = `https://api.apify.com/v2/acts/${APIFY_ACTOR}/run-sync-get-dataset-items?token=${token}&timeout=180`;
    const body = {
      // apimaestro shape
      keywords: q.search,
      location: q.location ?? "Italy",
      rows: maxPerQuery,
      // fallback per altri attori (bebity/misceres)
      searchQueries: [q.search],
      locationName: q.location ?? "Italy",
      datePosted: "r604800", // last 7 days
      count: maxPerQuery,
      proxy: { useApifyProxy: true },
    };
    try {
      const res = await fetch(runUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(120_000),
      });
      if (!res.ok) {
        console.warn(
          `[linkedin-apify] HTTP ${res.status} for "${q.search}"`,
        );
        continue;
      }
      const raw = (await res.json()) as ApifyRaw[];
      console.log(
        `[linkedin-apify] "${q.search}" → ${raw.length} raw jobs`,
      );

      for (const j of raw) {
        const applyUrl = pickExternalApplyUrl(j);
        if (!applyUrl) continue;
        const title = j.job_title ?? j.title;
        if (!title) continue;

        const id = pickExternalId(j, applyUrl);
        const desc = (
          j.description ?? j.descriptionText ?? j.descriptionHtml ?? ""
        ).slice(0, 4000);
        const location = j.location ?? null;
        const workType = j.work_type ?? j.workType ?? j.employmentType ?? null;
        all.push({
          externalId: id,
          source: "linkedin",
          sourceSlug: null,
          title,
          company: j.company ?? j.companyName ?? "",
          location,
          description: desc,
          url: applyUrl, // ← submitterà sul ATS reale, non su LinkedIn
          contractType: workType,
          remote: /remote|remoto|smart working/i.test(
            `${title} ${location ?? ""} ${workType ?? ""}`,
          ),
          salaryMin: null,
          salaryMax: null,
          category: null,
          postedAt: parsePostedAt(j),
          recruiterEmail: null,
          recruiterScrapedAt: null,
        } as unknown as JobListItem);
      }
    } catch (err) {
      console.error(`[linkedin-apify] "${q.search}" errored`, err);
    }
  }

  // Dedup by (source, url)
  const seen = new Set<string>();
  const out: JobListItem[] = [];
  for (const j of all) {
    if (seen.has(j.url)) continue;
    seen.add(j.url);
    out.push(j);
  }
  console.log(
    `[linkedin-apify] kept ${out.length}/${all.length} after ATS filter + dedup`,
  );
  return out;
}

/**
 * Query di default per il cron — ruoli tech/design/product italiani + EU.
 * Mix posizioni dipendente + gig freelance/contract (per utenti P.IVA).
 * In produzione si può spostare in DB / env.
 */
export const DEFAULT_LINKEDIN_QUERIES: { search: string; location?: string }[] =
  [
    // Italia città principali — massima priorità per il pool italiano
    { search: "Product Designer", location: "Milan, Italy" },
    { search: "Frontend Developer", location: "Milan, Italy" },
    { search: "Full Stack Engineer", location: "Milan, Italy" },
    { search: "Product Manager", location: "Milan, Italy" },
    { search: "Backend Engineer", location: "Milan, Italy" },
    { search: "UX Designer", location: "Milan, Italy" },
    { search: "Software Engineer", location: "Milan, Italy" },
    { search: "Data Engineer", location: "Milan, Italy" },
    { search: "Product Designer", location: "Rome, Italy" },
    { search: "Software Engineer", location: "Rome, Italy" },
    { search: "Product Manager", location: "Rome, Italy" },
    { search: "Product Designer", location: "Turin, Italy" },
    { search: "Software Engineer", location: "Bologna, Italy" },
    // Italia (nazionale / remoto)
    { search: "Product Designer", location: "Italy" },
    { search: "Frontend Developer", location: "Italy" },
    { search: "Full Stack Engineer", location: "Italy" },
    { search: "Product Manager", location: "Italy" },
    { search: "DevOps Engineer", location: "Italy" },
    // EU fallback — aziende Italia-friendly
    { search: "Product Designer", location: "European Union" },
    { search: "Software Engineer", location: "European Union" },
    // Freelance / contract / P.IVA
    { search: "Freelance Product Designer", location: "Italy" },
    { search: "Freelance Frontend Developer", location: "Italy" },
    { search: "Contract Full Stack", location: "Italy" },
    { search: "Consulente informatico", location: "Milan, Italy" },
    { search: "Project Product Designer", location: "European Union" },
  ];
