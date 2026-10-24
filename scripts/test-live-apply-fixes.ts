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
      assert.ok(id in dependencies, `Unexpected dependency: ${id}`);
      return dependencies[id];
    },
    console: { log() {}, warn() {}, error() {} }, Date, Map, Set, Uint8Array, URL,
    crypto: { getRandomValues: (bytes: Uint8Array) => bytes.fill(1) },
    ...globals,
  }, { filename: path });
  return module.exports;
}

async function testAshbyHandoffsDoNotConsumeDailySlots() {
  const created: Array<Record<string, any>> = [];
  const queued: string[] = [];
  const job = (id: string, overrides: Record<string, unknown> = {}) => ({
    id, title: "Product Designer", company: id, location: "Milano",
    remote: false, contractType: "full time", description: "Permanent product design role.",
    salaryMin: 60_000, salaryMax: 70_000, postedAt: new Date("2026-01-01T00:00:00.000Z"),
    url: `https://boards.greenhouse.io/acme/jobs/${id}`, category: "design", ...overrides,
  });
  const jobs = [
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
    preferences, cvProfile: {},
  };
  const skip = await import("../src/lib/ats-skip-hosts");
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
  const preferenceHelpers = loadModule("src/lib/auto-apply-preferences.ts", {
    "@/lib/city-centroids": await import("../src/lib/city-centroids"),
    "@/lib/scrapers/ats-companies": await import("../src/lib/scrapers/ats-companies"),
  });
  const api = loadModule("src/lib/auto-apply-cron.ts", {
    "@/lib/ats-skip-hosts": { ...skip, compareJobsForAutoApply: () => 0 },
    "@/lib/daily-application-cap": await import("../src/lib/daily-application-cap"),
    "@/lib/paid-priority": { sortByPaidPriority: <T,>(items: readonly T[]) => [...items] },
    "@/lib/application-rollout": { automaticApplicationsBlocked: () => false, historicalRetriesBlocked: () => false },
    "@/lib/application-pause": { applicationsPaused: () => false },
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
      isApplicationAccessPaused: () => false, requiresPaymentMethodBeforeApp: () => false,
      hasPaidOrTrialApplicationAccess: () => true, usesFreeWeeklyQuota: () => false,
    },
    "@/lib/role-match": { titleMatchesAnyRole: () => true },
    "@/lib/auto-apply-roles": await import("../src/lib/auto-apply-roles"),
    "@/lib/scrapers/posting-description": {
      DESCRIPTION_SOURCES: new Set(),
      fillMissingDescriptions: async () => [],
    },
    "@/lib/role-query": {
      titleTokenWhere: (await import("../src/lib/role-query")).titleTokenWhere,
      roleTitleTokenGroups: (roles: string[]) => roles.map((r) => r.split(/\s+/).filter((t) => t.length >= 3)),
    },
    "@/lib/auto-apply-self-heal": { runSelfHeal: async () => { throw new Error("Unexpected self-heal"); } },
    "@/lib/auto-apply-liveness-gate": await import("../src/lib/auto-apply-liveness-gate"),
    "@/lib/job-liveness": { checkJobUrlLiveness: async () => ({ state: "live", reason: "test", checkedAt: new Date() }), markJobClosed: async () => {} },
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
  const ashby = created.filter((a) => String(a.jobId).startsWith("ashby-"));
  const sendable = created.filter((a) => a.status === "queued");
  assert.equal(ashby.length, 2, "Ashby skip-list rows are created");
  assert.ok(ashby.every((a) => a.status === "queued" && !a.errorMessage), "Skip-list rows queue for recruiter-email first");
  assert.equal(sendable.length, 5, "Daily cap still limits creations to 5");
  assert.equal(queued.length, 5);
  assert.equal(stats.applicationsEnqueued, 5);
  assert.equal(stats.skippedManualAts, 0);
  assert.deepEqual(sendable.map((a) => a.jobId), ["ashby-1", "ashby-2", "gh-1", "gh-2", "gh-3"]);
  console.log("live-apply-fixes: skip-list rows queue for recruiter-email and consume a daily slot like other queued work");
}

testAshbyHandoffsDoNotConsumeDailySlots().catch((err) => { console.error(err); process.exitCode = 1; });
