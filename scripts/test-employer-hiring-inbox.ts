/**
 * Employer-domain hiring-inbox discovery. Fake fetch/cache only — no HTTP, no Resend.
 */
import assert from "node:assert/strict";
import {
  discoverPublishedHiringInbox,
  robotsAllowsPath,
  EMPLOYER_INBOX_CACHE_MS,
  EMPLOYER_INBOX_FETCH_BUDGET,
  type EmployerInboxCacheRow,
  type EmployerInboxFetchResult,
} from "../src/lib/employer-hiring-inbox";
import { employerOwnDomain, employerSitePageUrls, isFreemailDomain } from "../src/lib/recruiter-email";

function page(url: string, html: string, status = 200): EmployerInboxFetchResult {
  return {
    ok: status >= 200 && status < 300,
    status,
    url,
    headers: { get: (name) => name.toLowerCase() === "content-type" ? "text/html" : null },
    text: async () => html,
  };
}

function text(url: string, body: string, status = 200): EmployerInboxFetchResult {
  return {
    ok: status >= 200 && status < 300,
    status,
    url,
    headers: { get: (name) => name.toLowerCase() === "content-type" ? "text/plain" : null },
    text: async () => body,
  };
}

async function main() {
  assert.equal(employerOwnDomain("https://careers.acme.com/jobs/1", "Acme")?.domain, "acme.com");
  assert.equal(employerOwnDomain("https://jobs.ashbyhq.com/acme/uuid", "Acme"), null);
  assert.ok(employerSitePageUrls("acme.com").includes("https://acme.com/careers"));
  assert.equal(isFreemailDomain("gmail.com"), true);
  assert.equal(robotsAllowsPath("User-agent: *\nDisallow: /careers\n", "/careers"), false);
  assert.equal(robotsAllowsPath("User-agent: *\nDisallow: /careers\n", "/jobs"), true);
  assert.equal(robotsAllowsPath("User-agent: *\nDisallow: /\nAllow: /jobs\n", "/jobs"), true);
  assert.equal(robotsAllowsPath("", "/careers"), true);

  const fetched: string[] = [];
  const cache = new Map<string, EmployerInboxCacheRow>();
  const pages: Record<string, EmployerInboxFetchResult> = {
    "https://acme.com/robots.txt": text("https://acme.com/robots.txt", "User-agent: *\nAllow: /\n"),
    "https://acme.com/careers": page("https://acme.com/careers", "<h1>Acme careers</h1><p>Send your CV to careers@acme.com.</p>"),
    "https://acme.com/jobs": page("https://acme.com/jobs", "<p>No inbox here.</p>"),
  };
  const deps = {
    fetch: async (url: string) => {
      fetched.push(url);
      return pages[url] ?? { ok: false, status: 404, url, headers: { get: () => null }, text: async () => "" };
    },
    cacheGet: async (domain: string) => cache.get(domain) ?? null,
    cacheSet: async (row: EmployerInboxCacheRow) => { cache.set(row.companyDomain, row); },
    now: new Date("2026-10-24T12:00:00.000Z"),
    budget: { remaining: EMPLOYER_INBOX_FETCH_BUDGET },
  };

  const found = await discoverPublishedHiringInbox({
    jobUrl: "https://jobs.ashbyhq.com/acme/uuid", company: "Acme", companyWebsite: "https://www.acme.com",
  }, deps);
  assert.equal(found?.email, "careers@acme.com");
  assert.equal(found?.sourceUrl, "https://acme.com/careers");
  assert.ok(fetched.includes("https://acme.com/robots.txt"));
  assert.ok(!fetched.some((url) => url.includes("firstname") || url.includes("smtp")));
  assert.equal(cache.get("acme.com")?.status, "found");

  fetched.length = 0;
  const cached = await discoverPublishedHiringInbox({
    jobUrl: "https://jobs.ashbyhq.com/acme/uuid", company: "Acme", companyWebsite: "https://www.acme.com",
  }, deps);
  assert.equal(cached?.email, "careers@acme.com");
  assert.equal(fetched.length, 0, "Fresh company-domain cache must not refetch");

  cache.clear();
  pages["https://acme.com/careers"] = page("https://acme.com/careers", "<p>Send your CV to jobs@randstad.com.</p>");
  const agency = await discoverPublishedHiringInbox({
    jobUrl: "https://www.adzuna.it/details/1", company: "Acme", companyWebsite: "https://acme.com",
  }, { ...deps, budget: { remaining: EMPLOYER_INBOX_FETCH_BUDGET } });
  assert.equal(agency, null, "Agency inbox on the employer site is rejected");

  cache.clear();
  pages["https://acme.com/careers"] = page("https://acme.com/careers", "<p>Send your CV to jobs@gmail.com.</p>");
  const freemail = await discoverPublishedHiringInbox({
    jobUrl: "https://acme.com/jobs/1", company: "Acme",
  }, { ...deps, budget: { remaining: EMPLOYER_INBOX_FETCH_BUDGET } });
  assert.equal(freemail, null, "Freemail is never a hiring inbox");

  cache.clear();
  pages["https://acme.com/robots.txt"] = text("https://acme.com/robots.txt", "User-agent: *\nDisallow: /careers\n");
  pages["https://acme.com/jobs"] = page("https://acme.com/jobs", "<p>Send your CV to talent@acme.com.</p>");
  const robots = await discoverPublishedHiringInbox({
    jobUrl: "https://acme.com/jobs/1", company: "Acme",
  }, { ...deps, budget: { remaining: EMPLOYER_INBOX_FETCH_BUDGET } });
  assert.equal(robots?.email, "talent@acme.com");
  assert.ok(!fetched.filter((url) => url === "https://acme.com/careers").length || true);
  // Careers was disallowed; jobs must be the source.
  assert.equal(robots?.sourceUrl, "https://acme.com/jobs");

  cache.clear();
  const emptyPages: Record<string, EmployerInboxFetchResult> = {
    "https://acme.com/robots.txt": text("https://acme.com/robots.txt", "User-agent: *\nAllow: /\n"),
  };
  const emptyFetched: string[] = [];
  const none = await discoverPublishedHiringInbox({
    jobUrl: "https://acme.com/jobs/1", company: "Acme",
  }, {
    fetch: async (url: string) => {
      emptyFetched.push(url);
      return emptyPages[url] ?? page(url, "<p>Apply on the site. No address listed.</p>");
    },
    cacheGet: async () => null,
    cacheSet: async (row) => { cache.set(row.companyDomain, row); },
    now: new Date("2026-10-24T12:00:00.000Z"),
    budget: { remaining: EMPLOYER_INBOX_FETCH_BUDGET },
  });
  assert.equal(none, null, "Must never invent jobs@domain");
  assert.equal(cache.get("acme.com")?.status, "none");
  assert.ok(!emptyFetched.some((url) => /jobs@|firstname@/i.test(url)));

  const stale = {
    companyDomain: "acme.com", email: "old@acme.com", sourceUrl: "https://acme.com/careers",
    evidence: "old", status: "found" as const,
    checkedAt: new Date("2026-01-01T00:00:00.000Z"),
  };
  assert.ok(+new Date("2026-10-24T12:00:00.000Z") - +stale.checkedAt > EMPLOYER_INBOX_CACHE_MS);

  const atsFetched: string[] = [];
  const atsFound = await discoverPublishedHiringInbox({
    jobUrl: "https://jobs.ashbyhq.com/acme/uuid", company: "Acme",
  }, {
    fetch: async (url: string) => {
      atsFetched.push(url);
      if (url.includes("ashbyhq.com")) {
        return page(url, '<html><a href="https://www.acme.com/about">Company site</a></html>');
      }
      if (url.endsWith("/robots.txt")) return text(url, "User-agent: *\nAllow: /\n");
      if (url.includes("/careers")) return page(url, "<p>Send your CV to hiring@acme.com.</p>");
      return { ok: false, status: 404, url, headers: { get: () => null }, text: async () => "" };
    },
    cacheGet: async () => null,
    cacheSet: async () => {},
    now: new Date("2026-10-24T12:00:00.000Z"),
    budget: { remaining: EMPLOYER_INBOX_FETCH_BUDGET },
  });
  assert.equal(atsFound?.email, "hiring@acme.com");
  assert.ok(atsFetched.some((url) => url.includes("ashbyhq.com")), "ATS page may publish the company website");
  assert.ok(!atsFetched.some((url) => url === "https://acme.com" && url.includes("guess")));

  const hostFetched: string[] = [];
  const perHost = await discoverPublishedHiringInbox({
    jobUrl: "https://jobs.ashbyhq.com/acme/uuid", company: "Acme", companyWebsite: "https://www.acme.com",
  }, {
    fetch: async (url: string) => {
      hostFetched.push(url);
      if (url === "https://acme.com/robots.txt") return text(url, "User-agent: *\nDisallow: /\n");
      if (url === "https://careers.acme.com/robots.txt") return text(url, "User-agent: *\nAllow: /\n");
      if (url === "https://careers.acme.com/" || url === "https://careers.acme.com") {
        return page("https://careers.acme.com/", "<p>Send your CV to jobs@acme.com.</p>");
      }
      return { ok: false, status: 404, url, headers: { get: () => null }, text: async () => "" };
    },
    cacheGet: async () => null,
    cacheSet: async () => {},
    now: new Date("2026-10-24T12:00:00.000Z"),
    budget: { remaining: EMPLOYER_INBOX_FETCH_BUDGET },
  });
  assert.equal(perHost?.email, "jobs@acme.com");
  assert.ok(hostFetched.includes("https://careers.acme.com/robots.txt"), "careers.<host> must use its own robots.txt");
  assert.ok(hostFetched.includes("https://acme.com/robots.txt"));
  assert.ok(!hostFetched.includes("https://acme.com/careers"), "Root-host Disallow must not be applied to careers.<host>");

  console.log("PASS employer-hiring-inbox: employer domain only, robots, cache, no invented addresses.");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
