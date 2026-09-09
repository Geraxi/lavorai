import type { JobListItem } from "@/lib/adzuna";
import { cleanHtmlText } from "./html-clean";
import { isEuRelevant, runPool } from "./feed-utils";

/**
 * Pinpoint — career site con feed JSON pubblico:
 *   https://<slug>.pinpointhq.com/postings.json
 * Annuncio: https://<slug>.pinpointhq.com/postings/<id>  (form pubblico
 * su /postings/<id>/applications/new). Tenant dalla discovery.
 */

const UA = "Mozilla/5.0 LavorAI/1.0 jobs-sync";

interface PinpointPosting {
  id?: number | string;
  title?: string;
  url?: string;
  created_at?: string;
  published_at?: string;
  description?: string;
  location?: { name?: string; city?: string; country?: string } | string;
  workplace_type?: string;
  employment_type?: string;
  department?: { name?: string } | string;
  compensation?: { minimum?: number; maximum?: number };
}

export async function fetchPinpointJobs(slug: string, companyName?: string): Promise<JobListItem[]> {
  const base = `https://${slug}.pinpointhq.com`;
  try {
    const res = await fetch(`${base}/postings.json`, { headers: { "User-Agent": UA, Accept: "application/json" }, signal: AbortSignal.timeout(15_000) });
    if (!res.ok || !(res.headers.get("content-type") ?? "").includes("json")) return [];
    const json = (await res.json()) as { data?: PinpointPosting[] } | PinpointPosting[];
    const list = Array.isArray(json) ? json : json.data ?? [];
    const out: JobListItem[] = [];
    for (const p of list.slice(0, 200)) {
      if (!p.id || !p.title) continue;
      const locObj = typeof p.location === "string" ? { name: p.location } : p.location ?? {};
      const loc = [locObj.city, locObj.name, locObj.country].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(", ") || null;
      const remote = /remote/i.test(`${p.workplace_type ?? ""} ${loc ?? ""}`);
      const description = cleanHtmlText(p.description ?? "").slice(0, 2000);
      if (!isEuRelevant(`${loc ?? ""} ${remote ? "remote" : ""}`, description)) continue;
      out.push({
        id: "",
        externalId: String(p.id),
        source: "pinpoint",
        sourceSlug: slug,
        title: p.title,
        company: companyName || prettySlug(slug),
        location: loc,
        description,
        url: p.url ?? `${base}/postings/${p.id}`,
        contractType: p.employment_type ?? null,
        remote,
        salaryMin: p.compensation?.minimum ?? null,
        salaryMax: p.compensation?.maximum ?? null,
        category: (typeof p.department === "string" ? p.department : p.department?.name) || "Altro",
        postedAt: new Date(p.published_at ?? p.created_at ?? Date.now()),
        recruiterEmail: null,
        recruiterScrapedAt: null,
      } as unknown as JobListItem);
    }
    return out;
  } catch (err) {
    console.warn(`[pinpoint] ${slug} failed`, err instanceof Error ? err.message : err);
    return [];
  }
}

export async function fetchPinpointMulti(companies: Array<{ slug: string; name?: string }>, concurrency = 3): Promise<JobListItem[]> {
  return runPool(companies, concurrency, (c) => fetchPinpointJobs(c.slug, c.name));
}

function prettySlug(s: string): string {
  return s.split(/[-_]/).map((w) => (w ? w[0].toUpperCase() + w.slice(1) : "")).join(" ");
}
