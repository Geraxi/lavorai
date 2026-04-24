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
  process.env.APIFY_LINKEDIN_ACTOR ?? "bebity~linkedin-jobs-scraper";

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
interface ApifyRaw {
  id?: string;
  jobId?: string;
  trackingId?: string;
  title?: string;
  companyName?: string;
  company?: string;
  location?: string;
  description?: string;
  descriptionHtml?: string;
  descriptionText?: string;
  link?: string; // LinkedIn URL
  jobUrl?: string;
  applyUrl?: string;
  applyLink?: string;
  externalApplyLink?: string;
  externalApplyUrl?: string;
  postedAt?: string;
  postedTime?: string;
  listedAt?: string | number;
  workType?: string;
  contractType?: string;
  employmentType?: string;
}

function pickExternalApplyUrl(j: ApifyRaw): string | null {
  const candidates = [
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
    j.id ??
    j.jobId ??
    j.trackingId ??
    fallbackUrl.replace(/^https?:\/\//, "").slice(0, 120)
  );
}

function parsePostedAt(j: ApifyRaw): Date {
  const v = j.postedAt ?? j.postedTime ?? j.listedAt;
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
    const runUrl = `https://api.apify.com/v2/acts/${APIFY_ACTOR}/run-sync-get-dataset-items?token=${token}`;
    const body = {
      queries: [q.search],
      searchQueries: [q.search],
      location: q.location ?? "Italy",
      locationName: q.location ?? "Italy",
      datePosted: "r604800", // last 7 days
      rows: maxPerQuery,
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
        if (!j.title) continue;

        const id = pickExternalId(j, applyUrl);
        const desc = (j.description ?? j.descriptionText ?? "").slice(0, 4000);
        all.push({
          externalId: id,
          source: "linkedin",
          sourceSlug: null,
          title: j.title,
          company: j.companyName ?? j.company ?? "",
          location: j.location ?? null,
          description: desc,
          url: applyUrl, // ← submitterà sul ATS reale, non su LinkedIn
          contractType: j.employmentType ?? j.contractType ?? j.workType ?? null,
          remote: /remote|remoto|smart working/i.test(
            `${j.title} ${j.location ?? ""}`,
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
 * In produzione si può spostare in DB / env.
 */
export const DEFAULT_LINKEDIN_QUERIES: { search: string; location?: string }[] =
  [
    { search: "Product Designer", location: "Italy" },
    { search: "Frontend Developer", location: "Italy" },
    { search: "Full Stack Engineer", location: "Italy" },
    { search: "Product Manager", location: "Italy" },
    { search: "Data Engineer", location: "Italy" },
    { search: "DevOps Engineer", location: "Italy" },
    { search: "Product Designer", location: "European Union" },
    { search: "Software Engineer", location: "European Union" },
  ];
