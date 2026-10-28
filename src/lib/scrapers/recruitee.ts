import type { JobListItem } from "@/lib/adzuna";
import { storedJobDescription } from "./posting-description";
import { isEuRelevant, runPool } from "./feed-utils";

/**
 * Recruitee (Tellent) — Careers Site API pubblica, nessuna auth:
 *   GET https://<tenant>.recruitee.com/api/offers/   (anche su dominio custom)
 * L'apply è un endpoint JSON pubblico (vedi portal-adapters/recruitee.ts):
 * niente browser, niente captcha documentato.
 */

interface RecruiteeOffer {
  id: number | string;
  slug: string;
  title: string;
  careers_url?: string;
  careers_apply_url?: string;
  city?: string | null;
  country?: string | null;
  location?: string | null;
  remote?: boolean | string | null;
  hybrid?: boolean | string | null;
  employment_type_code?: string | null;
  published_at?: string | null;
  created_at?: string | null;
  department?: string | null;
  company_name?: string | null;
  description?: string | null;
  requirements?: string | null;
  status?: string;
  options_cv?: string;
  open_questions?: unknown[];
}

export async function fetchRecruiteeJobs(tenant: string, companyName?: string): Promise<JobListItem[]> {
  // L'API careers risponde solo sul sottodominio recruitee.com (i domini
  // custom come careers.<azienda>.com danno 404 su /api).
  const t = tenant.replace(/^https?:\/\//, "").replace(/\.recruitee\.com.*$/, "").split("/")[0];
  if (!/^[a-z0-9-]+$/.test(t)) return [];
  const base = `https://${t}.recruitee.com`;
  try {
    const res = await fetch(`${base}/api/offers/`, {
      headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0 LavorAI/1.0 jobs-sync" },
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return [];
    if (!res.body) return [];
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = []; let size = 0;
    while (true) {
      const {done,value} = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > 4_000_000) { await reader.cancel(); throw new Error("board_response_too_large"); }
      chunks.push(value);
    }
    const data = JSON.parse(Buffer.concat(chunks).toString("utf8")) as { offers?: RecruiteeOffer[] };
    const offers = Array.isArray(data.offers) ? data.offers : [];
    return offers
      .filter((o) => o.status === "published")
      .map((o) => mapOffer(o, base, t, companyName))
      .filter((j): j is JobListItem => j !== null);
  } catch (err) {
    console.warn(`[recruitee] ${tenant} fetch failed`, err instanceof Error ? err.message : err);
    return [];
  }
}

export async function fetchRecruiteeMulti(companies: Array<{ slug: string; name?: string }>, concurrency = 4): Promise<JobListItem[]> {
  return runPool(companies, concurrency, (c) => fetchRecruiteeJobs(c.slug, c.name));
}

function mapOffer(o: RecruiteeOffer, base: string, tenant: string, companyName?: string): JobListItem | null {
  if (!o.slug || !/^[a-zA-Z0-9_-]+$/.test(o.slug) || !o.title || o.id == null) return null;
  const loc = o.location || [o.city, o.country].filter(Boolean).join(", ") || null;
  const remote = String(o.remote) === "true" || /remote|remoto/i.test(loc ?? "");
  const description = storedJobDescription(`${o.description ?? ""}\n${o.requirements ?? ""}`);
  if (!isEuRelevant(`${loc ?? ""} ${remote ? "remote" : ""}`, description)) return null;
  return {
    id: "",
    externalId: String(o.id),
    source: "recruitee",
    sourceSlug: tenant,
    title: o.title,
    company: o.company_name || companyName || tenant,
    location: loc,
    description,
    // URL sul sottodominio recruitee.com: l'adapter ricava tenant e slug da qui.
    url: `${base}/o/${o.slug}`,
    contractType: o.employment_type_code ?? null,
    remote,
    salaryMin: null,
    salaryMax: null,
    category: o.department || "Altro",
    postedAt: o.published_at || o.created_at ? new Date((o.published_at ?? o.created_at)!.replace(" UTC", "Z").replace(" ", "T")) : new Date(),
    recruiterEmail: null,
    recruiterScrapedAt: null,
  } as unknown as JobListItem;
}
