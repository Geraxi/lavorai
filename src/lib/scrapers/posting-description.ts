import { cleanHtmlText } from "./html-clean";

/**
 * Full description of one posting from the board's public (no-auth) detail
 * endpoint. The list feeds of these boards carry no description:
 *  - Workable: GET apply.workable.com/api/v2/accounts/<slug>/jobs/<shortcode>
 *    → { description, requirements, benefits } (HTML)
 *  - SmartRecruiters: GET api.smartrecruiters.com/v1/companies/<id>/postings/<postingId>
 *    → jobAd.sections.{jobDescription,qualifications,additionalInformation}.text
 *  - Breezy: the public posting page <slug>.breezy.hr/p/<friendly_id> embeds a
 *    schema.org JobPosting (ld+json) with the description. (/json/position/<id>
 *    redirects to the portal home, so it never returned anything.)
 * Returns null on any failure: callers keep the row as it was.
 */
export const DESCRIPTION_MAX = 2000;
const UA = "Mozilla/5.0 LavorAI/1.0 jobs-sync";

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export interface PostingRef {
  source: string;
  url: string;
  externalId: string;
  sourceSlug?: string | null;
}

export const DESCRIPTION_SOURCES = new Set(["workable", "smartrecruiters", "breezy"]);

export function postingDescriptionUrl(job: PostingRef): string | null {
  const slug = job.sourceSlug?.trim();
  if (job.source === "workable") {
    const m = job.url.match(/apply\.workable\.com\/([^/?#]+)\/j\/([^/?#]+)/);
    const account = slug || m?.[1]; const code = m?.[2] || job.externalId;
    return account && code ? `https://apply.workable.com/api/v2/accounts/${encodeURIComponent(account)}/jobs/${encodeURIComponent(code)}` : null;
  }
  if (job.source === "smartrecruiters") {
    const m = job.url.match(/smartrecruiters\.com\/([^/?#]+)\/(\d+)/);
    const company = slug || m?.[1]; const id = m?.[2] || job.externalId;
    return company && id ? `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(company)}/postings/${encodeURIComponent(id)}` : null;
  }
  if (job.source === "breezy") return /^https:\/\/[a-z0-9-]+\.breezy\.hr\/p\//i.test(job.url) ? job.url.split(/[?#]/)[0] : null;
  return null;
}

/** schema.org JobPosting.description from a posting page. */
export function jobPostingLdDescription(html: string): string | null {
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const data: unknown = JSON.parse(m[1]);
      for (const node of Array.isArray(data) ? data : [data]) {
        const n = node as { "@type"?: unknown; description?: unknown };
        if (n && n["@type"] === "JobPosting" && typeof n.description === "string") return n.description;
      }
    } catch { /* malformed block */ }
  }
  return null;
}

export function descriptionFromDetail(source: string, body: string): string | null {
  let html: string | null = null;
  try {
    if (source === "workable") {
      const d = JSON.parse(body) as { description?: string; requirements?: string; benefits?: string };
      html = [d.description, d.requirements, d.benefits].filter((v) => typeof v === "string" && v.trim()).join("\n");
    } else if (source === "smartrecruiters") {
      const s = (JSON.parse(body) as { jobAd?: { sections?: Record<string, { text?: string }> } }).jobAd?.sections ?? {};
      html = [s.jobDescription?.text, s.qualifications?.text, s.additionalInformation?.text].filter((v) => typeof v === "string" && v.trim()).join("\n");
    } else if (source === "breezy") {
      html = jobPostingLdDescription(body);
    }
  } catch { return null; }
  const text = cleanHtmlText(html ?? "").slice(0, DESCRIPTION_MAX).trim();
  return text || null;
}

export async function fetchPostingDescription(
  job: PostingRef,
  opts: { fetchImpl?: FetchLike; timeoutMs?: number } = {},
): Promise<string | null> {
  const url = postingDescriptionUrl(job);
  if (!url) return null;
  const fetchImpl = opts.fetchImpl ?? fetch;
  try {
    const res = await fetchImpl(url, {
      headers: { "User-Agent": UA, Accept: job.source === "breezy" ? "text/html" : "application/json" },
      redirect: job.source === "breezy" ? "manual" : "follow",
      signal: AbortSignal.timeout(opts.timeoutMs ?? 8_000),
    });
    if (!res.ok) return null;
    return descriptionFromDetail(job.source, await res.text());
  } catch {
    return null;
  }
}

/** Fill empty descriptions in place, bounded: at most `limit` fetches,
 * `concurrency` at a time, and nothing new started after `deadline`. */
export async function fillMissingDescriptions<T extends PostingRef & { description: string }>(
  jobs: T[],
  opts: { limit: number; concurrency?: number; deadline?: number; fetchImpl?: FetchLike; timeoutMs?: number },
): Promise<T[]> {
  const todo = jobs.filter((j) => !j.description?.trim() && DESCRIPTION_SOURCES.has(j.source)).slice(0, Math.max(0, opts.limit));
  const filled: T[] = [];
  const queue = [...todo];
  async function worker() {
    for (let j = queue.shift(); j; j = queue.shift()) {
      if (opts.deadline && Date.now() >= opts.deadline) return;
      const text = await fetchPostingDescription(j, opts);
      if (text) { j.description = text; filled.push(j); }
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, opts.concurrency ?? 4) }, () => worker()));
  return filled;
}
