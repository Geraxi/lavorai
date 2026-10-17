import type { JobListItem } from "@/lib/adzuna";
import { cleanHtmlText } from "./html-clean";

/**
 * Ashby public job board API. Nessuna auth richiesta.
 *
 * URL: https://api.ashbyhq.com/posting-api/job-board/<orgSlug>?includeCompensation=true
 * Risposta:
 *   { jobs: [{
 *       id, title, location, secondaryLocations, department, team,
 *       employmentType, isRemote, workplaceType, publishedAt, jobUrl,
 *       applyUrl, descriptionHtml, ...
 *     }]
 *   }
 *
 * jobUrl punta a `https://jobs.ashbyhq.com/<org>/<uuid>` — direttamente
 * compatibile col nostro adapter Ashby.
 */

interface AshbyJob {
  id: string;
  title: string;
  /** The posting-api field. (`locationName`/`departmentName` are not returned
   * by this API; reading only them stored every Ashby job with location null.) */
  location?: string | null;
  department?: string | null;
  locationName?: string | null;
  departmentName?: string | null;
  employmentType?: string | null;
  publishedAt?: string | null;
  jobUrl: string;
  applyUrl?: string | null;
  descriptionHtml?: string | null;
  isRemote?: boolean;
  workplaceType?: string | null;
  /** Structured scope: `addressCountry` can be a country or a list ("US | EU"). */
  address?: { postalAddress?: { addressCountry?: string | null; addressRegion?: string | null; addressLocality?: string | null } | null } | null;
  secondaryLocations?: Array<{ location?: string | null; address?: AshbyJob["address"] }> | null;
}

/**
 * Display + match location from Ashby's structured fields. A posting titled
 * just "Remote" usually carries its real scope in `address` and
 * `secondaryLocations` (PostHog: "Remote", country "US | EU", secondary
 * "Remote, USA"); keeping only "Remote" made it unverifiable.
 */
export function ashbyLocation(j: Pick<AshbyJob, "location" | "locationName" | "address" | "secondaryLocations">): string | null {
  const primary = (typeof j.location === "string" && j.location.trim()) || (typeof j.locationName === "string" && j.locationName.trim()) || "";
  const parts: string[] = [];
  const add = (v: unknown) => {
    if (typeof v !== "string") return;
    const t = v.trim();
    if (t && !parts.some((p) => p.toLowerCase() === t.toLowerCase())) parts.push(t);
  };
  add(primary);
  const country = (a: AshbyJob["address"]) => a?.postalAddress?.addressCountry;
  add(country(j.address));
  for (const s of Array.isArray(j.secondaryLocations) ? j.secondaryLocations.slice(0, 8) : []) {
    add(s?.location);
    add(country(s?.address));
  }
  return parts.length ? parts.join(" · ") : null;
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
  const location = ashbyLocation(j);
  const loc = location ?? "";
  if (!isRelevantLocation(loc, description, !!j.isRemote)) return null;
  return {
    id: "",
    externalId: String(j.id),
    source: "ashby",
    sourceSlug: orgSlug,
    title: j.title,
    company: companyName,
    location,
    description,
    url: j.jobUrl,
    contractType: j.employmentType ?? null,
    // workplaceType is authoritative when present: Ashby sets isRemote on
    // Hybrid postings too (OpenAI "San Francisco", Hybrid, isRemote=true).
    // A "Remote (United States)" secondary location still marks it remote.
    remote: (j.workplaceType ? j.workplaceType.toLowerCase() === "remote" : !!j.isRemote) || /\bremote|remoto\b/i.test(loc),
    salaryMin: null,
    salaryMax: null,
    category: j.department ?? j.departmentName ?? "IT Jobs",
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
