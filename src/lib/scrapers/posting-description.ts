import { cleanHtmlText } from "./html-clean";

/**
 * Full description of one posting from the board's public (no-auth) detail
 * endpoint. List feeds of some boards carry no description; Greenhouse,
 * Ashby and Lever already return HTML/plain on the public board APIs.
 * Returns null on any failure: callers keep the row as it was.
 */
export const DESCRIPTION_MAX = 20_000;
/** Legacy ingest cap. Rows at exactly this length were cut off mid-intro. */
export const DESCRIPTION_TRUNCATED_LEN = 2000;
/** Safe clip for AI prompts. Scoring uses the stored full text. */
export const DESCRIPTION_AI_MAX = 8_000;
const UA = "Mozilla/5.0 LavorAI/1.0 jobs-sync";

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export interface PostingRef {
  source: string;
  url: string;
  externalId: string;
  sourceSlug?: string | null;
}

export const DESCRIPTION_SOURCES = new Set([
  "workable", "smartrecruiters", "breezy", "greenhouse", "ashby", "lever",
]);

/** Strip HTML and cap for storage. Scoring reads this full text. */
export function storedJobDescription(raw: string | null | undefined): string {
  return cleanHtmlText(raw).slice(0, DESCRIPTION_MAX);
}

export function clipJobDescriptionForAi(raw: string | null | undefined): string {
  return (raw ?? "").slice(0, DESCRIPTION_AI_MAX);
}

export function isTruncatedJobDescription(text: string | null | undefined): boolean {
  return (text ?? "").length === DESCRIPTION_TRUNCATED_LEN;
}

export function needsFullDescription(text: string | null | undefined): boolean {
  return !text?.trim() || isTruncatedJobDescription(text);
}

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
  if (job.source === "greenhouse") {
    const m = job.url.match(/greenhouse\.io\/([^/?#]+)\/jobs\/(\d+)/);
    const board = slug || m?.[1]; const id = m?.[2] || job.externalId;
    return board && id ? `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(board)}/jobs/${encodeURIComponent(id)}?content=true` : null;
  }
  if (job.source === "ashby") {
    const board = slug || job.url.match(/ashbyhq\.com\/([^/?#]+)/)?.[1];
    return board ? `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(board)}?includeCompensation=true` : null;
  }
  if (job.source === "lever") {
    const m = job.url.match(/lever\.co\/([^/?#]+)\/([^/?#]+)/);
    const board = slug || m?.[1]; const id = m?.[2] || job.externalId;
    return board && id ? `https://api.lever.co/v0/postings/${encodeURIComponent(board)}/${encodeURIComponent(id)}?mode=json` : null;
  }
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

export function descriptionFromDetail(source: string, body: string, externalId?: string): string | null {
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
    } else if (source === "greenhouse") {
      const d = JSON.parse(body) as { content?: string };
      html = typeof d.content === "string" ? d.content : null;
    } else if (source === "ashby") {
      const data = JSON.parse(body) as { jobs?: Array<{ id?: string; descriptionHtml?: string }>; descriptionHtml?: string };
      if (typeof data.descriptionHtml === "string") html = data.descriptionHtml;
      else {
        const jobs = Array.isArray(data.jobs) ? data.jobs : [];
        const hit = externalId ? jobs.find((j) => String(j.id) === String(externalId)) : jobs[0];
        html = typeof hit?.descriptionHtml === "string" ? hit.descriptionHtml : null;
      }
    } else if (source === "lever") {
      const d = JSON.parse(body) as { descriptionPlain?: string; description?: string; lists?: Array<{ text?: string; content?: string }> };
      const lists = Array.isArray(d.lists) ? d.lists.map((l) => [l.text, l.content].filter(Boolean).join("\n")).join("\n") : "";
      html = [d.descriptionPlain ?? d.description ?? "", lists].filter((v) => v.trim()).join("\n");
    }
  } catch { return null; }
  const text = storedJobDescription(html).trim();
  return text || null;
}

export async function fetchPostingDescription(
  job: PostingRef,
  opts: { fetchImpl?: FetchLike; timeoutMs?: number; bodyCache?: Map<string, Promise<string | null>> } = {},
): Promise<string | null> {
  const url = postingDescriptionUrl(job);
  if (!url) return null;
  const fetchImpl = opts.fetchImpl ?? fetch;
  try {
    const load = async () => {
      const res = await fetchImpl(url, {
        headers: { "User-Agent": UA, Accept: job.source === "breezy" ? "text/html" : "application/json" },
        redirect: job.source === "breezy" ? "manual" : "follow",
        signal: AbortSignal.timeout(opts.timeoutMs ?? 8_000),
      });
      if (!res.ok) return null;
      return res.text();
    };
    const body = opts.bodyCache
      ? await (opts.bodyCache.has(url) ? opts.bodyCache.get(url)! : opts.bodyCache.set(url, load()).get(url)!)
      : await load();
    if (!body) return null;
    return descriptionFromDetail(job.source, body, job.externalId);
  } catch {
    return null;
  }
}

/** Fill empty or legacy-truncated descriptions in place, bounded: at most
 * `limit` fetches, `concurrency` at a time, nothing new after `deadline`. */
export async function fillMissingDescriptions<T extends PostingRef & { description: string }>(
  jobs: T[],
  opts: { limit: number; concurrency?: number; deadline?: number; fetchImpl?: FetchLike; timeoutMs?: number },
): Promise<T[]> {
  const todo = jobs.filter((j) => needsFullDescription(j.description) && DESCRIPTION_SOURCES.has(j.source)).slice(0, Math.max(0, opts.limit));
  const filled: T[] = [];
  const queue = [...todo];
  const bodyCache = new Map<string, Promise<string | null>>();
  async function worker() {
    for (let j = queue.shift(); j; j = queue.shift()) {
      if (opts.deadline && Date.now() >= opts.deadline) return;
      const text = await fetchPostingDescription(j, { ...opts, bodyCache });
      if (text) { j.description = text; filled.push(j); }
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, opts.concurrency ?? 4) }, () => worker()));
  return filled;
}
