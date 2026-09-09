import type { JobListItem } from "@/lib/adzuna";
import { cleanHtmlText } from "./html-clean";
import { isEuRelevant, runPool } from "./feed-utils";

/**
 * Teamtailor — ogni career site espone un JSON Feed pubblico:
 *   https://<tenant>.teamtailor.com/jobs.json  (o dominio custom /jobs.json)
 * Ogni item ha `_jobposting` (schema.org JobPosting) con location e datePosted.
 * Form di candidatura pubblico: <url>/applications/new
 */

interface TtItem {
  id: string;
  title: string;
  url: string;
  date_published?: string;
  content_html?: string;
  _jobposting?: {
    title?: string;
    datePosted?: string;
    employmentType?: string | string[];
    hiringOrganization?: { name?: string };
    jobLocation?: Array<{ address?: { addressLocality?: string; addressCountry?: string; addressRegion?: string } }> | { address?: { addressLocality?: string; addressCountry?: string } };
    jobLocationType?: string;
    description?: string;
  };
}

export async function fetchTeamtailorJobs(tenant: string, companyName?: string): Promise<JobListItem[]> {
  const base = tenant.includes(".") ? `https://${tenant}` : `https://${tenant}.teamtailor.com`;
  try {
    const res = await fetch(`${base}/jobs.json`, {
      headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0 LavorAI/1.0 jobs-sync" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { items?: TtItem[]; title?: string };
    const items = Array.isArray(data.items) ? data.items : [];
    const host = new URL(base).host;
    const company = companyName || data.title?.replace(/\s*[-–|].*$/, "").trim() || host.split(".")[0];
    return items.map((it) => mapItem(it, host, company)).filter((j): j is JobListItem => j !== null);
  } catch (err) {
    console.warn(`[teamtailor] ${tenant} fetch failed`, err instanceof Error ? err.message : err);
    return [];
  }
}

export async function fetchTeamtailorMulti(companies: Array<{ slug: string; name?: string }>, concurrency = 4): Promise<JobListItem[]> {
  return runPool(companies, concurrency, (c) => fetchTeamtailorJobs(c.slug, c.name));
}

function mapItem(it: TtItem, host: string, company: string): JobListItem | null {
  if (!it.id || !it.title || !it.url) return null;
  const jp = it._jobposting ?? {};
  const locs = Array.isArray(jp.jobLocation) ? jp.jobLocation : jp.jobLocation ? [jp.jobLocation] : [];
  const loc = locs.map((l) => [l.address?.addressLocality, l.address?.addressCountry].filter(Boolean).join(", ")).filter(Boolean).join(" · ") || null;
  const description = cleanHtmlText(jp.description || it.content_html || "").slice(0, 2000);
  const remote = jp.jobLocationType === "TELECOMMUTE" || /remote|remoto/i.test(`${loc ?? ""} ${it.title}`);
  if (!isEuRelevant(`${loc ?? ""} ${remote ? "remote" : ""}`, description)) return null;
  const et = jp.employmentType;
  return {
    id: "",
    externalId: String(it.id),
    source: "teamtailor",
    sourceSlug: host,
    title: it.title,
    company: jp.hiringOrganization?.name || company,
    location: loc,
    description,
    url: it.url,
    contractType: Array.isArray(et) ? et[0] ?? null : et ?? null,
    remote,
    salaryMin: null,
    salaryMax: null,
    category: "Altro",
    postedAt: jp.datePosted || it.date_published ? new Date((jp.datePosted ?? it.date_published)!) : new Date(),
    recruiterEmail: null,
    recruiterScrapedAt: null,
  } as unknown as JobListItem;
}
