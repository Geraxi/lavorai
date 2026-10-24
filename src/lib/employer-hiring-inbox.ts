/**
 * Discover a published hiring inbox on the employer's own domain.
 * Never invents firstname@ / jobs@ addresses, never probes SMTP, never
 * solves captcha. Fetch I/O is injectable so tests never hit the network.
 */
import { prisma } from "@/lib/db";
import {
  companyWebsiteFromPage,
  employerOwnDomain,
  employerSitePageUrls,
  extractPublishedRecruiterEmailsFromText,
  isFreemailDomain,
  type DiscoveredHiringInbox,
} from "@/lib/recruiter-email";

export const EMPLOYER_INBOX_CACHE_MS = 7 * 24 * 60 * 60 * 1000;
export const EMPLOYER_INBOX_FETCH_BUDGET = 6;
export const EMPLOYER_INBOX_FETCH_TIMEOUT_MS = 8_000;
export const EMPLOYER_INBOX_USER_AGENT = "LavorAIBot/1.0 (+https://lavorai.it)";

export type EmployerInboxCacheRow = {
  companyDomain: string;
  email: string | null;
  sourceUrl: string | null;
  evidence: string | null;
  status: "found" | "none";
  checkedAt: Date;
};

export type FetchBudget = { remaining: number };

export type EmployerInboxFetchResult = {
  ok: boolean;
  status: number;
  url: string;
  headers: { get: (name: string) => string | null };
  text: () => Promise<string>;
};

export type EmployerInboxDeps = {
  fetch: (url: string, init?: { headers?: Record<string, string>; signal?: AbortSignal; redirect?: RequestRedirect }) => Promise<EmployerInboxFetchResult>;
  cacheGet: (domain: string) => Promise<EmployerInboxCacheRow | null>;
  cacheSet: (row: EmployerInboxCacheRow) => Promise<void>;
  now?: Date;
  budget?: FetchBudget;
};

function defaultDeps(): EmployerInboxDeps {
  return {
    fetch: async (url, init) => {
      const response = await fetch(url, {
        headers: init?.headers,
        signal: init?.signal ?? AbortSignal.timeout(EMPLOYER_INBOX_FETCH_TIMEOUT_MS),
        redirect: init?.redirect ?? "follow",
      });
      return {
        ok: response.ok,
        status: response.status,
        url: response.url || url,
        headers: { get: (name) => response.headers.get(name) },
        text: () => response.text(),
      };
    },
    cacheGet: async (domain) => {
      const row = await prisma.employerHiringInbox.findUnique({ where: { companyDomain: domain } });
      if (!row) return null;
      return {
        companyDomain: row.companyDomain,
        email: row.email,
        sourceUrl: row.sourceUrl,
        evidence: row.evidence,
        status: row.status === "found" ? "found" : "none",
        checkedAt: row.checkedAt,
      };
    },
    cacheSet: async (row) => {
      await prisma.employerHiringInbox.upsert({
        where: { companyDomain: row.companyDomain },
        create: row,
        update: { email: row.email, sourceUrl: row.sourceUrl, evidence: row.evidence, status: row.status, checkedAt: row.checkedAt },
      });
    },
  };
}

/** Honor User-agent * / LavorAI Disallow prefixes. Missing group allows the path. */
export function robotsAllowsPath(robotsTxt: string, pathname: string): boolean {
  const path = pathname.startsWith("/") ? pathname : `/${pathname}`;
  const lines = robotsTxt.replace(/\r/g, "").split("\n").map((line) => line.replace(/#.*$/, "").trim());
  let applies = false;
  let sawStar = false;
  const rules: Array<{ allow: boolean; prefix: string }> = [];
  for (const line of lines) {
    const ua = /^user-agent\s*:\s*(.+)$/i.exec(line);
    if (ua) {
      const agent = ua[1].trim().toLowerCase();
      applies = agent === "*" || agent.startsWith("lavorai");
      if (agent === "*") sawStar = true;
      continue;
    }
    if (!applies) continue;
    const allow = /^(allow|disallow)\s*:\s*(.*)$/i.exec(line);
    if (!allow) continue;
    const prefix = (allow[2] ?? "").trim() || (allow[1].toLowerCase() === "disallow" ? "/" : "");
    if (!prefix) continue;
    rules.push({ allow: allow[1].toLowerCase() === "allow", prefix });
  }
  if (!sawStar && rules.length === 0) return true;
  let allowed = true;
  let matchLen = -1;
  for (const rule of rules) {
    if (path === rule.prefix || path.startsWith(rule.prefix.endsWith("/") ? rule.prefix : `${rule.prefix}`)) {
      if (rule.prefix.length >= matchLen) {
        allowed = rule.allow;
        matchLen = rule.prefix.length;
      }
    }
  }
  return allowed;
}

function spend(budget: FetchBudget | undefined): boolean {
  if (!budget) return true;
  if (budget.remaining <= 0) return false;
  budget.remaining -= 1;
  return true;
}

async function readPage(
  url: string,
  domain: string,
  deps: EmployerInboxDeps,
  budget: FetchBudget | undefined,
): Promise<{ html: string; final: URL } | null> {
  if (!spend(budget)) return null;
  try {
    const response = await deps.fetch(url, {
      headers: { "User-Agent": EMPLOYER_INBOX_USER_AGENT, accept: "text/html" },
      signal: AbortSignal.timeout(EMPLOYER_INBOX_FETCH_TIMEOUT_MS),
      redirect: "follow",
    });
    if (!response.ok) return null;
    const final = new URL(response.url || url);
    if (final.protocol !== "https:" || final.username || final.password || final.port) return null;
    const host = final.hostname.toLowerCase();
    if (host !== domain && !host.endsWith(`.${domain}`)) return null;
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType && !/text\/html|application\/xhtml\+xml/i.test(contentType)) return null;
    const html = (await response.text()).slice(0, 300_000);
    if (/captcha|access denied|cf-challenge/i.test(html.slice(0, 8_000))) return null;
    return { html, final };
  } catch { return null; }
}

async function robotsForDomain(
  domain: string,
  deps: EmployerInboxDeps,
  budget: FetchBudget | undefined,
): Promise<string | null> {
  if (!spend(budget)) return "";
  try {
    const response = await deps.fetch(`https://${domain}/robots.txt`, {
      headers: { "User-Agent": EMPLOYER_INBOX_USER_AGENT, accept: "text/plain" },
      signal: AbortSignal.timeout(EMPLOYER_INBOX_FETCH_TIMEOUT_MS),
      redirect: "follow",
    });
    if (response.status === 404) return null;
    if (!response.ok) return "";
    const final = new URL(response.url || `https://${domain}/robots.txt`);
    if (final.protocol !== "https:") return "";
    return (await response.text()).slice(0, 20_000);
  } catch { return ""; }
}

function hiringInboxOnPage(html: string, pageUrl: string, company: string, domain: string): DiscoveredHiringInbox | null {
  const [best] = extractPublishedRecruiterEmailsFromText(html, company, {
    requireCompanyDomain: true,
    pageDomain: domain,
    atsPage: false,
    jobUrl: pageUrl,
  });
  if (!best) return null;
  const emailDomain = best.email.split("@")[1] ?? "";
  if (isFreemailDomain(emailDomain)) return null;
  if (emailDomain !== domain && !emailDomain.endsWith(`.${domain}`)) return null;
  return { email: best.email, sourceUrl: pageUrl, evidence: best.evidence };
}

export async function discoverPublishedHiringInbox(input: {
  jobUrl: string;
  company: string;
  companyWebsite?: string | null;
}, overrides: Partial<EmployerInboxDeps> = {}): Promise<DiscoveredHiringInbox | null> {
  if (!input.company.trim()) return null;
  const deps = { ...defaultDeps(), ...overrides };
  const now = deps.now ?? new Date();
  const budget = deps.budget ?? { remaining: EMPLOYER_INBOX_FETCH_BUDGET };

  let owned = employerOwnDomain(input.jobUrl, input.company, input.companyWebsite);
  if (!owned) {
    const seed = input.companyWebsite || input.jobUrl;
    const page = await readPage(seed, new URL(/^https?:\/\//i.test(seed) ? seed : `https://${seed}`).hostname.replace(/^www\./, ""), deps, budget).catch(() => null);
    const website = page ? companyWebsiteFromPage(page.html, page.final.toString(), input.company) : null;
    owned = website ? employerOwnDomain(website, input.company, website) : null;
  }
  if (!owned) return null;

  const cached = await deps.cacheGet(owned.domain).catch(() => null);
  if (cached && +now - +cached.checkedAt < EMPLOYER_INBOX_CACHE_MS) {
    return cached.status === "found" && cached.email && cached.sourceUrl
      ? { email: cached.email, sourceUrl: cached.sourceUrl, evidence: cached.evidence ?? "" }
      : null;
  }

  const robots = await robotsForDomain(owned.domain, deps, budget);
  if (robots === "") {
    await deps.cacheSet({
      companyDomain: owned.domain, email: null, sourceUrl: null, evidence: null, status: "none", checkedAt: now,
    }).catch(() => undefined);
    return null;
  }

  let found: DiscoveredHiringInbox | null = null;
  for (const url of employerSitePageUrls(owned.domain)) {
    let path = "/";
    try { path = new URL(url).pathname || "/"; } catch { continue; }
    if (robots && !robotsAllowsPath(robots, path)) continue;
    const page = await readPage(url, owned.domain, deps, budget);
    if (!page) continue;
    found = hiringInboxOnPage(page.html, page.final.toString(), input.company, owned.domain);
    if (found) break;
  }

  await deps.cacheSet({
    companyDomain: owned.domain,
    email: found?.email ?? null,
    sourceUrl: found?.sourceUrl ?? null,
    evidence: found?.evidence ?? null,
    status: found ? "found" : "none",
    checkedAt: now,
  }).catch(() => undefined);
  return found;
}
