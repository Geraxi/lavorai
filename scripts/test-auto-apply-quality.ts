import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { createHash } from "node:crypto";
import { domainToASCII, domainToUnicode } from "node:url";
import { parse as parseDomain } from "tldts";

// Execute the real source with fully isolated service boundaries. No production
// database, Redis, DNS, AI or email provider is reachable from this test.
function loadModule(path: string, dependencies: Record<string, unknown>, globals: Record<string, unknown> = {}) {
  const output = ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} as Record<string, any> };
  vm.runInNewContext(output, {
    module, exports: module.exports,
    require: (id: string) => {
      assert.ok(id in dependencies, `Unexpected dependency: ${id}`);
      return dependencies[id];
    },
    console: { log() {}, warn() {}, error() {} }, Date, Map, Set, Uint8Array, URL,
    crypto: { getRandomValues: (bytes: Uint8Array) => bytes.fill(1) },
    ...globals,
  }, { filename: path });
  return module.exports;
}

async function testCronBothPasses() {
  const created: Array<Record<string, any>> = [];
  const queued: string[] = [];
  const job = (id: string, overrides: Record<string, unknown> = {}) => ({
    id, title: "Product Designer", company: "Acme", location: "Milano",
    remote: false, contractType: "full time", description: "Permanent product design role.",
    salaryMin: 60_000, salaryMax: 70_000, postedAt: new Date("2026-01-01T00:00:00.000Z"),
    url: `https://jobs.ashbyhq.com/acme/${id}`, category: "design", ...overrides,
  });
  const jobs = [
    job("valid-first"), job("valid-second-same-company"),
    job("wrong-location", { company: "LocationCo", location: "Berlin" }),
    job("wrong-employment", { company: "FreelanceCo", contractType: "freelance" }),
    job("wrong-salary", { company: "SalaryCo", salaryMin: 30_000, salaryMax: 40_000 }),
  ];
  const preferences = {
    autoApplyMode: "auto", matchMin: 50, dailyCap: 5, rolesJson: '["Product Designer"]',
    locationsJson: '["Milano"]', salaryMin: 50, employmentType: "employee",
  };
  const user = {
    id: "test-user", email: "test-user@example.test", tier: "pro", trialEndsAt: null,
    trialGraceEndsAt: null, createdAt: new Date(), avoidCompanies: null,
    preferences, cvProfile: {},
  };
  const prisma = {
    user: { findUnique: async () => user },
    applicationSession: { findMany: async () => [] },
    job: { findMany: async () => jobs },
    application: {
      count: async () => 0, groupBy: async () => [], findMany: async () => [],
      findFirst: async (query: { where: { jobId: string } }) => created.find((a) => a.jobId === query.where.jobId) ?? null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const app = { id: `app-${created.length}`, ...data };
        created.push(app); return app;
      },
    },
  };
  const preferenceHelpers = loadModule("src/lib/auto-apply-preferences.ts", {});
  const api = loadModule("src/lib/auto-apply-cron.ts", {
    "@/lib/application-pause": { applicationsPaused: () => false },
    "@/lib/auto-apply-preferences": preferenceHelpers,
    "@/lib/db": { prisma },
    "@/lib/admin-user-actions": { monthlyQuotaSince: () => new Date(0) },
    "@/lib/cv-profile-types": { rowToProfile: () => ({ experiences: [], skills: [], title: "Product Designer", summary: "" }) },
    "@/lib/match-score": { quickMatchScore: (profile: { experiences: unknown[] }) => {
      assert.equal(profile.experiences.length, 0, "Desired search roles must never be synthesized into CV experience to boost scores");
      return 90;
    } },
    "@/lib/application-queue": { enqueueApplication: async (id: string) => queued.push(id) },
    "@/lib/apply-session": { resolveSession: async () => ({ id: "session-test", status: "active" }) },
    "@/lib/billing": {
      dailyApplicationLimit: () => 5, effectiveTier: () => "pro",
      getLimits: () => ({ monthlyApplications: 100 }),
      isApplicationAccessPaused: () => false, requiresPaymentMethodBeforeApp: () => false,
    },
    "@/lib/role-match": { titleMatchesAnyRole: () => true },
    "@/lib/auto-apply-self-heal": { runSelfHeal: async () => { throw new Error("Unexpected self-heal"); } },
    "@/lib/conversion-events": { recordConversionEvent: async () => {} },
    "@/lib/analytics": { AnalyticsEvent: { APPLICATION_CREATED: "application_created" } },
  });
  const stats = await api.runAutoApplyForUser(user.id);
  assert.deepEqual(created.map((a) => a.jobId), ["valid-first", "valid-second-same-company"],
    "Pass 2 must fill only with eligible jobs; it may relax company diversification, never preferences");
  assert.equal(queued.length, 2);
  assert.equal(stats.applicationsEnqueued, 2);
  assert.equal(stats.skippedLocationMismatch, 1);
  assert.equal(stats.skippedEmploymentMismatch, 1);
  assert.equal(stats.errors, 0);

  const mismatch = api.autoApplyPreferenceMismatch;
  assert.equal(mismatch(job("freelance", { contractType: "freelance" }), { ...preferences, employmentType: "piva" }, ["Milano"]), null);
  assert.equal(mismatch(job("employee"), { ...preferences, employmentType: "piva" }, ["Milano"]), "employment");
  assert.equal(mismatch(job("both", { contractType: "freelance" }), { ...preferences, employmentType: "both" }, ["Milano"]), null);
  assert.equal(mismatch(job("salary-min-only", { salaryMin: 40_000, salaryMax: null }), preferences, ["Milano"]), "salary");
  assert.equal(mismatch(job("salary-boundary", { salaryMax: 50_000 }), preferences, ["Milano"]), null);
  assert.equal(mismatch(job("salary-unknown", { salaryMin: null, salaryMax: null }), preferences, ["Milano"]), null);
  // A remote flag cannot override geographic restrictions.
  assert.equal(mismatch(job("remote", { remote: true, location: "Berlin" }), preferences, ["Milano"]), "location");
  assert.equal(mismatch(job("no-location-pref", { location: "Berlin" }), preferences, []), null);
  console.log("[auto-apply-quality] Both-pass enqueue regression and preference compatibility passed.");
}

async function testRecruiterEmail() {
  let html = "";
  let dnsAvailable = true;
  let dnsCalls = 0;
  let status = 200;
  let finalUrl = "https://careers.acme.com/job";
  let aiCalls = 0;
  const api = loadModule("src/lib/recruiter-email.ts", {
    "node:crypto": { createHash },
    "node:url": { domainToASCII, domainToUnicode },
    "tldts": { parse: parseDomain },
    "@/lib/ai-router": { complete: async () => { aiCalls++; return { text: "recruiting@acme.com" }; } },
    "node:dns/promises": {
      resolveMx: async () => { dnsCalls++; return dnsAvailable ? [{ exchange: "mail.acme.com", priority: 10 }] : []; },
      resolve4: async () => [],
    },
  }, { AbortSignal, fetch: async () => ({ ok: status === 200, status, url: finalUrl,
    headers: { get: () => "text/html" }, text: async () => html }) });
  const scrape = async (email: string) => {
    html = `<html><body><h1>Acme: Product Designer</h1><p>Send your CV to ${email}.</p></body></html>`;
    return api.scrapeRecruiterEmail("https://careers.acme.com/job", "Acme");
  };
  for (const email of ["info@acme.com", "privacy@acme.com", "noreply@acme.com", "accessiblerecruitment@acme.com", "accommodation@acme.com", "name@example.com"]) {
    assert.equal(await scrape(email), null, `Blocked address must never survive: ${email}`);
  }
  assert.equal(dnsCalls, 0, "Blocked addresses must be rejected before DNS");
  assert.equal(await scrape(""), null, "An AI-invented address absent from HTML cannot be selected");
  assert.equal(aiCalls, 0, "Address verification requires no AI invention or cost");
  assert.equal(await scrape("privacy@acme.com careers@acme.com"), "careers@acme.com");
  const verified = await api.findVerifiedRecruiterEmail("https://careers.acme.com/job", "Acme", "unwantedCachedAddress@other.test");
  assert.equal(verified.email, "careers@acme.com");
  assert.equal(verified.provenance.sourceType, "employer_job_page");
  assert.equal(verified.provenance.pageSha256.length, 64);
  assert(verified.provenance.evidence.includes("careers@acme.com"));
  assert.equal(await scrape("recruiting@other.test"), null, "Unrelated email owner must be reviewed");
  html = '<h1>Acme Product Designer</h1><p>Apply now on our site.</p><footer>Send CV to careers@acme.com</footer><script>"jobs@acme.com"</script>';
  assert.equal(await api.findVerifiedRecruiterEmail("https://careers.acme.com/job", "Acme", "careers@acme.com"), null, "Scripts, footer or stale cache are not application provenance");
  html = '<h1>Acme Product Designer</h1><p>Contact employee alice@acme.com for press inquiries.</p>';
  assert.equal(await api.scrapeRecruiterEmail("https://careers.acme.com/job", "Acme"), null);
  html = '<h1>Acme Product Designer</h1><p>Send your CV to <a href="mailto:careers&#64;acme.com">our recruitment team</a>.</p>';
  assert.equal(await api.scrapeRecruiterEmail("https://careers.acme.com/job", "Acme"), "careers@acme.com");
  finalUrl = "https://other.test/job";
  assert.equal(await api.scrapeRecruiterEmail("https://careers.acme.com/job", "Acme"), null, "Cross-employer redirect rejected");
  finalUrl = "https://careers.acme.com/job"; status = 503;
  assert.equal(await scrape("careers@acme.com"), null, "Transient page cannot authorize cached address");
  status = 200; dnsAvailable = false;
  assert.equal(await scrape("careers@acme.com"), null, "Missing DNS blocks delivery but DNS itself never proves ownership");
  dnsAvailable = true;
  const verify = async (url: string, email = "careers@acme.com", company = "Acme", redirectedTo = url) => {
    finalUrl = redirectedTo;
    html = `<h1>${company} Product Designer</h1><p>Send your CV to ${email}.</p>`;
    return (await api.findVerifiedRecruiterEmail(url, company))?.email ?? null;
  };
  const accepted: Array<[string, string, string?]> = [
    ["https://careers.acme.com/jobs/one", "jobs@acme.com"],
    ["https://careers.acme.co.uk/jobs/one", "jobs@acme.co.uk"],
    ["https://careers.acme.co.uk/jobs/one", "careers@recruiting.acme.co.uk"],
    ["https://careers.acme.com.au/jobs/one", "jobs@acme.com.au"],
    ["https://acme.github.io/jobs/one", "jobs@acme.github.io"],
    ["https://careers.acme.com:443/jobs/one", "jobs@acme.com"],
    ["https://careers.acme.com/jobs/one", "jobs@acme.com", "Acme Ltd"],
    ["https://careers.müller.de/jobs/one", "jobs@xn--mller-kva.de", "Müller"],
    ["https://careers.xn--mller-kva.de/jobs/one", "jobs@xn--mller-kva.de", "Mu\u0308ller"],
    ["https://boards.greenhouse.io/acme/jobs/123", "jobs@acme.com"],
    ["https://job-boards.greenhouse.io/acme/jobs/123", "jobs@acme.com"],
    ["https://jobs.ashbyhq.com/acme/posting-id", "jobs@acme.com"],
    ["https://jobs.lever.co/acme/posting-id", "jobs@acme.com"],
    ["https://jobs.eu.lever.co/acme/posting-id", "jobs@acme.com"],
    ["https://apply.workable.com/acme/j/posting-id/", "jobs@acme.com"],
    ["https://jobs.smartrecruiters.com/acme/posting-id", "jobs@acme.com"],
    ["https://acme.recruitee.com/o/posting-id", "jobs@acme.com"],
    ["https://acme.teamtailor.com/jobs/123-designer", "jobs@acme.com"],
    ["https://acme.bamboohr.com/careers/123", "jobs@acme.com"],
    ["https://acme.breezy.hr/p/posting-id", "jobs@acme.com"],
    ["https://acme.pinpointhq.com/postings/posting-id", "jobs@acme.com"],
    ["https://acme.jobs.personio.de/job/123", "jobs@acme.com"],
  ];
  for (const [url, email, company] of accepted) {
    assert.equal(await verify(url, email, company), email, `Verified registrable-domain/ATS source should pass: ${url}`);
  }
  const rejected: Array<[string, string?, string?, string?]> = [
    ["https://acme.unrelated.test/jobs/one", "careers@acme.unrelated.test"],
    ["https://acme.evil.com/jobs/one", "careers@acme.evil.com"],
    ["https://acme.evil.com/jobs/one", "careers@acme.com"],
    ["https://acme.evil.co.uk/jobs/one", "careers@acme.evil.co.uk"],
    ["https://careers.acme.com/jobs/one", "careers@acme.evil.com"],
    ["https://careers.acme.com/jobs/one", "careers@acme.co.uk"],
    ["https://careers.acme.com/jobs/one", "careers@notacme.com"],
    ["https://careers.notacme.com/jobs/one", "careers@notacme.com"],
    ["https://careers.acme-ltd.com/jobs/one", "careers@acme-ltd.com"],
    ["https://acme.github.io/jobs/one", "careers@acme.other.github.io"],
    ["https://acme.other.github.io/jobs/one", "careers@acme.github.io"],
    ["https://careers.acme.co.uk/jobs/one", "jobs@acme.co.uk.evil.com"],
    ["https://careers.acme.com.evil.com/jobs/one", "jobs@acme.com"],
    ["https://acme.com/jobs/one", "jobs@acme.com", "Com"],
    ["https://acme.test/jobs/one", "careers@acme.test"],
    ["https://acme.invalid/jobs/one", "careers@acme.invalid"],
    ["https://acme.unknownsuffix/jobs/one", "careers@acme.unknownsuffix"],
    ["https://acme..com/jobs/one"],
    ["https://acme.com./jobs/one"],
    ["https://xn--.com/jobs/one"],
    ["https://127.0.0.1/jobs/one"],
    ["http://careers.acme.com/jobs/one"],
    ["ftp://careers.acme.com/jobs/one"],
    ["https://user:pass@careers.acme.com/jobs/one"],
    ["https://careers.acme.com:8443/jobs/one"],
    ["https://careers.acme.com/jobs/one", undefined, undefined, "http://careers.acme.com/jobs/one"],
    ["https://careers.acme.com/jobs/one", undefined, undefined, "https://careers.acme.com:8443/jobs/one"],
    ["https://careers.acme.com/jobs/one", undefined, undefined, "https://user:pass@careers.acme.com/jobs/one"],
    ["https://careers.аcme.com/jobs/one", "jobs@" + domainToASCII("аcme.com")], // Cyrillic a
    ["https://careers.acme.com/jobs/one", "jobs@" + domainToASCII("аcme.com")],
    ["https://careers.acm.com/jobs/one", "jobs@acm.com", "Acmé"],
    ["https://careers.muller.de/jobs/one", "jobs@muller.de", "Müller"],
    ["https://careers.acme.com/jobs/one", "jobs@acme.com.évil.com"],
    ["https://careers.acme.com/jobs/one", "éjobs@acme.com"],
    ["https://jobs.ashbyhq.com/other/acme", "jobs@acme.com"],
    ["https://jobs.ashbyhq.com/other/posting-id/acme", "jobs@acme.com"],
    ["https://jobs.ashbyhq.com/acme/", "jobs@acme.com"],
    ["https://acme.ashbyhq.com/other/posting-id", "jobs@acme.com"],
    ["https://jobs.ashbyhq.com.evil.com/acme/posting-id", "jobs@acme.com"],
    ["https://boards.greenhouse.io/other/jobs/acme", "jobs@acme.com"],
    ["https://boards.greenhouse.io/acme", "jobs@acme.com"],
    ["https://boards.greenhouse.io/embed/job_app?for=acme&token=123", "jobs@acme.com"],
    ["https://jobs.lever.co/other/acme", "jobs@acme.com"],
    ["https://apply.workable.com/other/j/acme", "jobs@acme.com"],
    ["https://acme.other.recruitee.com/o/one", "jobs@acme.com"],
    ["https://other.recruitee.com/o/acme", "jobs@acme.com"],
    ["https://acme.recruitee.com/contact", "jobs@acme.com"],
    ["https://jobs.ashbyhq.com/acme/posting-id", "jobs@acme.evil.com"],
    ["https://jobs.ashbyhq.com/acme/posting-id", undefined, undefined, "https://jobs.ashbyhq.com/other/acme"],
  ];
  for (const [url, email, company, redirectedTo] of rejected) {
    const beforeDns: number = dnsCalls;
    assert.equal(await verify(url, email, company, redirectedTo), null, `Unverified attribution must require review: ${url}, ${email ?? "careers@acme.com"}`);
    assert.equal(dnsCalls, beforeDns, "Domain/tenant attribution must fail before DNS can lend false credibility");
  }
  console.log(`[auto-apply-quality] ${accepted.length + rejected.length} registrable-domain, suffix, private-tenant, ATS, URL and IDN regressions passed.`);
  console.log("[auto-apply-quality] Fresh page provenance, cache/AI rejection, blocklist and DNS checks passed.");
}

async function main() {
  if (!process.argv.includes("--email-only")) await testCronBothPasses();
  if (!process.argv.includes("--cron-only")) await testRecruiterEmail();
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
