import type { JobListItem } from "@/lib/adzuna";
import { cleanHtmlText } from "./html-clean";

/**
 * Ashby public job board API. Nessuna auth richiesta.
 *
 * URL: https://api.ashbyhq.com/posting-api/job-board/<orgSlug>?includeCompensation=true
 * Risposta:
 *   { jobs: [{
 *       id, title, locationName, departmentName, employmentType,
 *       publishedAt, jobUrl, applyUrl, descriptionHtml, ...
 *     }]
 *   }
 *
 * jobUrl punta a `https://jobs.ashbyhq.com/<org>/<uuid>` — direttamente
 * compatibile col nostro adapter Ashby.
 */

interface AshbyJob {
  id: string;
  title: string;
  locationName?: string | null;
  departmentName?: string | null;
  employmentType?: string | null;
  publishedAt?: string | null;
  jobUrl: string;
  applyUrl?: string | null;
  descriptionHtml?: string | null;
  isRemote?: boolean;
}

export async function fetchAshbyJobs(
  orgSlug: string,
  companyName?: string,
): Promise<JobListItem[]> {
  const url = `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(orgSlug)}?includeCompensation=true`;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 LavorAI/1.0 jobs-sync",
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      console.warn(`[ashby] ${orgSlug} → ${res.status}`);
      return [];
    }
    const data = (await res.json()) as { jobs?: AshbyJob[] };
    const jobs = Array.isArray(data.jobs) ? data.jobs : [];
    const display = companyName ?? prettySlug(orgSlug);
    return jobs
      .map((j) => mapJob(j, display, orgSlug))
      .filter((j): j is JobListItem => j !== null);
  } catch (err) {
    console.warn(`[ashby] ${orgSlug} fetch failed`, err);
    return [];
  }
}

export async function fetchAshbyMulti(
  companies: Array<{ slug: string; name?: string }>,
  concurrency = 4,
): Promise<JobListItem[]> {
  const out: JobListItem[] = [];
  const queue = [...companies];
  async function worker() {
    while (queue.length > 0) {
      const c = queue.shift();
      if (!c) return;
      const list = await fetchAshbyJobs(c.slug, c.name);
      out.push(...list);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return out;
}

function mapJob(
  j: AshbyJob,
  companyName: string,
  orgSlug: string,
): JobListItem | null {
  const description = cleanHtmlText(j.descriptionHtml).slice(0, 2000);
  const loc = j.locationName ?? "";
  if (!isRelevantLocation(loc, description, !!j.isRemote)) return null;
  return {
    id: "",
    externalId: String(j.id),
    source: "ashby",
    sourceSlug: orgSlug,
    title: j.title,
    company: companyName,
    location: j.locationName ?? null,
    description,
    url: j.jobUrl,
    contractType: j.employmentType ?? null,
    remote: !!j.isRemote || /\bremote|remoto\b/i.test(loc),
    salaryMin: null,
    salaryMax: null,
    category: j.departmentName ?? "IT Jobs",
    postedAt: j.publishedAt ? new Date(j.publishedAt) : new Date(),
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

function isRelevantLocation(
  loc: string,
  description: string,
  isRemote: boolean,
): boolean {
  const combined = `${loc} ${description.slice(0, 400)}`.toLowerCase();
  const yes = [
    "italy", "italia", "milan", "milano", "rome", "roma", "torino", "turin",
    "firenze", "bologna",
    "europe", "europa", "eu ", "emea",
    "germany", "germania", "france", "francia", "spain", "spagna",
    "netherlands", "portugal", "portogallo", "ireland", "irlanda",
    "belgium", "austria", "switzerland", "svizzera", "denmark", "sweden",
    "finland", "poland", "czech",
    "uk", "united kingdom", "london", "londra",
  ];
  const no = [
    "united states only", "us only", "usa only", "canada only",
    "apac only", "brazil", "mexico", "singapore only", "japan only",
    "india only", "anywhere in the us", "us-based",
  ];
  if (isRemote && !no.some((n) => combined.includes(n))) return true;
  if (/\bremote\b/.test(combined) && !no.some((n) => combined.includes(n)))
    return true;
  if (yes.some((y) => combined.includes(y))) return true;
  return false;
}
