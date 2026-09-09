import type { JobListItem } from "@/lib/adzuna";
import { cleanHtmlText } from "./html-clean";
import { isEuRelevant, runPool } from "./feed-utils";

/**
 * BambooHR — endpoint JSON del widget careers (non documentato ma stabile):
 *   GET https://<tenant>.bamboohr.com/careers/list  → { result: [...] }
 *   GET https://<tenant>.bamboohr.com/careers/<id>/detail → descrizione
 * Form pubblico: https://<tenant>.bamboohr.com/careers/<id>
 */

interface BambooJob {
  id: number | string;
  jobOpeningName?: string;
  departmentLabel?: string;
  employmentStatusLabel?: string;
  location?: { city?: string; state?: string; country?: string } | null;
  isRemote?: boolean | null;
  datePosted?: string | null;
}

export async function fetchBambooJobs(tenant: string, companyName?: string, withDetails = true): Promise<JobListItem[]> {
  const base = `https://${tenant}.bamboohr.com`;
  try {
    const res = await fetch(`${base}/careers/list`, {
      headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0 LavorAI/1.0 jobs-sync" },
      signal: AbortSignal.timeout(15_000),
      redirect: "manual",
    });
    if (res.status !== 200) return [];
    const data = (await res.json()) as { result?: BambooJob[] };
    const rows = Array.isArray(data.result) ? data.result : [];
    const out: JobListItem[] = [];
    for (const r of rows.slice(0, 80)) {
      if (!r.id || !r.jobOpeningName) continue;
      const loc = [r.location?.city, r.location?.state, r.location?.country].filter(Boolean).join(", ") || null;
      const remote = !!r.isRemote || /remote|remoto/i.test(loc ?? "");
      let description = "";
      if (withDetails) {
        try {
          const d = await fetch(`${base}/careers/${r.id}/detail`, { headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0 LavorAI/1.0 jobs-sync" }, signal: AbortSignal.timeout(10_000) });
          if (d.ok) {
            const j = (await d.json()) as { result?: { jobOpening?: { description?: string } } };
            description = cleanHtmlText(j.result?.jobOpening?.description ?? "").slice(0, 2000);
          }
        } catch { /* descrizione opzionale */ }
      }
      if (!isEuRelevant(`${loc ?? ""} ${remote ? "remote" : ""}`, description)) continue;
      out.push({
        id: "",
        externalId: String(r.id),
        source: "bamboohr",
        sourceSlug: tenant,
        title: r.jobOpeningName,
        company: companyName || prettySlug(tenant),
        location: loc,
        description,
        url: `${base}/careers/${r.id}`,
        contractType: r.employmentStatusLabel ?? null,
        remote,
        salaryMin: null,
        salaryMax: null,
        category: r.departmentLabel || "Altro",
        postedAt: r.datePosted ? new Date(r.datePosted) : new Date(),
        recruiterEmail: null,
        recruiterScrapedAt: null,
      } as unknown as JobListItem);
    }
    return out;
  } catch (err) {
    console.warn(`[bamboohr] ${tenant} fetch failed`, err instanceof Error ? err.message : err);
    return [];
  }
}

export async function fetchBambooMulti(companies: Array<{ slug: string; name?: string }>, concurrency = 3): Promise<JobListItem[]> {
  return runPool(companies, concurrency, (c) => fetchBambooJobs(c.slug, c.name));
}

function prettySlug(s: string): string {
  return s.split(/[-_]/).map((w) => (w ? w[0].toUpperCase() + w.slice(1) : "")).join(" ");
}
