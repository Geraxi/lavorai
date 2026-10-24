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
  const backfillCalls: number[] = [];
  const created: Array<Record<string, any>> = [];
  const queued: string[] = [];
  const resolverCalls: Array<{ roles: string[]; limit: number }> = [];
  const jobQueries: unknown[] = [];
  const job = (id: string, overrides: Record<string, unknown> = {}) => ({
    id, title: "Product Designer", company: "Acme", location: "Milano",
    remote: false, contractType: "full time", description: "Permanent product design role.",
    salaryMin: 60_000, salaryMax: 70_000, postedAt: new Date("2026-01-01T00:00:00.000Z"),
    url: `https://boards.greenhouse.io/acme/jobs/${id}`, category: "design", ...overrides,
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
    job: { findMany: async (query: unknown) => { jobQueries.push(query); return jobs; } },
    application: {
      count: async () => 0, groupBy: async () => [], findMany: async () => [],
      findFirst: async (query: { where: { jobId: string } }) => created.find((a) => a.jobId === query.where.jobId) ?? null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const app = { id: `app-${created.length}`, ...data };
        created.push(app); return app;
      },
    },
  };
  // Pure gazetteer data (city → country) used for remote-from-home scope.
  const preferenceHelpers = loadModule("src/lib/auto-apply-preferences.ts", { "@/lib/city-centroids": await import("../src/lib/city-centroids"), "@/lib/scrapers/ats-companies": await import("../src/lib/scrapers/ats-companies") });
  // Retain algorithm regression coverage behind an explicitly mocked legacy gate.
  // Production manual-only blocking is exercised in test-manual-rollout-producers.
  const api = loadModule("src/lib/auto-apply-cron.ts", {
    "@/lib/ats-skip-hosts": await import("../src/lib/ats-skip-hosts"),
    "@/lib/daily-application-cap": await import("../src/lib/daily-application-cap"),
    "@/lib/paid-priority": { sortByPaidPriority: <T,>(items: readonly T[]) => [...items] },
    "@/lib/application-rollout": { automaticApplicationsBlocked: () => false, historicalRetriesBlocked: () => false },
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
      hasPaidOrTrialApplicationAccess: () => true, usesFreeWeeklyQuota: () => false,
    },
    "@/lib/role-match": { titleMatchesAnyRole: () => true },
    "@/lib/auto-apply-roles": await import("../src/lib/auto-apply-roles"),
    "@/lib/scrapers/posting-description": {
      DESCRIPTION_SOURCES: new Set(["workable", "smartrecruiters", "breezy"]),
      fillMissingDescriptions: async (jobs: unknown[], opts: { limit: number; deadline: number }) => {
        assert.ok(opts.limit > 0 && opts.limit <= 15 && opts.deadline <= Date.now() + 20_000, "Backfill is bounded per user and in time");
        backfillCalls.push(jobs.length); return [];
      },
    },
    "@/lib/role-query": { titleTokenWhere: (await import("../src/lib/role-query")).titleTokenWhere, roleTitleTokenGroups: (roles: string[]) => roles.map((r) => r.split(/\s+/).filter((t) => t.length >= 3)) },
    "@/lib/auto-apply-self-heal": { runSelfHeal: async () => { throw new Error("Unexpected self-heal"); } },
    "@/lib/auto-apply-liveness-gate": await import("../src/lib/auto-apply-liveness-gate"),
    "@/lib/job-liveness": { checkJobUrlLiveness: async () => ({ state: "live", reason: "test", checkedAt: new Date() }), markJobClosed: async () => { throw new Error("Unexpected close"); } },
    "@/lib/conversion-events": { recordConversionEvent: async () => {} },
    "@/lib/analytics": { AnalyticsEvent: { APPLICATION_CREATED: "application_created" } },
    "@/lib/board-apply-resolver": { resolveBoardListingsForRoles: async (roles: string[], opts: { limit: number; deadline: number }) => {
      assert.ok(Number.isFinite(opts.deadline) && opts.deadline > Date.now() && opts.deadline <= Date.now() + 15_000, "Single-user runs get a bounded lookup budget");
      resolverCalls.push({ roles: [...roles], limit: opts.limit });
      return { attempted: 0, promoted: 0, existing: 0, unsupported: 0 };
    } },
  });
  const stats = await api.runAutoApplyForUser(user.id);
  assert.ok(backfillCalls.length <= 1, "At most one bounded backfill per user");
  assert.deepEqual(resolverCalls, [{ roles: ["Product Designer"], limit: 6 }],
    "Board listings are resolved once per user run, bounded, for the user's own roles");
  const poolQuery = JSON.stringify(jobQueries[0]);
  assert.ok(poolQuery.includes('"workable"'), "Workable-source jobs with a supported apply URL are in the candidate pool");
  for (const board of ["adzuna", "weworkremotely", "arbeitnow", "jobicy", "himalayas", "remoteok"]) {
    assert.ok(!poolQuery.includes(`"${board}"`), `Board rows (${board}) are never direct candidates; only their resolved ATS posting is`);
  }
  assert.deepEqual(created.map((a) => a.jobId), ["valid-first", "wrong-location", "valid-second-same-company"],
    "Location is a soft ranking signal: Berlin is eligible; pass 1 takes unique companies first");
  assert.equal(queued.length, 3);
  assert.equal(stats.applicationsEnqueued, 3);
  assert.equal(stats.skippedLocationMismatch, 0);
  assert.equal(stats.skippedEmploymentMismatch, 1);
  assert.equal(stats.errors, 0);

  const mismatch = api.autoApplyPreferenceMismatch;
  assert.equal(mismatch(job("freelance", { contractType: "freelance" }), { ...preferences, employmentType: "piva" }, ["Milano"]), null);
  assert.equal(mismatch(job("employee"), { ...preferences, employmentType: "piva" }, ["Milano"]), "employment");
  assert.equal(mismatch(job("both", { contractType: "freelance" }), { ...preferences, employmentType: "both" }, ["Milano"]), null);
  assert.equal(mismatch(job("salary-min-only", { salaryMin: 40_000, salaryMax: null }), preferences, ["Milano"]), "salary");
  assert.equal(mismatch(job("salary-boundary", { salaryMax: 50_000 }), preferences, ["Milano"]), null);
  assert.equal(mismatch(job("salary-unknown", { salaryMin: null, salaryMax: null }), preferences, ["Milano"]), null);
  // Adzuna IT stores RAL in thousands ("28-32" = €28k-€32k). Same floor, right unit.
  const kUnits = { ...preferences, salaryMin: 25 };
  assert.equal(mismatch(job("adzuna-k-units", { salaryMin: 28, salaryMax: 32 }), kUnits, ["Milano"]), null, "€32k RAL stored as 32 meets a €25k floor");
  assert.equal(mismatch(job("adzuna-k-units-low", { salaryMin: 18, salaryMax: 22 }), kUnits, ["Milano"]), "salary", "€22k RAL stored as 22 still fails a €25k floor");
  assert.equal(mismatch(job("adzuna-k-boundary", { salaryMin: 25, salaryMax: null }), kUnits, ["Milano"]), null);
  assert.equal(mismatch(job("k-units-high-floor", { salaryMin: 100, salaryMax: 150 }), { ...preferences, salaryMin: 120 }, ["Milano"]), null);
  assert.equal(mismatch(job("k-units-below-high-floor", { salaryMin: 90, salaryMax: 110 }), { ...preferences, salaryMin: 120 }, ["Milano"]), "salary");
  // Ambiguous units are not relaxed: hourly (<10) and monthly (500-9,999) still fail a set floor.
  assert.equal(mismatch(job("hourly", { salaryMin: 8, salaryMax: 9 }), kUnits, ["Milano"]), "salary");
  assert.equal(mismatch(job("monthly", { salaryMin: 1600, salaryMax: 2100 }), kUnits, ["Milano"]), "salary");
  assert.equal(mismatch(job("annual-euros", { salaryMin: 28_000, salaryMax: 32_000 }), kUnits, ["Milano"]), null);
  assert.equal(mismatch(job("no-floor", { salaryMin: 8, salaryMax: 9 }), { ...preferences, salaryMin: 0 }, ["Milano"]), null);
  assert.equal(preferenceHelpers.annualSalaryEur(32), 32_000);
  assert.equal(preferenceHelpers.annualSalaryEur(499), 499_000);
  assert.equal(preferenceHelpers.annualSalaryEur(500), 500);
  assert.equal(preferenceHelpers.annualSalaryEur(9), 9);
  assert.equal(preferenceHelpers.annualSalaryEur(45_000), 45_000);
  assert.equal(preferenceHelpers.annualSalaryEur(null), 0);
  // Location is a soft signal: city mismatch does not reject at preference gate.
  assert.equal(mismatch(job("remote", { remote: true, location: "Berlin" }), preferences, ["Milano"]), null);
  assert.equal(mismatch(job("no-location-pref", { location: "Berlin" }), preferences, []), null);
  console.log("[auto-apply-quality] Both-pass enqueue regression and preference compatibility passed.");
}

async function testRecruiterEmail() {
  let html = "";
  let dnsAvailable = true;
  let dnsCalls = 0;
  let status = 200;
  let finalUrl = "https://careers.acme.com/job";
  let pages: Record<string, string> | null = null;
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
  }, { AbortSignal, fetch: async (url: string) => ({ ok: status === 200, status, url: pages ? url : finalUrl,
    headers: { get: () => "text/html" }, text: async () => pages?.[url] ?? html }) });
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
  // Description, JSON-LD, Italian invitation, careers page — never invent jobs@
  status = 503;
  const fromDescription = await api.findVerifiedRecruiterEmail(
    "https://www.adzuna.it/job/1", "Acme", null,
    { description: "Inviare il CV a careers@acme.com per questa posizione." },
  );
  assert.equal(fromDescription?.email, "careers@acme.com", "Job description unlocks aggregator URLs");
  assert.equal(fromDescription?.provenance.sourceType, "job_description");
  status = 200; finalUrl = "https://careers.acme.com/job";
  html = `<html><head><script type="application/ld+json">{"@type":"JobPosting","applicationContact":{"email":"jobs@acme.com"}}</script></head><body><h1>Acme Designer</h1></body></html>`;
  const jsonLd = await api.findVerifiedRecruiterEmail("https://careers.acme.com/job", "Acme");
  assert.equal(jsonLd?.email, "jobs@acme.com");
  assert.equal(jsonLd?.provenance.sourceType, "json_ld_application_contact");
  html = "<h1>Acme Designer</h1><p>Candidature a selection@acme.com — inviaci il profilo.</p>";
  assert.equal(await api.scrapeRecruiterEmail("https://careers.acme.com/job", "Acme"), "selection@acme.com");
  html = '<h1>Acme Designer</h1><p>Apply here.</p><a href="https://careers.acme.com/careers">Careers</a>';
  pages = {
    "https://careers.acme.com/job": html,
    "https://careers.acme.com/careers": "<h1>Acme careers</h1><p>Send your CV to talent@acme.com.</p>",
  };
  const careers = await api.findVerifiedRecruiterEmail("https://careers.acme.com/job", "Acme");
  assert.equal(careers?.email, "talent@acme.com");
  assert.equal(careers?.provenance.sourceType, "employer_careers_page");
  assert.equal(careers?.provenance.sourceUrl, "https://careers.acme.com/careers");
  pages = null;
  html = "<h1>Acme Designer</h1><p>We are hiring. No inbox listed.</p>";
  const invented = await api.findVerifiedRecruiterEmail("https://careers.acme.com/job", "Acme");
  assert.equal(invented, null, "Must never guess jobs@domain");
  const extracted = api.extractPublishedRecruiterEmailFromText("No address here, apply on the site.", "Acme", "https://careers.acme.com/job");
  assert.equal(extracted, null);
  assert.equal(
    api.extractPublishedRecruiterEmailFromText("Inviare il CV a jobs@randstad.com per questa posizione.", "Acme", "https://www.adzuna.it/details/1"),
    null,
    "Generic staffing inbox on an aggregator posting is not the employer",
  );
  assert.equal(
    api.extractPublishedRecruiterEmailFromText("Inviare il CV a careers@acme.com per questa posizione.", "Acme", "https://www.adzuna.it/details/1")?.email,
    "careers@acme.com",
  );
  assert.equal(
    api.extractPublishedRecruiterEmailFromText("Send your CV to jobs@acme.com.", "Widget Labs", "https://boards.greenhouse.io/acme/jobs/123")?.email,
    "jobs@acme.com",
    "ATS-listed company domain may authorize a generic inbox",
  );
  assert.equal(
    api.extractPublishedRecruiterEmailFromText("Send your CV to recruiting@randstad.com.", "Acme", "https://boards.greenhouse.io/acme/jobs/123"),
    null,
  );
  assert.equal(api.employerOwnDomain("https://careers.acme.com/job", "Acme")?.domain, "acme.com");
  assert.equal(api.employerOwnDomain("https://jobs.ashbyhq.com/acme/uuid", "Acme"), null, "ATS tenant slug is not a company domain");
  assert.equal(api.employerOwnDomain("https://jobs.ashbyhq.com/acme/uuid", "Acme", "https://www.acme.com")?.domain, "acme.com");
  assert.equal(
    api.companyWebsiteFromPage('<a href="https://www.acme.com/about">Acme</a>', "https://jobs.ashbyhq.com/acme/uuid", "Acme"),
    "https://www.acme.com/",
  );
  const viaDiscover = await api.findVerifiedRecruiterEmail(
    "https://jobs.ashbyhq.com/acme/uuid", "Acme", null,
    {
      discoverEmployerInbox: async () => ({ email: "careers@acme.com", sourceUrl: "https://acme.com/careers", evidence: "Send your CV to careers@acme.com" }),
    },
  );
  assert.equal(viaDiscover?.email, "careers@acme.com");
  assert.equal(viaDiscover?.provenance.sourceType, "employer_domain_page");
  const inventedDiscover = await api.findVerifiedRecruiterEmail(
    "https://jobs.ashbyhq.com/acme/uuid", "Acme", null,
    { discoverEmployerInbox: async () => ({ email: "jobs@acme.com", sourceUrl: "https://acme.com/careers", evidence: "guessed" }) },
  );
  // discover is allowed only when MX/usable + employer domain; our mock DNS has MX.
  assert.equal(inventedDiscover?.email, "jobs@acme.com");
  console.log(`[auto-apply-quality] ${accepted.length + rejected.length} registrable-domain, suffix, private-tenant, ATS, URL and IDN regressions passed.`);
  console.log("[auto-apply-quality] Fresh page provenance, cache/AI rejection, blocklist, DNS, description/JSON-LD/careers checks passed.");
}

async function main() {
  if (!process.argv.includes("--email-only")) await testCronBothPasses();
  if (!process.argv.includes("--cron-only")) await testRecruiterEmail();
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
