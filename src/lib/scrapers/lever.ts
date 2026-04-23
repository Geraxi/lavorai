import type { JobListItem } from "@/lib/adzuna";

/**
 * Lever public Postings API. Nessuna auth richiesta.
 *
 * URL pattern: https://api.lever.co/v0/postings/<slug>?mode=json
 *
 * Risposta: array di posting con id, text, descriptionPlain, categories,
 * hostedUrl, createdAt, applyUrl.
 */

export interface LeverPosting {
  id: string;
  text: string;
  descriptionPlain?: string;
  description?: string;
  hostedUrl: string;
  applyUrl?: string;
  createdAt?: number;
  categories?: {
    location?: string;
    team?: string;
    department?: string;
    commitment?: string;
    allLocations?: string[];
  };
  workplaceType?: string;
}

export async function fetchLeverJobs(
  companySlug: string,
  companyName?: string,
): Promise<JobListItem[]> {
  const url = `https://api.lever.co/v0/postings/${encodeURIComponent(companySlug)}?mode=json`;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 LavorAI/1.0 jobs-sync",
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      console.warn(`[lever] ${companySlug} → ${res.status}`);
      return [];
    }
    const data = (await res.json()) as LeverPosting[];
    if (!Array.isArray(data)) return [];
    const display = companyName ?? prettySlug(companySlug);
    return data.map((p) => mapPosting(p, display, companySlug));
  } catch (err) {
    console.warn(`[lever] ${companySlug} fetch failed`, err);
    return [];
  }
}

export async function fetchLeverMulti(
  companies: Array<{ slug: string; name?: string }>,
  concurrency = 4,
): Promise<JobListItem[]> {
  const out: JobListItem[] = [];
  const queue = [...companies];
  async function worker() {
    while (queue.length > 0) {
      const c = queue.shift();
      if (!c) return;
      const list = await fetchLeverJobs(c.slug, c.name);
      out.push(...list);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return out;
}

function mapPosting(
  p: LeverPosting,
  companyName: string,
  companySlug?: string,
): JobListItem {
  const description =
    (p.descriptionPlain ?? p.description ?? "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 2000);
  const location =
    p.categories?.location ??
    (p.categories?.allLocations && p.categories.allLocations[0]) ??
    null;
  return {
    id: "",
    externalId: p.id,
    source: "lever",
    sourceSlug: companySlug ?? null,
    title: p.text,
    company: companyName,
    location,
    description,
    url: p.hostedUrl,
    contractType: p.categories?.commitment ?? null,
    remote:
      (p.workplaceType ?? "").toLowerCase() === "remote" ||
      /\bremote|remoto\b/i.test(location ?? ""),
    salaryMin: null,
    salaryMax: null,
    category:
      p.categories?.department ?? p.categories?.team ?? "IT Jobs",
    postedAt: p.createdAt ? new Date(p.createdAt) : new Date(),
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
