import type { JobListItem } from "@/lib/adzuna";
import { cleanHtmlText } from "./html-clean";

/**
 * Workable public jobs API. Niente auth.
 *
 * Endpoint: POST https://apply.workable.com/api/v3/accounts/<slug>/jobs
 *   body {} → { results: [{ shortcode, title, location, ... }], nextPage }
 *
 * URL candidatura (compatibile con l'adapter Workable):
 *   https://apply.workable.com/<slug>/j/<shortcode>/
 *
 * Perché Workable: lo usano TANTE PMI / scaleup che — a differenza dei big
 * su Greenhouse/Ashby — raramente mettono captcha → form realmente
 * auto-inviabili.
 */

export interface WorkableJob {
  id?: string;
  shortcode?: string;
  title?: string;
  description?: string;
  location?: {
    city?: string;
    region?: string;
    country?: string;
    countryCode?: string;
  } | null;
  locations?: Array<{ city?: string; country?: string }>;
  remote?: boolean;
  telecommuting?: boolean;
  /** v3 feed: "remote" | "hybrid" | "on_site". */
  workplace?: string;
  /** v3 feed publish timestamp. */
  published?: string;
  employment_type?: string;
  department?: string;
  created_at?: string;
  published_on?: string;
  url?: string;
}

/** Raw public feed of one Workable account; null when the account does not
 * exist or the request failed (so callers can tell "no jobs" from "no account"). */
export async function fetchWorkableAccountRaw(slug: string, timeoutMs = 15_000, maxPages = 25): Promise<WorkableJob[] | null> {
  const endpoint = `https://apply.workable.com/api/v3/accounts/${encodeURIComponent(slug)}/jobs`;
  const out: WorkableJob[] = [];
  let token: string | undefined;
  try {
    // The feed is paged 10 at a time ({ results, nextPage }). Reading only the
    // first page missed every later posting and let closeMissingJobs close them.
    for (let page = 0; page < maxPages; page++) {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "User-Agent": "Mozilla/5.0 LavorAI/1.0 jobs-sync",
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query: "", location: [], department: [], ...(token ? { token } : {}) }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) {
        console.warn(`[workable] ${slug} → ${res.status}`);
        // A failed later page must not look like a complete feed.
        return null;
      }
      const data = (await res.json()) as {
        results?: WorkableJob[];
        jobs?: WorkableJob[];
        nextPage?: string | null;
      };
      const jobs = data.results ?? data.jobs ?? [];
      if (!Array.isArray(jobs)) return null;
      out.push(...jobs);
      token = typeof data.nextPage === "string" && data.nextPage ? data.nextPage : undefined;
      if (!token || jobs.length === 0) return out;
    }
    // Page cap reached: the list may be incomplete, so do not offer it as the
    // full board (closeMissingJobs would close the unseen tail).
    console.warn(`[workable] ${slug} more than ${maxPages} pages; feed treated as incomplete`);
    return null;
  } catch (err) {
    console.warn(`[workable] ${slug} fetch failed`, err);
    return null;
  }
}

/** Map an account feed to pool rows (same filter as the curated sync). */
export function mapWorkableAccountJobs(jobs: WorkableJob[], slug: string, companyName?: string): JobListItem[] {
  const display = companyName ?? prettySlug(slug);
  return jobs
    .map((j) => mapJob(j, display, slug))
    .filter((j): j is JobListItem => j !== null);
}

export async function fetchWorkableJobs(
  slug: string,
  companyName?: string,
): Promise<JobListItem[]> {
  const jobs = await fetchWorkableAccountRaw(slug);
  return jobs ? mapWorkableAccountJobs(jobs, slug, companyName) : [];
}

export async function fetchWorkableMulti(
  companies: Array<{ slug: string; name?: string }>,
  concurrency = 4,
): Promise<JobListItem[]> {
  const out: JobListItem[] = [];
  const queue = [...companies];
  async function worker() {
    while (queue.length > 0) {
      const c = queue.shift();
      if (!c) return;
      out.push(...(await fetchWorkableJobs(c.slug, c.name)));
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return out;
}

function mapJob(
  j: WorkableJob,
  companyName: string,
  slug: string,
): JobListItem | null {
  const shortcode = j.shortcode ?? j.id;
  if (!shortcode || !j.title) return null;
  const locParts = [
    j.location?.city,
    j.location?.region,
    j.location?.country,
    ...(j.locations ?? []).flatMap((l) => [l.city, l.country]),
  ].filter(Boolean);
  // "City, Country" (or just the country for remote postings) so country-level
  // preferences and remote scopes can be checked; the first part alone lost it.
  const location = Array.from(new Set([j.location?.city, j.location?.country]
    .map((v) => (typeof v === "string" ? v.trim() : "")).filter(Boolean))).join(", ") || (locParts[0] ?? null);
  const locStr = locParts.join(" ");
  const description = cleanHtmlText(j.description ?? "").slice(0, 2000);
  if (!isRelevant(`${locStr} ${j.remote || j.telecommuting || j.workplace === "remote" ? "remote" : ""}`, description))
    return null;
  return {
    id: "",
    externalId: String(shortcode),
    source: "workable",
    sourceSlug: slug,
    title: j.title,
    company: companyName,
    location,
    description,
    url: `https://apply.workable.com/${slug}/j/${shortcode}/`,
    contractType: j.employment_type ?? null,
    remote: Boolean(j.remote || j.telecommuting) || j.workplace === "remote" || /\bremote|remoto\b/i.test(locStr),
    salaryMin: null,
    salaryMax: null,
    // Workable a volte restituisce department come array (o vuoto) → Prisma
    // Job.category è String? → normalizza, altrimenti l'upsert fallisce per
    // TUTTI gli annunci Workable (visto nei log: "Expected String, provided (String)").
    category: (() => {
      const d: unknown = j.department;
      if (Array.isArray(d)) return d.filter(Boolean).map(String).join(", ") || "IT Jobs";
      if (typeof d === "string" && d.trim()) return d;
      return "IT Jobs";
    })(),
    postedAt: j.published_on || j.published || j.created_at ? new Date((j.published_on ?? j.published ?? j.created_at)!) : new Date(),
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

function isRelevant(loc: string, description: string): boolean {
  const c = `${loc} ${description.slice(0, 400)}`.toLowerCase();
  const yes = [
    "italy", "italia", "milan", "milano", "rome", "roma", "torino", "turin",
    "firenze", "bologna", "europe", "europa", "emea", "germany", "france",
    "francia", "spain", "spagna", "netherlands", "portugal", "ireland",
    "belgium", "austria", "switzerland", "svizzera", "uk", "united kingdom",
    "london", "londra", "remote",
  ];
  const no = ["us only", "usa only", "canada only", "us-based", "anywhere in the us"];
  if (no.some((n) => c.includes(n))) return false;
  return yes.some((y) => c.includes(y));
}
