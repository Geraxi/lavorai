import * as cataloguePolicy from "../src/lib/job-catalogue-policy";
import * as providerPolicy from "../src/lib/application-provider-policy";
/**
 * Live-test regressions after #91/#92: same-run handoffs must not consume
 * daily / 30d / monthly slots. No network, no real applications.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
function loadModule(path: string, dependencies: Record<string, unknown>, globals: Record<string, unknown> = {}) {
  const output = ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} as Record<string, any> };
  vm.runInNewContext(output, {
    module, exports: module.exports,
    require: (id: string) => {
      if (id.endsWith("/application-provider-policy") || id === "./application-provider-policy") return providerPolicy;
      if (id.endsWith("/job-catalogue-policy")) return cataloguePolicy;
      assert.ok(id in dependencies, `Unexpected dependency: ${id}`);
      return dependencies[id];
    },
    console: { log() {}, warn() {}, error() {} }, Date, Map, Set, Uint8Array, URL,
    crypto: { getRandomValues: (bytes: Uint8Array) => bytes.fill(1) },
    ...globals,
  }, { filename: path });
  return module.exports;
}

type Scenario = { jobs?: Array<Record<string, any>>; user?: Record<string, unknown>; heldPrivacyRows?: number; liveness?: (url: string) => Promise<{ state: string; reason: string; checkedAt: Date }> };
async function runCron(opts: Scenario = {}) {
  const created: Array<Record<string, any>> = [];
  const queued: string[] = [];
  const job = (id: string, overrides: Record<string, unknown> = {}) => ({
    id, title: "Product Designer", company: id, location: "Milano",
    remote: false, contractType: "full time", description: "Permanent product design role.",
    salaryMin: 60_000, salaryMax: 70_000, postedAt: new Date("2026-01-01T00:00:00.000Z"),
    url: `https://boards.greenhouse.io/acme/jobs/${id}`, category: "design", ...overrides,
  });
  const jobs = opts.jobs?.map((j) => job(String(j.id), j)) ?? [
    job("ashby-1", { company: "AshbyOne", url: "https://jobs.ashbyhq.com/ashbyone/uuid-1" }),
    job("ashby-2", { company: "AshbyTwo", url: "https://jobs.ashbyhq.com/ashbytwo/uuid-2" }),
    job("gh-1", { company: "GreenOne" }),
    job("gh-2", { company: "GreenTwo" }),
    job("gh-3", { company: "GreenThree" }),
    job("gh-4", { company: "GreenFour" }),
    job("gh-5", { company: "GreenFive" }),
  ];
  const preferences = {
    autoApplyMode: "auto", matchMin: 50, dailyCap: 5, rolesJson: '["Product Designer"]',
    locationsJson: '["Milano"]', salaryMin: 50, employmentType: "employee",
  };
  const user = {
    id: "owner", email: "owner@example.test", tier: "pro_plus", trialEndsAt: null,
    trialGraceEndsAt: null, createdAt: new Date(), avoidCompanies: null,
    preferences, cvProfile: {}, privacyConsentAt: new Date("2026-11-01T00:00:00Z"), ...opts.user,
  };
  const livenessChecked: string[] = [];
  const skip = await import("../src/lib/ats-skip-hosts");
  const prisma = {
    user: { findUnique: async () => user },
    applicationSession: { findMany: async () => [] },
    job: { findMany: async () => jobs, update: async () => ({}) },
    application: {
      count: async (query?: { where?: Record<string, unknown> }) =>
        query?.where?.sendFailureReason === "privacy_consent_missing" ? (opts.heldPrivacyRows ?? 0) : 0,
      groupBy: async () => [], findMany: async () => [],
      findFirst: async (query: { where: { jobId: string } }) => created.find((a) => a.jobId === query.where.jobId) ?? null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const app = { id: `app-${created.length}`, ...data };
        created.push(app); return app;
      },
    },
  };
  const preferenceHelpers = loadModule("src/lib/auto-apply-preferences.ts", {
    "@/lib/city-centroids": await import("../src/lib/city-centroids"),
    "@/lib/scrapers/ats-companies": await import("../src/lib/scrapers/ats-companies"),
  });
  const api = loadModule("src/lib/auto-apply-cron.ts", {
    "@/lib/ats-skip-hosts": { ...skip, compareJobsForAutoApply: () => 0 },
    "@/lib/skip-list-email-lookup": { lookupPublishedSkipListInbox: async () => null },
    "@/lib/recruiter-email-fallback": { skipListEmailSendDecision: () => ({ ok: false, reason: "recruiter_email_fallback_disabled" }) },
    "@/lib/daily-application-cap": await import("../src/lib/daily-application-cap"),
    "@/lib/paid-priority": { sortByPaidPriority: <T,>(items: readonly T[]) => [...items] },
    "@/lib/application-rollout": { automaticApplicationsBlocked: () => false, historicalRetriesBlocked: () => false },
    "@/lib/application-pause": { applicationsPaused: () => false },
    "@/lib/deployed-version": { deployedAppVersion: () => "test-sha" },
    "@/lib/auto-apply-preferences": preferenceHelpers,
    "@/lib/db": { prisma },
    "@/lib/admin-user-actions": { monthlyQuotaSince: () => new Date(0) },
    "@/lib/cv-profile-types": { rowToProfile: () => ({ experiences: [], skills: [], title: "Product Designer", summary: "" }) },
    "@/lib/match-score": { quickMatchScore: () => 90 },
    "@/lib/application-queue": { enqueueApplication: async (id: string) => queued.push(id) },
    "@/lib/apply-session": { resolveSession: async () => ({ id: "session-test", status: "active" }) },
    "@/lib/billing": {
      dailyApplicationLimit: () => 5, effectiveTier: () => "pro_plus",
      getLimits: () => ({ monthlyApplications: Infinity }),
      isApplicationAccessPaused: () => false, requiresPaymentMethodBeforeApp: () => false, usesFreeWeeklyQuota: () => false, freeWeeklyApplyQuota: () => 5,
      hasPaidOrTrialApplicationAccess: () => true, usesFreeWeeklyQuota: () => false,
    },
    "@/lib/role-match": { titleMatchesAnyRole: () => true },
    "@/lib/auto-apply-roles": await import("../src/lib/auto-apply-roles"),
    "@/lib/scrapers/posting-description": {
      DESCRIPTION_SOURCES: new Set(),
      needsFullDescription: () => false,
      fillMissingDescriptions: async () => [],
    },
    "@/lib/role-query": {
      titleTokenWhere: (await import("../src/lib/role-query")).titleTokenWhere,
      roleTitleTokenGroups: (roles: string[]) => roles.map((r) => r.split(/\s+/).filter((t) => t.length >= 3)),
    },
    "@/lib/auto-apply-self-heal": { runSelfHeal: async () => { throw new Error("Unexpected self-heal"); } },
    "@/lib/auto-apply-liveness-gate": await import("../src/lib/auto-apply-liveness-gate"),
    "@/lib/job-liveness": {
      checkJobUrlLiveness: async (url: string) => { livenessChecked.push(url); return opts.liveness ? opts.liveness(url) : { state: "live", reason: "test", checkedAt: new Date() }; },
      markJobClosed: async () => {},
    },
    "@/lib/conversion-events": { recordConversionEvent: async () => {} },
    "@/lib/analytics": { AnalyticsEvent: { APPLICATION_CREATED: "application_created" } },
    "@/lib/board-apply-resolver": { resolveBoardListingsForRoles: async () => ({ attempted: 0, promoted: 0, existing: 0, unsupported: 0 }) },
    "@/lib/proven-channels": { usesProvenChannelFilter: () => false },
    "@/lib/proven-channel-eligibility": {
      GREENHOUSE_FORM_FETCH_BUDGET: 12,
      buildProvenChannelFactContext: () => ({}),
      evaluateProvenChannelEligibility: async () => { throw new Error("non-pilot must not evaluate proven channels"); },
    },
  });
  const stats = await api.runAutoApplyForUser(user.id);
  return { created, queued, stats, livenessChecked, skip };
}

async function testAshbyHandoffsDoNotConsumeDailySlots() {
  const { created, queued, stats, skip } = await runCron();
  const ashby = created.filter((a) => String(a.jobId).startsWith("ashby-"));
  const sendable = created.filter((a) => a.status === "queued");
  assert.equal(ashby.length, 2, "Ashby skip-list rows are created as handoffs when no inbox exists");
  assert.ok(
    ashby.every((a) => a.status === "ready_to_apply" && a.errorMessage === skip.SKIPPED_ATS_MANUAL_MESSAGE),
    "Skip-list miss hands off without enqueue",
  );
  assert.equal(sendable.length, 5, "Daily cap is filled by sendable jobs, not skip-list misses");
  assert.equal(queued.length, 5);
  assert.equal(stats.applicationsEnqueued, 5);
  assert.equal(stats.skippedManualAts, 2);
  assert.deepEqual(sendable.map((a) => a.jobId), ["gh-1", "gh-2", "gh-3", "gh-4", "gh-5"]);
  console.log("live-apply-fixes: skip-list miss hands off without consuming a daily slot");
}

/** 17 Nov 2026: one user got 18 Ashby suggestions in a single run; each cost a
 * shared liveness check and an inbox lookup inside the 300 s cron. */
async function testHandoffsCappedAndOnTheirOwnLivenessBudget() {
  const ashby = Array.from({ length: 12 }, (_, i) => ({ id: `ashby-${i}`, company: `Ashby${i}`, url: `https://jobs.ashbyhq.com/a${i}/uuid-${i}` }));
  const gh = Array.from({ length: 5 }, (_, i) => ({ id: `gh-${i}`, company: `Green${i}` }));
  const { created, stats, livenessChecked } = await runCron({ jobs: [...ashby, ...gh] });
  const handoffs = created.filter((a) => String(a.jobId).startsWith("ashby-"));
  assert.equal(handoffs.length, 5, "at most MAX_HANDOFFS_PER_USER_RUN suggestions per user per run");
  assert.ok(handoffs.every((a) => a.status === "ready_to_apply"), "Ashby stays a manual suggestion (skip-list unchanged)");
  assert.equal(created.filter((a) => a.status === "queued").length, 5, "sendable slots unaffected");
  assert.equal(stats.skippedHandoffCap, 7);
  assert.equal(stats.blockedByReason.manual_ats_run_cap, 7);
  assert.equal(livenessChecked.filter((u) => u.includes("ashbyhq")).length, 5, "no liveness checks for suggestions beyond the cap");
  console.log("live-apply-fixes: skip-list suggestions capped per run; sendable slots unchanged");
}

async function testHandoffChecksDoNotStarveSendableJobs() {
  // Shared sendable budget of 3 checks; 4 suggestions come first in the ranking.
  // Before: they used up the budget and the closed Greenhouse posting went
  // unchecked into a send slot. Now suggestions use their own budget.
  const previous = process.env.AUTO_APPLY_LIVENESS_MAX_CHECKS;
  process.env.AUTO_APPLY_LIVENESS_MAX_CHECKS = "3";
  const ashby = Array.from({ length: 4 }, (_, i) => ({ id: `ashby-${i}`, company: `Ashby${i}`, url: `https://jobs.ashbyhq.com/a${i}/uuid-${i}` }));
  const { created, stats } = await runCron({
    jobs: [...ashby, { id: "gh-closed", company: "Closed" }, { id: "gh-open", company: "Open" }],
    liveness: async (url) => ({ state: url.includes("gh-closed") ? "closed" : "live", reason: "test", checkedAt: new Date() }),
  }).finally(() => { if (previous === undefined) delete process.env.AUTO_APPLY_LIVENESS_MAX_CHECKS; else process.env.AUTO_APPLY_LIVENESS_MAX_CHECKS = previous; });
  assert.ok(stats.skippedJobClosed >= 1);
  assert.equal(created.filter((a) => String(a.jobId).startsWith("ashby-")).length, 4, "suggestions still checked and created");
  assert.ok(!created.some((a) => a.jobId === "gh-closed"), "closed posting never created");
  assert.ok(created.some((a) => a.jobId === "gh-open" && a.status === "queued"));
  console.log("live-apply-fixes: suggestions use a separate liveness budget");
}

async function testPrivacyConsentPrecheck() {
  // No consent, nothing held yet: exactly one row (held by the worker until the user decides).
  let run = await runCron({ user: { privacyConsentAt: null } });
  assert.equal(run.created.filter((a) => a.status === "queued").length, 1, "one held row keeps a job waiting and the prompt visible");
  assert.equal(run.stats.skippedPrivacyConsent, 0);
  // Already holding a privacy row: nothing new is created, no liveness/board work is spent.
  run = await runCron({ user: { privacyConsentAt: null }, heldPrivacyRows: 3 });
  assert.equal(run.created.length, 0);
  assert.equal(run.livenessChecked.length, 0);
  assert.equal(run.stats.skippedPrivacyConsent, 1);
  assert.equal(run.stats.blockedByReason.privacy_consent_pending_user, 1);
  // Consent given: unchanged behaviour.
  run = await runCron({ heldPrivacyRows: 3 });
  assert.equal(run.created.filter((a) => a.status === "queued").length, 5);
  // Hybrid users create awaiting_consent rows the user approves; not affected.
  console.log("live-apply-fixes: non-consented auto users never accumulate held rows; consent is never assumed");
}

(async () => {
  await testAshbyHandoffsDoNotConsumeDailySlots();
  await testHandoffsCappedAndOnTheirOwnLivenessBudget();
  await testHandoffChecksDoNotStarveSendableJobs();
  await testPrivacyConsentPrecheck();
})().catch((err) => { console.error(err); process.exitCode = 1; });
