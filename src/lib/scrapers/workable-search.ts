import type { JobListItem } from "@/lib/adzuna";
import { titleMatchesAnyRole } from "@/lib/role-match";
import { homeCountries } from "@/lib/auto-apply-preferences";
import { cleanHtmlText } from "./html-clean";
import { fetchWorkableAccountRaw, mapWorkableAccountJobs, type WorkableJob } from "./workable";

/**
 * Demand-driven Workable discovery.
 *
 * The curated Workable list only covers companies someone added by hand. The
 * public Workable job search (jobs.workable.com/api/v1/jobs — allowed by its
 * robots.txt, no login) finds postings for the roles and places real
 * auto-apply users asked for. A search hit is never a pool row: its company is
 * resolved to its public apply.workable.com account, and the account's own
 * feed (the same mapper the curated sync uses) is accepted only when it
 * contains the same posting (same title and place). The canonical
 * apply.workable.com/<account>/j/<shortcode> rows then go through the normal
 * pipeline and every send gate. Unresolvable companies are skipped.
 */

const SEARCH_URL = "https://jobs.workable.com/api/v1/jobs";
const UA = "Mozilla/5.0 LavorAI/1.0 jobs-sync";

export interface WorkableSearchQuery { what: string; where: string }

export interface WorkableSearchHit {
  id: string;
  title: string;
  description?: string;
  url?: string;
  workplace?: string;
  location?: { city?: string | null; subregion?: string | null; countryName?: string | null } | null;
  company?: { id?: string; title?: string; website?: string | null } | null;
}

export interface WorkableSearchStats {
  queries: number;
  hits: number;
  companies: number;
  resolved: number;
  unresolved: number;
  items: number;
}

const COUNTRY_SEARCH_NAME: Record<string, string> = {
  US: "United States", IT: "Italy", GB: "United Kingdom", DE: "Germany", FR: "France", ES: "Spain",
  NL: "Netherlands", IE: "Ireland", PT: "Portugal", CH: "Switzerland", AT: "Austria", BE: "Belgium",
  CA: "Canada",
};

function norm(value: string | null | undefined): string {
  return (value ?? "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** Account slugs worth probing for a company: name variants and the website host. */
export function workableSlugCandidates(name: string, website?: string | null): string[] {
  const words = norm(name).split(" ").filter(Boolean);
  const legal = new Set(["inc", "llc", "ltd", "spa", "s", "p", "a", "srl", "s r l", "gmbh", "bv", "limited", "corp", "corporation", "co", "the", "plc", "sa", "ag"]);
  const core = words.filter((w) => !legal.has(w));
  const out = [core.join("-"), core.join(""), words.join("-"), words.join("")];
  if (website) {
    try {
      const host = new URL(/^https?:\/\//i.test(website) ? website : `https://${website}`).hostname.replace(/^www\./, "");
      out.push(host.split(".")[0]);
    } catch { /* ignore malformed website */ }
  }
  if (core.length > 1) out.push(core[0]);
  return Array.from(new Set(out.map((s) => s.replace(/[^a-z0-9-]/g, "")).filter((s) => s.length >= 2))).slice(0, 5);
}

/** Same posting: identical normalised title, and the same country (or city). */
export function sameWorkablePosting(hit: WorkableSearchHit, raw: WorkableJob): boolean {
  if (!hit.title || !raw.title || norm(hit.title) !== norm(raw.title)) return false;
  const hitCountry = norm(hit.location?.countryName);
  const hitCity = norm(hit.location?.city);
  const rawPlaces = [raw.location, ...(raw.locations ?? [])].filter(Boolean) as Array<{ city?: string; country?: string }>;
  if (!hitCountry && !hitCity) return true;
  return rawPlaces.some((p) => (hitCountry && norm(p.country) === hitCountry) || (hitCity && norm(p.city) === hitCity));
}

async function searchWorkable(q: WorkableSearchQuery, timeoutMs: number, fetchImpl: typeof fetch): Promise<WorkableSearchHit[]> {
  const url = new URL(SEARCH_URL);
  url.searchParams.set("query", q.what);
  if (q.where) url.searchParams.set("location", q.where);
  try {
    const res = await fetchImpl(url.toString(), { headers: { "User-Agent": UA, Accept: "application/json" }, signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) { console.warn(`[workable-search] ${q.what} @ ${q.where} → ${res.status}`); return []; }
    const data = (await res.json()) as { jobs?: WorkableSearchHit[] };
    return Array.isArray(data.jobs) ? data.jobs.filter((j) => j && typeof j.title === "string") : [];
  } catch (err) {
    console.warn(`[workable-search] ${q.what} @ ${q.where} failed`, err instanceof Error ? err.message : err);
    return [];
  }
}

export interface WorkableSearchOptions {
  maxQueries?: number;
  maxCompanies?: number;
  timeoutMs?: number;
  concurrency?: number;
  /** Epoch ms after which no new request starts. */
  deadline?: number;
  fetchImpl?: typeof fetch;
  accountFeed?: (slug: string) => Promise<WorkableJob[] | null>;
}

export async function fetchWorkableSearchJobs(
  queries: WorkableSearchQuery[], opts: WorkableSearchOptions = {},
): Promise<{ items: JobListItem[]; stats: WorkableSearchStats }> {
  const maxQueries = opts.maxQueries ?? 24;
  const maxCompanies = opts.maxCompanies ?? 25;
  const timeoutMs = opts.timeoutMs ?? 8_000;
  const concurrency = Math.max(1, opts.concurrency ?? 3);
  const deadline = opts.deadline ?? Date.now() + 90_000;
  const fetchImpl = opts.fetchImpl ?? fetch;
  const accountFeed = opts.accountFeed ?? ((slug: string) => fetchWorkableAccountRaw(slug, timeoutMs));
  const stats: WorkableSearchStats = { queries: 0, hits: 0, companies: 0, resolved: 0, unresolved: 0, items: 0 };

  // 1. Search: keep only hits whose title carries every token of the role.
  const byCompany = new Map<string, { name: string; website: string | null; hits: WorkableSearchHit[] }>();
  const queue = queries.slice(0, maxQueries);
  async function searchWorker() {
    while (queue.length && Date.now() < deadline) {
      const q = queue.shift()!;
      stats.queries++;
      for (const hit of await searchWorkable(q, timeoutMs, fetchImpl)) {
        if (!titleMatchesAnyRole(hit.title, [q.what])) continue;
        const name = hit.company?.title?.trim();
        if (!name) continue;
        const key = hit.company?.id || norm(name);
        const entry = byCompany.get(key) ?? { name, website: hit.company?.website ?? null, hits: [] };
        if (!entry.hits.some((h) => h.id === hit.id)) { entry.hits.push(hit); stats.hits++; }
        byCompany.set(key, entry);
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => searchWorker()));

  // 2. Resolve each company to the account whose feed holds the same posting.
  const companies = [...byCompany.values()].slice(0, maxCompanies);
  stats.companies = companies.length;
  const items: JobListItem[] = [];
  const seenSlugs = new Set<string>();
  async function resolveWorker() {
    while (companies.length && Date.now() < deadline) {
      const c = companies.shift()!;
      let accepted = false;
      for (const slug of workableSlugCandidates(c.name, c.website)) {
        if (Date.now() >= deadline) break;
        if (seenSlugs.has(slug)) { accepted = true; break; }
        const raw = await accountFeed(slug);
        if (!raw?.length) continue;
        // Keep account only if it has >=1 job AND at least one job with country Italy.
        const hasItalianJob = raw.some((job) => {
          const country = (job.location?.country ?? "").toLowerCase();
          return country === "italy" || country === "italia" || country === "it";
        });
        if (!hasItalianJob) continue;
        const matched = c.hits.filter((hit) => raw.some((r) => sameWorkablePosting(hit, r)));
        if (!matched.length) continue;
        seenSlugs.add(slug);
        accepted = true;
        // The whole account feed, as the curated sync would return it, so the
        // board-close step stays consistent. Search descriptions fill the
        // empty descriptions of the matched postings (better match scoring and
        // explicit eligibility sentences).
        const mapped = mapWorkableAccountJobs(raw, slug, c.name);
        for (const item of mapped) {
          const hit = matched.find((h) => norm(h.title) === norm(item.title));
          if (hit && !item.description && hit.description) item.description = cleanHtmlText(hit.description).slice(0, 2000);
        }
        items.push(...mapped);
        break;
      }
      if (accepted) stats.resolved++; else stats.unresolved++;
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => resolveWorker()));
  stats.items = items.length;
  return { items, stats };
}

/** Where to search for one user's preferences: their towns, and their home
 * country when they accept remote work (remote postings list a country). */
export function workableSearchWheres(locations: string[], modes: string[]): string[] {
  const out = new Set<string>();
  const acceptsRemote = modes.some((m) => m.toLowerCase() === "remoto")
    || locations.some((l) => /^(remote|remoto)(?:\s|$|\()/i.test(l.trim()));
  for (const raw of locations) {
    const l = raw.trim();
    if (!l || /^(remote|remoto)(?:\s|$|\()/i.test(l)) continue;
    out.add(l.split(",")[0].trim());
  }
  if (acceptsRemote) for (const cc of homeCountries(locations)) if (COUNTRY_SEARCH_NAME[cc]) out.add(COUNTRY_SEARCH_NAME[cc]);
  return [...out];
}

/** Queries for users who actually run auto/hybrid apply (never test accounts). */
export async function collectWorkableSearchQueries(maxQueries = 24): Promise<WorkableSearchQuery[]> {
  const { prisma } = await import("@/lib/db");
  const { isTestAccount } = await import("@/lib/admin");
  const rows = await prisma.userPreferences.findMany({
    where: {
      autoApplyMode: { in: ["auto", "hybrid"] },
      rolesJson: { not: "[]" },
      locationsJson: { not: "[]" },
      // Only people the sender can actually serve: verified, consented, and
      // on an active or trialing plan (the worker refuses everyone else).
      user: { suspendedAt: null, emailVerified: { not: null }, privacyConsentAt: { not: null }, subscriptionStatus: { in: ["active", "trialing"] } },
    },
    select: { rolesJson: true, locationsJson: true, sourcesJson: true, user: { select: { email: true } } },
  });
  const parse = (raw: string) => { try { const v: unknown = JSON.parse(raw); return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []; } catch { return []; } };
  const out: WorkableSearchQuery[] = [];
  const seen = new Set<string>();
  // Round-robin across users so one user with many roles cannot take the budget.
  const perUser = rows.filter((r) => !isTestAccount(r.user?.email)).map((r) => {
    const roles = parse(r.rolesJson).map((x) => x.trim()).filter((x) => x.length >= 3).slice(0, 4);
    const wheres = workableSearchWheres(parse(r.locationsJson), parse(r.sourcesJson));
    return roles.flatMap((what) => wheres.map((where) => ({ what, where })));
  });
  for (let i = 0; out.length < maxQueries && perUser.some((qs) => qs.length > i); i++) {
    for (const qs of perUser) {
      const q = qs[i];
      if (!q) continue;
      const key = `${q.what.toLowerCase()}|${q.where.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(q);
      if (out.length >= maxQueries) break;
    }
  }
  return out;
}
