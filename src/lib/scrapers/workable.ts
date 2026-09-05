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

interface WorkableJob {
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
  employment_type?: string;
  department?: string;
  created_at?: string;
  published_on?: string;
  url?: string;
}

export async function fetchWorkableJobs(
  slug: string,
  companyName?: string,
): Promise<JobListItem[]> {
  const endpoint = `https://apply.workable.com/api/v3/accounts/${encodeURIComponent(slug)}/jobs`;
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "User-Agent": "Mozilla/5.0 LavorAI/1.0 jobs-sync",
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: "", location: [], department: [] }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      console.warn(`[workable] ${slug} → ${res.status}`);
      return [];
    }
    const data = (await res.json()) as {
      results?: WorkableJob[];
      jobs?: WorkableJob[];
    };
    const jobs = data.results ?? data.jobs ?? [];
    if (!Array.isArray(jobs)) return [];
    const display = companyName ?? prettySlug(slug);
    return jobs
      .map((j) => mapJob(j, display, slug))
      .filter((j): j is JobListItem => j !== null);
  } catch (err) {
    console.warn(`[workable] ${slug} fetch failed`, err);
    return [];
  }
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
  const location = locParts[0] ?? null;
  const locStr = locParts.join(" ");
  const description = cleanHtmlText(j.description ?? "").slice(0, 2000);
  if (!isRelevant(`${locStr} ${j.remote || j.telecommuting ? "remote" : ""}`, description))
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
    remote: Boolean(j.remote || j.telecommuting) || /\bremote|remoto\b/i.test(locStr),
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
    postedAt: j.published_on || j.created_at ? new Date(j.published_on ?? j.created_at!) : new Date(),
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
