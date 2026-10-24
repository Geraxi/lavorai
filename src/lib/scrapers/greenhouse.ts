import type { JobListItem } from "@/lib/adzuna";
import { companyWebsiteFromPublishedSource } from "@/lib/recruiter-email";
import { cleanHtmlText } from "./html-clean";

/**
 * Greenhouse public Job Board API. Nessuna auth richiesta.
 *
 * URL pattern: https://boards-api.greenhouse.io/v1/boards/<slug>/jobs?content=true
 *
 * Risposta:
 *   { jobs: [{
 *       id, title, absolute_url, location.{name}, updated_at,
 *       content (HTML), departments, offices, metadata,
 *     }]
 *   }
 */

export interface GreenhouseJob {
  id: number;
  title: string;
  absolute_url: string;
  location?: { name: string };
  updated_at?: string;
  content?: string;
  departments?: Array<{ name: string }>;
}

/** Fetch jobs di una singola azienda via slug Greenhouse. */
export async function fetchGreenhouseJobs(
  companySlug: string,
  companyName?: string,
): Promise<JobListItem[]> {
  const url = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(companySlug)}/jobs?content=true`;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 LavorAI/1.0 jobs-sync",
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      console.warn(`[greenhouse] ${companySlug} → ${res.status}`);
      return [];
    }
    const data = (await res.json()) as { jobs: GreenhouseJob[] };
    const jobs = Array.isArray(data.jobs) ? data.jobs : [];
    const display = companyName ?? prettySlug(companySlug);
    const boardWebsite = await fetchGreenhouseBoardWebsite(companySlug, display);
    return jobs
      .map((j) => mapJob(j, display, companySlug, boardWebsite))
      .filter((j): j is JobListItem => j !== null);
  } catch (err) {
    console.warn(`[greenhouse] ${companySlug} fetch failed`, err);
    return [];
  }
}

/** Batch su una lista di slug. */
export async function fetchGreenhouseMulti(
  companies: Array<{ slug: string; name?: string }>,
  concurrency = 4,
): Promise<JobListItem[]> {
  const out: JobListItem[] = [];
  const queue = [...companies];
  async function worker() {
    while (queue.length > 0) {
      const c = queue.shift();
      if (!c) return;
      const list = await fetchGreenhouseJobs(c.slug, c.name);
      out.push(...list);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return out;
}

/** Employer site from job HTML, custom absolute_url, or board content. Never a tenant slug. */
export function greenhouseCompanyWebsite(
  job: Pick<GreenhouseJob, "content" | "absolute_url">,
  companyName: string,
  boardWebsite?: string | null,
): string | null {
  return companyWebsiteFromPublishedSource(job.content ?? "", companyName, job.absolute_url)
    ?? companyWebsiteFromPublishedSource(job.absolute_url, companyName, job.absolute_url)
    ?? boardWebsite
    ?? null;
}

async function fetchGreenhouseBoardWebsite(companySlug: string, companyName: string): Promise<string | null> {
  try {
    const res = await fetch(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(companySlug)}`, {
      headers: {
        "User-Agent": "Mozilla/5.0 LavorAI/1.0 jobs-sync",
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;
    const board = (await res.json()) as { content?: string; url?: string; name?: string };
    return companyWebsiteFromPublishedSource(JSON.stringify(board), companyName)
      ?? companyWebsiteFromPublishedSource(board.content ?? "", companyName)
      ?? (typeof board.url === "string" ? companyWebsiteFromPublishedSource(board.url, companyName, board.url) : null);
  } catch {
    return null;
  }
}

function mapJob(
  j: GreenhouseJob,
  companyName: string,
  companySlug: string,
  boardWebsite?: string | null,
): JobListItem | null {
  const description = cleanHtmlText(j.content).slice(0, 2000);
  // Filtro geo: vogliamo solo Italia, Europa o Remoto
  const loc = j.location?.name ?? "";
  if (!isRelevantLocation(loc, description)) return null;
  // Priorità URL: canonico boards.greenhouse.io (più affidabile per adapter).
  // absolute_url spesso redirige su careers.<company>.com con iframe — rischio.
  const canonicalUrl = `https://boards.greenhouse.io/${companySlug}/jobs/${j.id}`;
  return {
    id: "", // Prisma assegnerà via cuid() in upsert
    externalId: String(j.id),
    source: "greenhouse",
    sourceSlug: companySlug,
    title: j.title,
    company: companyName,
    location: j.location?.name ?? null,
    description,
    url: canonicalUrl,
    companyWebsite: greenhouseCompanyWebsite(j, companyName, boardWebsite),
    contractType: null,
    remote: /\bremote|remoto\b/i.test(j.location?.name ?? ""),
    salaryMin: null,
    salaryMax: null,
    category:
      j.departments && j.departments.length > 0
        ? j.departments[0].name
        : "IT Jobs",
    postedAt: j.updated_at ? new Date(j.updated_at) : new Date(),
    recruiterEmail: null,
    recruiterScrapedAt: null,
  } as unknown as JobListItem;
}

function prettySlug(s: string): string {
  return s
    .split(/[-_]/)
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : ""))
    .join(" ");
}

/**
 * Italia / Europa / Remoto only. Accetta tutto ciò che non è
 * chiaramente fuori area (US-only, APAC, LATAM).
 */
function isRelevantLocation(loc: string, description: string): boolean {
  const combined = `${loc} ${description.slice(0, 400)}`.toLowerCase();
  const yes = [
    "italy", "italia", "italian", "milan", "milano", "rome", "roma", "napoli", "naples",
    "torino", "turin", "firenze", "florence", "bologna", "genova", "venezia", "padova", "verona",
    "europe", "europa", "eu ", "emea",
    "germany", "germania", "france", "francia", "spain", "spagna", "netherlands", "paesi bassi",
    "portugal", "portogallo", "ireland", "irlanda", "belgium", "belgio", "austria", "switzerland",
    "svizzera", "denmark", "danimarca", "sweden", "svezia", "finland", "finlandia", "poland",
    "polonia", "czech", "repubblica ceca",
    "uk", "united kingdom", "london", "londra",
  ];
  const no = [
    "united states only", "us only", "usa only", "canada only",
    "apac only", "brazil", "mexico", "singapore only", "japan only", "india only",
    "anywhere in the us", "us-based",
  ];
  if (/\bremote\b/.test(combined) && !no.some((n) => combined.includes(n))) return true;
  if (yes.some((y) => combined.includes(y))) return true;
  return false;
}
