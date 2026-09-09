import type { JobListItem } from "@/lib/adzuna";
import { cleanHtmlText } from "./html-clean";
import { isEuRelevant, runPool } from "./feed-utils";

/**
 * Breezy HR — ogni career portal espone un JSON pubblico:
 *   https://<slug>.breezy.hr/json            (lista posizioni)
 *   https://<slug>.breezy.hr/json/position/<id>  (dettaglio con description)
 * Form pubblico: https://<slug>.breezy.hr/p/<friendly_id>/apply
 * I tenant arrivano dalla discovery sugli URL già in pool (tenant-discovery).
 */

const UA = "Mozilla/5.0 LavorAI/1.0 jobs-sync";

interface BreezyPosition {
  id?: string;
  _id?: string;
  friendly_id?: string;
  name?: string;
  url?: string;
  published_date?: string;
  location?: { name?: string; country?: { name?: string; id?: string }; city?: string; is_remote?: boolean };
  type?: { name?: string };
  department?: string;
  description?: string;
}

export async function fetchBreezyJobs(slug: string, companyName?: string): Promise<JobListItem[]> {
  const base = `https://${slug}.breezy.hr`;
  try {
    const res = await fetch(`${base}/json`, { headers: { "User-Agent": UA, Accept: "application/json" }, signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return [];
    const ct = res.headers.get("content-type") ?? "";
    if (!ct.includes("json")) return [];
    const list = (await res.json()) as BreezyPosition[];
    if (!Array.isArray(list)) return [];
    const out: JobListItem[] = [];
    for (const p of list.slice(0, 200)) {
      const id = p.friendly_id ?? p.id ?? p._id;
      if (!id || !p.name) continue;
      const loc = [p.location?.city, p.location?.name, p.location?.country?.name].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(", ") || null;
      const remote = !!p.location?.is_remote || /remote/i.test(loc ?? "");
      let description = cleanHtmlText(p.description ?? "");
      if (!description) {
        try {
          const d = await fetch(`${base}/json/position/${id}`, { headers: { "User-Agent": UA, Accept: "application/json" }, signal: AbortSignal.timeout(10_000) });
          if (d.ok) description = cleanHtmlText(((await d.json()) as BreezyPosition).description ?? "");
        } catch { /* dettaglio non disponibile */ }
      }
      description = description.slice(0, 2000);
      if (!isEuRelevant(`${loc ?? ""} ${remote ? "remote" : ""}`, description)) continue;
      out.push({
        id: "",
        externalId: String(id),
        source: "breezy",
        sourceSlug: slug,
        title: p.name,
        company: companyName || prettySlug(slug),
        location: loc,
        description,
        url: p.url ?? `${base}/p/${id}`,
        contractType: p.type?.name ?? null,
        remote,
        salaryMin: null,
        salaryMax: null,
        category: p.department || "Altro",
        postedAt: p.published_date ? new Date(p.published_date) : new Date(),
        recruiterEmail: null,
        recruiterScrapedAt: null,
      } as unknown as JobListItem);
    }
    return out;
  } catch (err) {
    console.warn(`[breezy] ${slug} failed`, err instanceof Error ? err.message : err);
    return [];
  }
}

export async function fetchBreezyMulti(companies: Array<{ slug: string; name?: string }>, concurrency = 3): Promise<JobListItem[]> {
  return runPool(companies, concurrency, (c) => fetchBreezyJobs(c.slug, c.name));
}

function prettySlug(s: string): string {
  return s.split(/[-_]/).map((w) => (w ? w[0].toUpperCase() + w.slice(1) : "")).join(" ");
}
