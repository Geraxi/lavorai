import type { JobListItem } from "@/lib/adzuna";

/**
 * Board listings (We Work Remotely, Arbeitnow, …) are link-outs: the cron can
 * only submit through a supported ATS form or a verified recruiter inbox. This
 * module follows a board's PUBLIC apply link server-side (bounded, no browser,
 * no login, robots-allowed paths only) and, when it lands on a supported ATS
 * posting, promotes that posting to its canonical ATS Job row built from the
 * ATS's own public feed. The canonical row then goes through the unchanged
 * auto-apply pipeline (preferences, matchMin, dedup, reservation ledger,
 * global cap, liveness, delivery proof). The board row itself is never sent.
 *
 * Not resolvable server-side, therefore never auto-applied:
 *  - adzuna:   /land/ad/<id> (the only apply route) is WAF-blocked for
 *              server requests (CloudFront 403). We do not work around it.
 *  - jobicy:   apply button sits behind a Jobicy registration gate.
 *  - himalayas: job pages 403 to server fetches and robots.txt disallows /apply.
 *  - remoteok: /l/<id> redirects back to the listing for non-browser clients.
 */

/**
 * Board sources that are resolvable to ATS postings. We Work Remotely is
 * technically resolvable but DISABLED due to ToS restrictions (WWR requires
 * applicants to apply through their site, not direct ATS links).
 */
export type ResolvableBoardSource = "arbeitnow"; // "weworkremotely" removed due to ToS
export const RESOLVABLE_BOARD_SOURCES: ResolvableBoardSource[] = ["arbeitnow"];

/** A board row is re-checked at most this often (cache on Job.recruiterScrapedAt). */
export const BOARD_RESOLUTION_TTL_MS = 7 * 86400_000;

export type AtsProvider = "greenhouse" | "lever" | "ashby" | "workable" | "recruitee" | "personio";
export interface AtsPosting {
  provider: AtsProvider;
  tenant: string;
  postingId: string;
}

const BOARD_HOSTS: Record<ResolvableBoardSource, RegExp> = {
  arbeitnow: /^www\.arbeitnow\.(?:com|co\.uk|fr|ch|de|at|nl|es|it)$/i,
};

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const SLUG = "[a-z0-9][a-z0-9._-]{0,80}";

/** Strictly parses a public ATS posting URL. Anything else (career pages,
 * board listings, search pages, custom domains) is not a supported destination. */
export function parseAtsPosting(value: string): AtsPosting | null {
  let url: URL;
  try { url = new URL(value); } catch { return null; }
  if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
  const host = url.hostname.toLowerCase();
  const path = url.pathname;
  let m: RegExpMatchArray | null;
  if (/^(?:boards|job-boards)\.greenhouse\.io$/.test(host)
    && (m = path.match(new RegExp(`^/(${SLUG})/jobs/(\\d{4,20})/?$`, "i")))) {
    return { provider: "greenhouse", tenant: m[1].toLowerCase(), postingId: m[2] };
  }
  if (host === "jobs.lever.co" && (m = path.match(new RegExp(`^/(${SLUG})/(${UUID})(?:/apply)?/?$`, "i")))) {
    return { provider: "lever", tenant: m[1].toLowerCase(), postingId: m[2].toLowerCase() };
  }
  if (host === "jobs.ashbyhq.com" && (m = path.match(new RegExp(`^/(${SLUG})/(${UUID})(?:/application)?/?$`, "i")))) {
    return { provider: "ashby", tenant: decodeURIComponent(m[1]), postingId: m[2].toLowerCase() };
  }
  if (host === "apply.workable.com" && (m = path.match(new RegExp(`^/(${SLUG})/j/([0-9A-F]{6,16})(?:/apply)?/?$`, "i")))) {
    return { provider: "workable", tenant: m[1].toLowerCase(), postingId: m[2].toUpperCase() };
  }
  if ((m = host.match(/^([a-z0-9][a-z0-9-]{0,62})\.recruitee\.com$/)) && !["www", "app", "api", "careers", "jobs"].includes(m[1])) {
    const offer = path.match(/^\/o\/([a-z0-9][a-z0-9-]{0,120})(?:\/c\/new)?\/?$/i);
    if (offer) return { provider: "recruitee", tenant: m[1], postingId: offer[1].toLowerCase() };
  }
  if ((m = host.match(/^([a-z0-9][a-z0-9-]{0,62})\.jobs\.personio\.(?:de|com)$/))) {
    const job = path.match(/^\/job\/(\d{3,12})(?:\/apply)?\/?$/);
    if (job) return { provider: "personio", tenant: m[1], postingId: job[1] };
  }
  return null;
}

function isBoardUrl(source: ResolvableBoardSource, value: string): URL | null {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && BOARD_HOSTS[source].test(url.hostname) && !url.username && !url.password ? url : null;
  } catch { return null; }
}

function decodeAttr(value: string): string {
  return value.replace(/&amp;/gi, "&").replace(/&#x2F;/gi, "/").replace(/&#47;/g, "/").trim();
}

/** We Work Remotely renders the employer's apply link on `#job-cta-alt`
 * anchors. Every such anchor must agree on one supported ATS posting. */
export function extractWwrApplyUrl(html: string): string | null {
  const hrefs = new Set<string>();
  for (const tag of html.matchAll(/<a\b[^>]*\bid\s*=\s*["']job-cta-alt["'][^>]*>/gi)) {
    const href = tag[0].match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1];
    if (href) hrefs.add(decodeAttr(href));
  }
  if (hrefs.size !== 1) return null;
  const [href] = [...hrefs];
  return parseAtsPosting(href) ? href : null;
}

export type BoardResolution =
  | { kind: "ats"; posting: AtsPosting; applyUrl: string }
  | { kind: "unsupported"; reason: string };

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;
const UA = "Mozilla/5.0 (compatible; LavorAI/1.0; +https://lavorai.it)";

async function readCapped(res: Response, max = 600_000): Promise<string> {
  const text = await res.text();
  return text.slice(0, max);
}

/** Follow a board's public apply route to the employer's destination. */
export async function resolveBoardApplyDestination(
  job: { source: string; url: string },
  fetchImpl: FetchLike = fetch,
  timeoutMs = 8_000,
): Promise<BoardResolution> {
  if (!(RESOLVABLE_BOARD_SOURCES as string[]).includes(job.source)) return { kind: "unsupported", reason: "source_not_resolvable" };
  const source = job.source as ResolvableBoardSource;
  const board = isBoardUrl(source, job.url);
  if (!board) return { kind: "unsupported", reason: "board_url_invalid" };
  try {
    // weworkremotely resolution removed: ToS require application through WWR site
    // Arbeitnow: `<listing>/apply` is a plain public 302 to the employer.
    let current = `${board.origin}${board.pathname.replace(/\/+$/, "")}/apply`;
    for (let hop = 0; hop < 4; hop++) {
      const res = await fetchImpl(current, { redirect: "manual", headers: { "User-Agent": UA, Accept: "text/html" }, signal: AbortSignal.timeout(timeoutMs) });
      await res.body?.cancel().catch(() => undefined);
      if (res.status < 300 || res.status >= 400) return { kind: "unsupported", reason: `apply_http_${res.status}` };
      const location = res.headers.get("location");
      if (!location) return { kind: "unsupported", reason: "apply_no_location" };
      const next = new URL(location, current).toString();
      const posting = parseAtsPosting(next);
      if (posting) return { kind: "ats", posting, applyUrl: next };
      // Only keep following redirects that stay on the board itself.
      if (!isBoardUrl(source, next)) return { kind: "unsupported", reason: "destination_not_supported_ats" };
      current = next;
    }
    return { kind: "unsupported", reason: "too_many_redirects" };
  } catch {
    return { kind: "unsupported", reason: "fetch_failed" };
  }
}

/** The canonical record for a resolved posting, from the ATS's own public
 * feed (same mapper as the daily sync). Null when the feed does not list it
 * (closed, or outside the sync's own relevance filters). */
export async function fetchCanonicalAtsJob(posting: AtsPosting, companyName: string | null): Promise<JobListItem | null> {
  const name = companyName?.trim() || undefined;
  let items: JobListItem[] = [];
  if (posting.provider === "greenhouse") items = await (await import("@/lib/scrapers/greenhouse")).fetchGreenhouseJobs(posting.tenant, name);
  else if (posting.provider === "lever") items = await (await import("@/lib/scrapers/lever")).fetchLeverJobs(posting.tenant, name);
  else if (posting.provider === "ashby") items = await (await import("@/lib/scrapers/ashby")).fetchAshbyJobs(posting.tenant, name);
  else if (posting.provider === "workable") items = await (await import("@/lib/scrapers/workable")).fetchWorkableJobs(posting.tenant, name);
  else if (posting.provider === "recruitee") items = await (await import("@/lib/scrapers/recruitee")).fetchRecruiteeJobs(posting.tenant, name);
  else if (posting.provider === "personio") items = await (await import("@/lib/scrapers/personio")).fetchPersonioJobs(posting.tenant, name);
  return canonicalItemFor(posting, items);
}

/** The feed row whose canonical URL identifies exactly the linked posting
 * (same provider, tenant and posting id). Feed externalIds differ per ATS
 * (Recruitee uses a numeric id, its URL a slug), so the URL is the identity. */
export function canonicalItemFor(posting: AtsPosting, items: JobListItem[]): JobListItem | null {
  const same = (p: AtsPosting | null) => !!p && p.provider === posting.provider
    && p.tenant.toLowerCase() === posting.tenant.toLowerCase() && p.postingId.toLowerCase() === posting.postingId.toLowerCase();
  const hits = items.filter((item) => item.source === posting.provider && same(parseAtsPosting(item.url)));
  return hits.length === 1 ? hits[0] : null;
}

/** Rate limits, blocks and network errors are retried on a later run;
 * only a definitive answer (ATS found, 404/410, no/unsupported link) is cached. */
export function isTransientResolution(r: BoardResolution): boolean {
  return r.kind === "unsupported" && /^(?:fetch_failed|(?:board|apply)_http_(?:403|408|425|429|5\d\d))$/.test(r.reason);
}

type ResolverDb = {
  job: {
    findMany: (args: unknown) => Promise<Array<{ id: string; source: string; url: string; company: string | null }>>;
    findFirst: (args: unknown) => Promise<{ id: string } | null>;
    create: (args: unknown) => Promise<{ id: string }>;
    updateMany: (args: unknown) => Promise<{ count: number }>;
  };
};

export interface BoardResolutionStats { attempted: number; promoted: number; existing: number; unsupported: number }

/**
 * Bounded resolution pass for one user's roles. Board rows are re-checked at
 * most once per BOARD_RESOLUTION_TTL_MS (Job.recruiterScrapedAt = when this
 * listing's apply destination was last looked up). Creates the canonical ATS
 * row only when none exists; never updates/reopens rows the sync owns.
 */
export async function resolveBoardListingsForRoles(
  roles: string[],
  opts: { limit?: number; now?: Date; deadline?: number; db?: ResolverDb; resolve?: typeof resolveBoardApplyDestination; canonical?: typeof fetchCanonicalAtsJob } = {},
): Promise<BoardResolutionStats> {
  const stats: BoardResolutionStats = { attempted: 0, promoted: 0, existing: 0, unsupported: 0 };
  if (process.env.BOARD_APPLY_RESOLUTION === "false") return stats;
  const remaining = () => (opts.deadline ?? Number.POSITIVE_INFINITY) - Date.now();
  if (remaining() < 3_000) return stats;
  const roleConds = roles.slice(0, 5).map((r) => r.split(/\s+/).filter((tok) => tok.length >= 3))
    .filter((toks) => toks.length > 0)
    .map((toks) => ({ AND: toks.map((tok) => ({ title: { contains: tok, mode: "insensitive" as const } })) }));
  if (!roleConds.length) return stats;
  const now = opts.now ?? new Date();
  const db = opts.db ?? ((await import("@/lib/db")).prisma as unknown as ResolverDb);
  const resolve = opts.resolve ?? resolveBoardApplyDestination;
  const canonical = opts.canonical ?? fetchCanonicalAtsJob;
  const rows = await db.job.findMany({
    where: {
      closedAt: null,
      source: { in: RESOLVABLE_BOARD_SOURCES },
      OR: [{ recruiterScrapedAt: null }, { recruiterScrapedAt: { lt: new Date(+now - BOARD_RESOLUTION_TTL_MS) } }],
      AND: [{ OR: roleConds }],
    },
    select: { id: true, source: true, url: true, company: true },
    orderBy: { postedAt: "desc" },
    take: Math.max(0, Math.min(opts.limit ?? 6, 20)),
  });
  // Sequential: a handful of polite requests per call, never a burst at one board.
  for (const row of rows) {
    if (remaining() < 3_000) break;
    stats.attempted++;
    let looked = true; // false only when the run budget ran out before the lookup finished
    try {
      const result = await resolve(row, undefined, Math.max(1_000, Math.min(8_000, remaining())));
      if (isTransientResolution(result)) { looked = false; stats.unsupported++; continue; }
      if (result.kind !== "ats") { stats.unsupported++; continue; }
      if (remaining() < 1_000) { looked = false; stats.unsupported++; continue; }
      const item = await canonical(result.posting, row.company);
      if (!item) { stats.unsupported++; continue; }
      const existing = await db.job.findFirst({ where: { OR: [
        { externalId: item.externalId, source: item.source },
        { url: item.url },
      ] }, select: { id: true } });
      if (existing) { stats.existing++; continue; }
      const created = await db.job.create({ data: {
        externalId: item.externalId, source: item.source, sourceSlug: item.sourceSlug ?? null,
        title: item.title, company: item.company, location: item.location, description: item.description,
        url: item.url, contractType: item.contractType, remote: item.remote, salaryMin: item.salaryMin,
        salaryMax: item.salaryMax, category: item.category, postedAt: item.postedAt,
      }, select: { id: true } }).catch((err: { code?: string }) => {
        if (err?.code === "P2002") return null; // a concurrent run created it first
        throw err;
      });
      if (created) stats.promoted++; else stats.existing++;
    } catch (err) {
      stats.unsupported++;
      console.warn("[board-apply-resolver] resolution failed", row.id, err instanceof Error ? err.message : err);
    } finally {
      if (looked) await db.job.updateMany({ where: { id: row.id }, data: { recruiterScrapedAt: now } }).catch(() => undefined);
    }
  }
  return stats;
}
