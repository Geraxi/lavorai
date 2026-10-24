import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { z } from "zod";
import * as continuation from "../src/lib/application-answer-continuation";
import * as rollout from "../src/lib/application-rollout";
import * as prerequisites from "../src/lib/application-prerequisites";

// Execute actual production sources with hermetic DB/queue/provider boundaries.
// No environment files, network, real account rows or credentials are loaded.
let forbiddenAccesses = 0;
const noAccess = new Proxy({}, { get() { forbiddenAccesses++; throw new Error("Unexpected external dependency access"); } });
const json = (body: unknown, options?: { status?: number }) => ({ body, status: options?.status ?? 200 });
import * as liveness from "../src/lib/auto-apply-liveness-gate";
import * as paidPriority from "../src/lib/paid-priority";
import * as applicationLease from "../src/lib/application-lease";
function load(path: string, extra: Record<string, any> = {}) {
  const dependencies: Record<string, any> = {
    "@/lib/application-rollout": rollout,
    "@/lib/application-prerequisites": prerequisites,
    "./application-answer-continuation": continuation,
    "@/lib/application-answer-continuation": continuation,
    "@/lib/application-pause": { applicationsPaused: () => false },
    "@/lib/db": { prisma: noAccess },
    "@/lib/session": { getCurrentUser: async () => ({ id: "owner", emailVerified: new Date(), privacyConsentAt: new Date() }) },
    "@/lib/admin": { isAdmin: () => true },
    "@/lib/application-worker": { processApplication: async () => { throw new Error("Unexpected worker execution"); } },
    "@/lib/application-queue": { enqueueApplication: async () => { throw new Error("Unexpected queue publication"); } },
    "next/server": { NextResponse: { json, redirect: (location: string) => ({ status: 307, location }) } },
    "@/lib/auto-apply-liveness-gate": liveness,
    "@/lib/paid-priority": paidPriority,
    "@/lib/ats-skip-hosts": extra["@/lib/ats-skip-hosts"] ?? { requiresManualAtsHandoff: () => false, compareJobsForAutoApply: () => 0, SKIPPED_ATS_MANUAL_MESSAGE: "skip" },
    "@/lib/daily-application-cap": extra["@/lib/daily-application-cap"] ?? {
      countDailyCapUsage: async () => 0,
      remainingDailyCap: (used: number, limit: number) => Math.max(0, limit - used),
      countsTowardQuota: () => false,
      monthlyQuotaUsageWhere: () => ({}),
      companyCapUsageWhere: () => ({}),
      quotaConsumingFilter: () => ({}),
    },
    "@/lib/drain-limits": extra["@/lib/drain-limits"] ?? {
      maxDrainAttempts: () => 3, drainQueueBatch: () => 5, drainProcessConcurrency: () => 2,
      DRAIN_TIME_RESERVE_MS: 60_000, drainPerRowBudgetMs: () => 90_000, canClaimAnotherDrainRow: () => true,
    },
    "@/lib/queue-sendability": extra["@/lib/queue-sendability"] ?? { claimUserSelect: {}, isQueuedRowSendable: () => true, loadQuotaUsageMaps: async () => ({ weekly: new Map(), daily: new Map() }), usageFor: () => ({ weekly: 0, daily: 0 }), HELD_MESSAGE_PREFIX: "Invio in attesa:", MAX_ATTEMPTS_MESSAGE_PREFIX: "Invio interrotto dopo" },
    "@/lib/application-claim": extra["@/lib/application-claim"] ?? {
      recoverStuckApplications: async () => 0,
      findClaimableQueued: async () => [],
      claimApplication: async () => false,
      resetClaim: async () => {},
    },
    "@/lib/queue-drain": extra["@/lib/queue-drain"] ?? {},
    "@/lib/job-liveness": { checkJobUrlLiveness: async () => ({ state: "unknown", reason: "test_no_network" }), markJobClosed: async () => {}, JOB_CLOSED_HELD_MESSAGE: "closed", JOB_LIVENESS_UNKNOWN_HELD_MESSAGE: "Disponibilità dell'annuncio non verificabile: invio sospeso, nuovo controllo più tardi." },
    "@/lib/deployed-version": { deployedAppVersion: () => "test-sha" },
    "@/lib/application-lease": extra["@/lib/application-lease"] ?? applicationLease,
    "@/lib/application-worker-gates": extra["@/lib/application-worker-gates"] ?? {
      hasPotentialSubmission: (row: any) => !!(row.submitStartedAt || row.submittedAt || row.submittedVia || row.viewedAt || row.lastReplyAt || row.replyCount || row.userStatus
        || row.canaryLog || row.answersUsedJson
        || (row.submitConfirmation && !["NOT_SUBMITTED", "DRY_RUN", "JOB_CLOSED"].includes(row.submitConfirmation))),
    },
    zod: { z }, ...extra,
  };
  const module = { exports: {} as Record<string, any> };
  const code = ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(code, {
    module, exports: module.exports, Date, Map, Set, Uint8Array, URL, Headers,
    process: { env: process.env }, crypto: { getRandomValues: (bytes: Uint8Array) => bytes.fill(1) },
    console: { log() {}, warn() {}, error() {} },
    require: (name: string) => dependencies[name] ?? {},
    fetch: () => { throw new Error("Network forbidden"); },
  }, { filename: path });
  return module.exports;
}
const start = new Date(Date.now() - 3_600_000);
const freshAt = new Date(+start + 60_000);
function enable() {
  process.env.APPLICATION_SENDING_MODE = "manual_only";
  process.env.APPLICATION_ROLLOUT_START_AT = start.toISOString();
  process.env.APPLY_GLOBAL_DAILY_CAP = "10";
}
function row(id: string, overrides: Record<string, any> = {}) {
  return { id, userId: "owner", status: "queued", createdAt: freshAt, consentGrantedAt: freshAt,
    answerContinuationJson: null, retryCount: 0, startedAt: null, leaseToken: null, leaseExpiresAt: null,
    submitStartedAt: null, completedAt: null, submittedAt: null, submittedVia: null,
    submitConfirmation: null, canaryLog: null, answersUsedJson: null, viewedAt: null,
    lastReplyAt: null, replyCount: 0, userStatus: null, job: { id: `job-${id}`, url: `https://jobs.example.invalid/${id}` }, ...overrides };
}
function match(value: any, condition: any): boolean {
  if (condition === null || typeof condition !== "object" || condition instanceof Date) {
    return value instanceof Date && condition instanceof Date ? +value === +condition : value === condition;
  }
  return Object.entries(condition).every(([key, expected]: [string, any]) => {
    if (key === "gt") return value !== null && +value > +expected;
    if (key === "gte") return value !== null && +value >= +expected;
    if (key === "lte") return value !== null && +value <= +expected;
    if (key === "lt") return value !== null && +value < +expected;
    if (key === "in") return expected.includes(value);
    if (key === "notIn") return !expected.includes(value);
    if (key === "not") return !match(value, expected);
    if (key === "OR") return expected.some((condition: any) => match(value, condition));
    return match(value?.[key], expected);
  });
}
function database(initial: ReturnType<typeof row>[]) {
  const rows = structuredClone(initial);
  let reads = 0, writes = 0;
  const application = {
    findUnique: async ({ where }: any) => { reads++; return structuredClone(rows.find(r => match(r, where)) ?? null); },
    findMany: async ({ where, take }: any) => { reads++; return structuredClone(rows.filter(r => match(r, where)).slice(0, take)); },
    updateMany: async ({ where, data }: any) => {
      const matches = rows.filter(r => match(r, where));
      for (const r of matches) { Object.assign(r, data); writes++; }
      return { count: matches.length };
    },
  };
  return { rows, prisma: { application }, counts: () => ({ reads, writes }) };
}
async function testBlockedEntrypoints() {
  // Closed (invalid mode) and the manual_only kill switch both block automatic
  // producers. Retry/reset/replay paths are blocked in every mode, including
  // the default automatic one.
  for (const mode of ["invalid-mode", "auto", "manual_only", undefined]) {
    enable();
    if (mode === undefined) delete process.env.APPLICATION_SENDING_MODE;
    else process.env.APPLICATION_SENDING_MODE = mode;
    if (mode !== undefined) {
    const cron = load("src/lib/auto-apply-cron.ts");
    assert.equal((await cron.runAutoApplyCron()).applicationsEnqueued, 0);
    assert.equal((await cron.runAutoApplyForUser("owner")).applicationsAwaitingConsent, 0);
    assert.equal((await load("src/lib/auto-apply-self-heal.ts").runSelfHeal()).stuckAppsRequeued, 0);
    assert.equal(await load("src/lib/trial-quota.ts").reserveTrialApplication("owner", "old"), false);
    assert.equal((await load("src/lib/cron-self-heal.ts").runCronSelfHeal()).appsRecoveredSafely, 0);
    }
    const claim = load("src/lib/application-claim.ts", {
      "@/lib/db": { prisma: { application: { findMany: async () => [], updateMany: async () => ({ count: 0 }) } } },
    });
    assert.equal(await claim.recoverStuckApplications(), 0);
    await claim.resetClaim("old");
    const request = { headers: new Headers({ authorization: "Bearer fixture-cron" }), json: async () => ({}) };
    for (const path of ["retry-captcha", "requeue-stuck", "reset-bogus-sends", "unstick-applying", "test-apply", "repair-applications", "backfill-sessions", "purge-legacy-sessions"]) {
      const response = await load(`src/app/api/admin/${path}/route.ts`).POST(request);
      assert.equal(response.status, 503, `${path} must block before DB or provider access`);
    }
    const questions = load("src/app/api/questions/route.ts");
    assert.equal((await questions.POST({ json: async () => ({ answers: [{}] }) })).status, 400);
    const credit = load("src/lib/credit-failure-retry.ts");
    await assert.rejects(credit.retryCreditFailures({ dryRun: false }, noAccess), /historical_application_retries_blocked/);
    const creditRoute = load("src/app/api/admin/retry-credit-failures/route.ts", {
      "@/lib/credit-failure-retry": { creditRetryRequest: { safeParse: () => ({ success: true, data: { dryRun: false } }) } },
    });
    assert.equal((await creditRoute.POST(request)).body.error, "historical_application_retries_blocked");
    assert.equal(forbiddenAccesses, 0, "Blocked helpers must return before any caught or uncaught service access");
  }
  process.env.APPLICATION_SENDING_MODE = "invalid-mode";
  const claims = load("src/lib/application-claim.ts");
  assert.equal(await claims.claimApplication("old"), false);
  assert.deepEqual(Array.from(await claims.findClaimableQueued(5)), []);
  await load("src/lib/application-queue.ts").enqueueApplication("old");
  for (const name of ["apply", "apply-batch", "consent"]) {
    assert.equal((await load(`src/app/api/applications/${name}/route.ts`).POST({})).status, 503);
  }
}
async function testClaimsAndQueue() {
  enable();
  const old = new Date(+start - 1);
  const fixtures = [row("fresh"), row("historical", { createdAt: old }), row("boundary", { createdAt: start }),
    row("unconfirmed", { consentGrantedAt: null }), row("old-consent", { consentGrantedAt: old }),
    row("retry", { retryCount: 3 }), row("claimed", { startedAt: old }), row("complete", { completedAt: freshAt }),
    row("attempted", { submitConfirmation: "NOT_SUBMITTED" }), row("evidence", { canaryLog: "{}" }),
    row("future", { createdAt: new Date(Date.now() + 60_000) })];
  const db = database(fixtures);
  const claims = load("src/lib/application-claim.ts", { "@/lib/db": { prisma: db.prisma } });
  assert.deepEqual(Array.from(await claims.findClaimableQueued(100)), ["fresh"]);
  assert.equal(db.counts().writes, 0, "Polling must never silently recover rows");
  for (const fixture of fixtures.slice(1)) assert.equal(await claims.claimApplication(fixture.id), false, fixture.id);
  const results = await Promise.all([claims.claimApplication("fresh"), claims.claimApplication("fresh")]);
  assert.equal(results.filter(Boolean).length, 1, "Fresh claim is atomic");
  assert.equal(db.counts().writes, 1);
  const snapshot = structuredClone(db.rows);
  await claims.resetClaim("fresh");
  assert.equal(await claims.recoverStuckApplications(), 1, "Expired queued lease on a post-cutoff row is released");
  assert.equal(db.rows.find((r: any) => r.id === "claimed")!.startedAt, null);
  assert.equal(db.rows.find((r: any) => r.id === "claimed")!.retryCount, 1);
  assert.equal(db.rows.find((r: any) => r.id === "historical")!.startedAt, snapshot.find((r: any) => r.id === "historical")!.startedAt, "Historical rows are not reset");
  assert.equal(db.rows.find((r: any) => r.id === "fresh")!.status, "queued");

  const queueDb = database(fixtures);
  const queued: string[] = [];
  process.env.QUEUE_MODE = "bullmq"; process.env.REDIS_URL = "redis://synthetic.invalid";
  const queue = load("src/lib/application-queue.ts", {
    "@/lib/db": { prisma: queueDb.prisma },
    "@/lib/application-claim": claims,
    "@/lib/bullmq-queue": { getApplicationsQueue: () => ({ add: async (_name: string, data: any) => queued.push(data.applicationId) }) },
  });
  for (const fixture of fixtures) await queue.enqueueApplication(fixture.id);
  assert.deepEqual(queued, ["fresh"]);
  assert.equal(queueDb.counts().writes, 0, "Queue notification never resets ownership or history");
}
async function testAutomaticClaimsAndQueue() {
  // Default sending mode (no APPLICATION_SENDING_MODE): rows created by the
  // automatic producer for auto-mode users carry no per-application consent
  // and are claimable; historical rows, stale consents, retries, claimed or
  // evidenced rows are not. The worker gate re-checks the user's saved mode.
  enable(); delete process.env.APPLICATION_SENDING_MODE;
  const old = new Date(+start - 1);
  const fixtures = [row("fresh"), row("auto", { consentGrantedAt: null }), row("historical", { createdAt: old, consentGrantedAt: null }),
    row("old-consent", { consentGrantedAt: old }), row("retry", { retryCount: 3, consentGrantedAt: null }),
    row("claimed", { startedAt: old, consentGrantedAt: null }), row("attempted", { submitConfirmation: "NOT_SUBMITTED", consentGrantedAt: null }),
    row("evidence", { canaryLog: "{}", consentGrantedAt: null })];
  const db = database(fixtures);
  const claims = load("src/lib/application-claim.ts", { "@/lib/db": { prisma: db.prisma } });
  assert.deepEqual(Array.from(await claims.findClaimableQueued(100)).sort(), ["auto", "fresh"]);
  for (const fixture of fixtures.slice(2)) assert.equal(await claims.claimApplication(fixture.id), false, fixture.id);
  const results = await Promise.all([claims.claimApplication("auto"), claims.claimApplication("auto")]);
  assert.equal(results.filter(Boolean).length, 1, "Automatic claim is atomic");
  assert.equal(await claims.recoverStuckApplications(), 1, "Expired queued lease is released; in-flight historical replay stays blocked");
  assert.equal(db.rows.find((r: any) => r.id === "claimed")!.startedAt, null);
  const queueDb = database(fixtures);
  const queued: string[] = [];
  process.env.QUEUE_MODE = "bullmq"; process.env.REDIS_URL = "redis://synthetic.invalid";
  const queue = load("src/lib/application-queue.ts", {
    "@/lib/db": { prisma: queueDb.prisma }, "@/lib/application-claim": claims,
    "@/lib/bullmq-queue": { getApplicationsQueue: () => ({ add: async (_name: string, data: any) => queued.push(data.applicationId) }) },
  });
  for (const fixture of fixtures) await queue.enqueueApplication(fixture.id);
  assert.deepEqual(queued.sort(), ["auto", "fresh"]);
  assert.equal(queueDb.counts().writes, 0);
  assert.equal(rollout.automaticApplicationsBlocked(), false);
  process.env.APPLICATIONS_PAUSED = "true";
  assert.equal(rollout.automaticApplicationsBlocked(), false, "pause is enforced by applicationsPaused() at every producer/claim");
  delete process.env.APPLICATIONS_PAUSED;
}
async function testConsentCohort() {
  enable();
  const fixtures = [row("fresh", { status: "awaiting_consent", consentGrantedAt: null }),
    row("historical", { status: "awaiting_consent", createdAt: new Date(+start - 1), consentGrantedAt: null }),
    row("boundary", { status: "awaiting_consent", createdAt: start, consentGrantedAt: null }),
    row("retry", { status: "awaiting_consent", retryCount: 3, consentGrantedAt: null }),
    row("foreign", { status: "awaiting_consent", userId: "other", consentGrantedAt: null }),
    row("attempted", { status: "awaiting_consent", submitConfirmation: "NOT_SUBMITTED", consentGrantedAt: null })];
  const db = database(fixtures), queued: string[] = [];
  const route = load("src/app/api/applications/consent/route.ts", {
    "@/lib/db": { prisma: db.prisma },
    "@/lib/application-queue": { enqueueApplication: async (id: string, options: any) => { assert.equal(options.preserveClaim, true); queued.push(id); } },
  });
  const response = await route.POST({ json: async () => ({}) });
  assert.equal(response.status, 200); assert.equal(response.body.enqueued, 1);
  assert.deepEqual(queued, ["fresh"]);
  assert.deepEqual(db.rows.slice(1), fixtures.slice(1));
  assert.equal(db.rows[0].status, "queued"); assert.ok(db.rows[0].consentGrantedAt! > start);
  assert.equal(db.counts().writes, 1);
  assert.equal((await route.POST({ json: async () => ({ ids: ["historical", "boundary"] }) })).body.enqueued, 0);
  assert.equal(db.counts().writes, 1);
}
async function testConsentSkipsClosedPosting() {
  enable();
  const db = database([row("closed", { status: "awaiting_consent", consentGrantedAt: null }), row("open", { status: "awaiting_consent", consentGrantedAt: null })]);
  const queued: string[] = [], closedJobs: string[] = [];
  const route = load("src/app/api/applications/consent/route.ts", {
    "@/lib/db": { prisma: db.prisma },
    "@/lib/application-queue": { enqueueApplication: async (id: string) => { queued.push(id); } },
    "@/lib/job-liveness": { JOB_CLOSED_HELD_MESSAGE: "closed",
      checkJobUrlLiveness: async (url: string) => ({ state: url.endsWith("/closed") ? "closed" : "live", reason: "test" }),
      markJobClosed: async (id: string) => { closedJobs.push(id); } },
  });
  const response = await route.POST({ json: async () => ({}) });
  assert.equal(response.body.enqueued, 1); assert.equal(response.body.closed, 1);
  assert.deepEqual(queued, ["open"]); assert.deepEqual(closedJobs, ["job-closed"]);
  assert.equal(db.rows[0].status, "failed"); assert.equal(db.rows[0].submitConfirmation, "JOB_CLOSED");
  assert.equal(db.rows[0].consentGrantedAt, null, "closed posting never receives consent");
  assert.equal(db.rows[1].status, "queued");
}
async function testExplicitCreation() {
  enable();
  for (const routeName of ["apply", "apply-batch"]) {
    for (const mode of ["manual", "hybrid", "auto"]) {
      const created: any[] = [], published: string[] = [];
      const job = { id: "selected", title: "Engineer", category: "Engineering", url: "https://jobs.example.invalid/selected", description: "Role", company: "Example" };
      const prisma = {
        application: { count: async () => 0, findFirst: async () => null, findMany: async () => [],
          create: async ({ data }: any) => { created.push(data); return { id: "new", ...data }; } },
        job: { findUnique: async () => job, findMany: async () => [job] },
        cVDocument: { findFirst: async () => ({ id: "cv" }) }, cVProfile: { findUnique: async () => null },
        userPreferences: { findUnique: async () => ({ autoApplyMode: mode, matchMin: 0, dailyCap: 10 }) },
        user: { findUnique: async () => ({ avoidCompanies: null }) },
      };
      const route = load(`src/app/api/applications/${routeName}/route.ts`, {
        "@/lib/db": { prisma }, "@/lib/admin-user-actions": { monthlyQuotaSince: () => start },
        "@/lib/billing": { hasPaidOrTrialApplicationAccess: () => true, usesFreeWeeklyQuota: () => false, requiresPaymentMethodBeforeApp: () => false, effectiveTier: () => "pro", getLimits: () => ({ monthlyApplications: 100 }), dailyApplicationLimit: () => 10 },
        "@/lib/rate-limit": { applyLimiter: { limit: async () => ({ success: true }) }, applyBatchLimiter: { limit: async () => ({ success: true }) } },
        "@/lib/activation-readiness": { getActivationReadiness: async () => ({ ready: true }) },
        "@/lib/apply-session": { resolveSession: async () => ({ id: "round", status: "active" }) },
        "@/lib/conversion-events": { recordConversionEvent: async () => {} }, "@/lib/analytics": { AnalyticsEvent: { APPLICATION_CREATED: "created" } },
        "@/lib/application-queue": { enqueueApplication: async (id: string, options: any) => { assert.equal(options.preserveClaim, true); published.push(id); } },
      });
      const response = await route.POST({ json: async () => routeName === "apply" ? { jobId: "selected", portal: "other" } : { jobIds: ["selected"] } });
      assert.equal(response.status, 200, `${routeName}/${mode}`); assert.equal(created.length, 1);
      assert.ok(created[0].createdAt > start);
      if (created[0].status === "queued") {
        assert.equal(+created[0].createdAt, +created[0].consentGrantedAt);
        assert.deepEqual(published, ["new"]);
      } else {
        assert.equal(created[0].status, "awaiting_consent"); assert.equal(created[0].consentGrantedAt, null);
        assert.deepEqual(published, []);
      }
    }
  }
}
async function testReadOnlyAndPreferences() {
  enable();
  const activation = load("src/app/api/preferences/activate-auto/route.ts", {
    "@/lib/one-click-token": { verifyOneClick: () => ({ userId: "owner" }) },
    "@/lib/db": { prisma: { user: { findUnique: async () => ({ id: "owner", suspendedAt: null }) }, userPreferences: noAccess, application: noAccess } },
  });
  assert.match((await activation.GET({ nextUrl: new URL("https://example.invalid?t=test") })).location, /auto=suspended$/);
  const sessions = load("src/app/api/sessions/route.ts", {
    "@/lib/db": { prisma: { applicationSession: { findMany: async () => [], count: async () => 0 }, application: { groupBy: async () => [] } } },
  });
  assert.equal((await sessions.GET()).status, 200);
  const historicRound = { id: "existing-round", status: "active", label: "Original label", key: "cat::engineering" };
  const resolver = load("src/lib/apply-session.ts", {
    "@/lib/db": { prisma: { applicationSession: { findUnique: async () => historicRound,
      create: async () => { throw new Error("Existing round must not be rewritten"); },
      upsert: async () => { throw new Error("Existing round must not be rewritten"); } } } },
  });
  assert.equal(await resolver.resolveSession("owner", { title: "Engineer", category: "Engineering" }), historicRound);
  const preferences = readFileSync("src/app/api/preferences/route.ts", "utf8");
  assert.ok(!preferences.slice(preferences.indexOf("export async function PUT")).includes("applicationRollout"), "Rollout must not rewrite stored preferences");
  assert.ok(!readFileSync("src/app/api/applications/manual/route.ts", "utf8").includes("rolloutCreationBlocked"), "Record-only manual import is independent of rollout admission");
  for (const name of ["requeue-credit-failed", "requeue-stuck", "reset-rounds", "resync-and-reset", "reset-fake-success", "reset-placeholder-sends", "purge-non-eu-jobs"]) {
    const source = readFileSync(`scripts/${name}.ts`, "utf8");
    assert.ok(source.indexOf('throw new Error("historical_application_retries_blocked")') < source.indexOf("await prisma."), `${name} guard precedes DB access`);
  }
  const bullmq = readFileSync("src/lib/bullmq-queue.ts", "utf8");
  assert.match(bullmq, /attempts: historicalRetriesBlocked\(\) \? 1 : 3/);
  assert.match(bullmq, /maxStalledCount: historicalRetriesBlocked\(\) \? 0 : 1/);
}
async function main() {
  const original = { ...process.env };
  process.env.CRON_SECRET = "fixture-cron";
  try {
    await testBlockedEntrypoints(); await testClaimsAndQueue(); await testAutomaticClaimsAndQueue(); await testConsentCohort(); await testConsentSkipsClosedPosting();
    await testExplicitCreation(); await testReadOnlyAndPreferences();
    assert.equal(forbiddenAccesses, 0);
    console.log("PASS sending producers: automatic producers blocked only when closed/manual_only; retry/reset/replay entrypoints blocked in every mode; automatic-mode claims admit fresh auto rows only; fresh claims/queue/consent only; explicit single/batch enabled; historical records/preferences preserved. Hermetic, no DB/network/provider calls.");
  } finally {
    for (const key of Object.keys(process.env)) if (!(key in original)) delete process.env[key];
    Object.assign(process.env, original);
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
