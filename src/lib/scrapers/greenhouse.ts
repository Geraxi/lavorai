import type { JobListItem } from "@/lib/adzuna";

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
    return jobs.map((j) => mapJob(j, display, companySlug));
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

function mapJob(
  j: GreenhouseJob,
  companyName: string,
  companySlug: string,
): JobListItem {
  const cleanHtml = (j.content ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const description = cleanHtml.slice(0, 2000);
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
