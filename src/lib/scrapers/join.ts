import type { JobListItem } from "@/lib/adzuna";
import { cleanHtmlText } from "./html-clean";
import { isEuRelevant, runPool } from "./feed-utils";

/**
 * JOIN (join.com) — ATS molto diffuso tra startup e PMI italiane ed
 * europee. Nessuna API pubblica, ma la pagina azienda è Next.js con
 * __NEXT_DATA__ che contiene la lista annunci:
 *   https://join.com/companies/<slug>            → jobs.items[]
 *   https://join.com/companies/<slug>/<idParam>  → descriptionHtml
 * Tenant dalla discovery sugli URL già in pool.
 */

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36";

interface JoinJob {
  idParam?: string;
  id?: number;
  title?: string;
  createdAt?: string;
  workplaceType?: string;
  city?: { cityName?: string; countryName?: string };
  employmentType?: { name?: string };
  category?: { name?: string };
  country?: { iso3166?: string };
}

function nextData(html: string): unknown | null {
  const m = html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) return null;
  try { return JSON.parse(m[1]); } catch { return null; }
}

function findKey(obj: unknown, key: string, depth = 0): unknown {
  if (!obj || typeof obj !== "object" || depth > 12) return undefined;
  if (key in (obj as Record<string, unknown>)) return (obj as Record<string, unknown>)[key];
  for (const v of Object.values(obj as Record<string, unknown>)) {
    const r = findKey(v, key, depth + 1);
    if (r !== undefined) return r;
  }
  return undefined;
}

export async function fetchJoinJobs(slug: string, companyName?: string, withDescriptions = true): Promise<JobListItem[]> {
  try {
    const res = await fetch(`https://join.com/companies/${slug}`, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return [];
    const data = nextData(await res.text());
    const jobs = findKey(data, "jobs") as { items?: JoinJob[] } | JoinJob[] | undefined;
    const items = Array.isArray(jobs) ? jobs : jobs?.items ?? [];
    const company = companyName || ((findKey(data, "company") as { name?: string } | undefined)?.name ?? prettySlug(slug));
    const out: JobListItem[] = [];
    for (const j of items.slice(0, 100)) {
      if (!j.idParam || !j.title) continue;
      const loc = [j.city?.cityName, j.city?.countryName].filter(Boolean).join(", ") || null;
      const remote = /remote/i.test(j.workplaceType ?? "");
      const url = `https://join.com/companies/${slug}/${j.idParam}`;
      let description = "";
      if (withDescriptions) {
        try {
          const d = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(10_000) });
          if (d.ok) description = cleanHtmlText((findKey(nextData(await d.text()), "descriptionHtml") as string | undefined) ?? "");
        } catch { /* senza descrizione */ }
      }
      description = description.slice(0, 2000);
      if (!isEuRelevant(`${loc ?? ""} ${remote ? "remote" : ""}`, description)) continue;
      out.push({
        id: "",
        externalId: String(j.id ?? j.idParam),
        source: "join",
        sourceSlug: slug,
        title: j.title,
        company,
        location: loc,
        description,
        url,
        contractType: j.employmentType?.name ?? null,
        remote,
        salaryMin: null,
        salaryMax: null,
        category: j.category?.name || "Altro",
        postedAt: j.createdAt ? new Date(j.createdAt) : new Date(),
        recruiterEmail: null,
        recruiterScrapedAt: null,
      } as unknown as JobListItem);
    }
    return out;
  } catch (err) {
    console.warn(`[join] ${slug} failed`, err instanceof Error ? err.message : err);
    return [];
  }
}

export async function fetchJoinMulti(companies: Array<{ slug: string; name?: string }>, concurrency = 2): Promise<JobListItem[]> {
  return runPool(companies, concurrency, (c) => fetchJoinJobs(c.slug, c.name));
}

function prettySlug(s: string): string {
  return s.split(/[-_]/).map((w) => (w ? w[0].toUpperCase() + w.slice(1) : "")).join(" ");
}
