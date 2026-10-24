/**
 * Restricted ATS test capability. Fakes only — no network, DB, or real submit.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import {
  ATS_TEST_JOB_SOURCE,
  allowUnpublishedRecruiteeOffer,
  atsTestJobExternalId,
  atsTestPriorAttemptReason,
  atsTestRealSubmitEnabled,
  atsTestUserId,
  authorizeAtsTest,
  excludeAtsTestJobRelationWhere,
  excludeAtsTestJobsWhere,
  isAtsTestJobSource,
  isAtsTestUser,
  matchAtsTestDestination,
  parseAtsTestDestinations,
  prepareAndRunAtsTest,
} from "../src/lib/ats-test-capability";
import { historicalRetriesBlocked } from "../src/lib/application-rollout";
import { blocksUncertainAutoRetry } from "../src/lib/uncertain-submission";
import { countsTowardDailyCap, occupiesWeeklyQuotaSlot, weeklyQuotaUsageWhere } from "../src/lib/daily-application-cap";

const TEST_USER = "ats-test-user-1";
const DEST = "produzioneweb.recruitee.com/o/trial-offer";
const DEST_URL = "https://produzioneweb.recruitee.com/o/trial-offer";
const env = {
  ATS_TEST_USER_ID: TEST_USER,
  ATS_TEST_DESTINATIONS: DEST,
};

assert.equal(ATS_TEST_JOB_SOURCE, "ats_test");
assert.equal(atsTestUserId({}), null);
assert.equal(atsTestUserId(env), TEST_USER);
assert.equal(isAtsTestUser(TEST_USER, env), true);
assert.equal(isAtsTestUser("someone-else", env), false);
assert.equal(isAtsTestJobSource("ats_test"), true);
assert.equal(isAtsTestJobSource("recruitee"), false);
assert.deepEqual(excludeAtsTestJobsWhere(), { source: { not: "ats_test" } });
assert.deepEqual(excludeAtsTestJobRelationWhere(), { job: { source: { not: "ats_test" } } });

assert.deepEqual(parseAtsTestDestinations({}), []);
assert.deepEqual(parseAtsTestDestinations(env), [{
  host: "produzioneweb.recruitee.com",
  slug: "trial-offer",
  url: DEST_URL,
}]);
assert.equal(matchAtsTestDestination(DEST_URL, env)?.slug, "trial-offer");
assert.equal(matchAtsTestDestination("https://bunq.recruitee.com/o/other", env), null);
assert.equal(matchAtsTestDestination("http://produzioneweb.recruitee.com/o/trial-offer", env), null);
assert.equal(allowUnpublishedRecruiteeOffer(DEST_URL, env), true);
assert.equal(allowUnpublishedRecruiteeOffer("https://bunq.recruitee.com/o/x", env), false);
assert.equal(atsTestRealSubmitEnabled({}), false);
assert.equal(atsTestRealSubmitEnabled({ ATS_TEST_REAL_SUBMIT: "on" }), true);
assert.equal(atsTestJobExternalId(parseAtsTestDestinations(env)[0]), "produzioneweb.recruitee.com/o/trial-offer");

assert.equal(authorizeAtsTest({ adminOk: false }, env).ok, false);
assert.equal((authorizeAtsTest({ adminOk: true }, {}) as { reason: string }).reason, "ats_test_user_unconfigured");
assert.equal((authorizeAtsTest({ adminOk: true, targetUserId: "nope" }, env) as { reason: string }).reason, "ats_test_user_mismatch");
assert.equal((authorizeAtsTest({ adminOk: true, jobUrl: "https://bunq.recruitee.com/o/x" }, env) as { reason: string }).reason, "ats_test_destination_not_allowlisted");
assert.equal((authorizeAtsTest({ adminOk: true, realSubmit: true }, env) as { reason: string }).reason, "ats_test_real_submit_disabled");
assert.equal((authorizeAtsTest({ adminOk: true, jobSource: "recruitee" }, env) as { reason: string }).reason, "ats_test_job_source_required");
const dry = authorizeAtsTest({ adminOk: true }, env);
assert.equal(dry.ok, true);
if (dry.ok) assert.equal(dry.mode, "dry_run");
const real = authorizeAtsTest({ adminOk: true, realSubmit: true }, { ...env, ATS_TEST_REAL_SUBMIT: "true" });
assert.equal(real.ok, true);
if (real.ok) assert.equal(real.mode, "real_submit");

assert.equal(atsTestPriorAttemptReason([], "dry_run", env), null);
assert.equal(atsTestPriorAttemptReason([{
  id: "a", userId: "other",
}], "dry_run", env), "ats_test_other_user_application");
assert.equal(atsTestPriorAttemptReason([{
  id: "a", userId: TEST_USER, submitConfirmation: "UNCONFIRMED",
}], "dry_run", env), "uncertain_submission");
assert.equal(blocksUncertainAutoRetry({ submitConfirmation: "UNCONFIRMED" }), true);
assert.equal(atsTestPriorAttemptReason([{
  id: "a", userId: TEST_USER, submitConfirmation: "DRY_RUN",
}], "real_submit", env), "ats_test_already_attempted");
assert.equal(atsTestPriorAttemptReason([{
  id: "a", userId: TEST_USER,
}], "dry_run", env), "ats_test_already_attempted");

assert.equal(countsTowardDailyCap({ status: "success", submittedAt: new Date(), jobSource: "ats_test" }), false);
assert.equal(occupiesWeeklyQuotaSlot({ status: "success", submittedAt: new Date(), jobSource: "ats_test" }), false);
assert.equal((weeklyQuotaUsageWhere("u") as { job: { source: { not: string } } }).job.source.not, "ats_test");

assert.equal(historicalRetriesBlocked(), true);

const recruitee = readFileSync("src/lib/portal-adapters/recruitee.ts", "utf8");
assert.match(recruitee, /allowUnpublishedRecruiteeOffer/);
assert.match(recruitee, /status !== "published" && !allowUnpublishedRecruiteeOffer/);

const liveness = readFileSync("src/lib/job-liveness.ts", "utf8");
assert.match(liveness, /allowUnpublishedRecruiteeOffer\(url\.href\)/);

const companies = readFileSync("src/lib/scrapers/ats-companies.ts", "utf8");
assert.doesNotMatch(companies, /produzioneweb/i);
assert.match(companies, /Restricted ATS-test Recruitee trials are NOT listed here/);

const matching = readFileSync("src/lib/dashboard-metrics-shared.ts", "utf8");
assert.match(matching, /MATCHING_SOURCES = \["greenhouse", "lever", "ashby", "smartrecruiters", "linkedin"\]/);
assert.doesNotMatch(matching, /MATCHING_SOURCES = \[[^\]]*ats_test/);

const cron = readFileSync("src/lib/auto-apply-cron.ts", "utf8");
assert.match(cron, /`ats_test` is excluded/);
const worker = readFileSync("src/lib/application-worker.ts", "utf8");
assert.match(worker, /if \(app\.job\.source === "ats_test"\) verifiedRecruiter = null/);
assert.match(worker, /"ats_test"/);

const apply = readFileSync("src/app/api/applications/apply/route.ts", "utf8");
assert.match(apply, /isAtsTestJobSource\(job\.source\)/);

const applyBatch = readFileSync("src/app/api/applications/apply-batch/route.ts", "utf8");
assert.match(applyBatch, /!isAtsTestJobSource\(j\.source\)/);

const jobsRepo = readFileSync("src/lib/jobs-repo.ts", "utf8");
assert.match(jobsRepo, /excludeAtsTestJobsWhere/);
assert.match(jobsRepo, /isAtsTestJobSource\(job\.source\)/);

const claim = readFileSync("src/lib/application-claim.ts", "utf8");
assert.match(claim, /job: \{ source: \{ not: "ats_test" \} \}/);
assert.match(claim, /blocksUncertainAutoRetry/);

const drain = readFileSync("src/lib/queue-drain.ts", "utf8");
assert.match(drain, /job: \{ source: \{ not: "ats_test" \} \}/);

const testApply = readFileSync("src/app/api/admin/test-apply/route.ts", "utf8");
assert.match(testApply, /if \(historicalRetriesBlocked\(\)\)/);

const route = readFileSync("src/app/api/admin/ats-test-apply/route.ts", "utf8");
assert.match(route, /prepareAndRunAtsTest/);
assert.match(route, /processApplication/);
assert.match(route, /historicalRetriesBlocked/);
assert.match(route, /uncertain-submission/);
assert.doesNotMatch(route, /if \(historicalRetriesBlocked\(\)\)/);
const capability = readFileSync("src/lib/ats-test-capability.ts", "utf8");
assert.match(capability, /forceDryRun: true/);
assert.match(capability, /forceRealSubmit: true/);
assert.match(capability, /atsTestUncertainReason/);
assert.doesNotMatch(capability, /enqueueApplication/);

function fakeDb(opts: {
  user?: boolean;
  existing?: Array<{ id: string; userId: string; submitConfirmation?: string | null; submitStartedAt?: Date | null }>;
} = {}) {
  const jobs: Array<{ id: string; source: string; url: string; externalId: string; title: string }> = [];
  const apps: Array<Record<string, unknown>> = [...(opts.existing ?? [])];
  let processed: { id: string; opts: unknown } | null = null;
  return {
    processed: () => processed,
    prisma: {
      user: {
        findUnique: async ({ where }: { where: { id: string } }) => (
          opts.user === false ? null : { id: where.id }
        ),
      },
      job: {
        findFirst: async () => jobs[0] ?? null,
        upsert: async ({ create }: { create: Record<string, unknown> }) => {
          const row = {
            id: "job-1",
            source: String(create.source),
            url: String(create.url),
            externalId: String(create.externalId),
            title: String(create.title),
          };
          jobs[0] = row;
          return row;
        },
      },
      application: {
        findMany: async () => apps as never,
        create: async ({ data }: { data: Record<string, unknown> }) => {
          const row = { id: "app-1", status: "queued", ...data, submittedVia: null, submitConfirmation: null, submissionReceiptJson: null, errorMessage: null, submitStartedAt: null };
          apps.push(row);
          return { id: "app-1" };
        },
        findUnique: async ({ where }: { where: { id: string } }) => (
          apps.find((a) => a.id === where.id) as never ?? null
        ),
        updateMany: async ({ where, data }: { where: { id?: string; status?: string }; data: Record<string, unknown> }) => {
          let count = 0;
          for (const app of apps) {
            if (where.id && app.id !== where.id) continue;
            if (where.status && app.status !== where.status) continue;
            Object.assign(app, data);
            count++;
          }
          return { count };
        },
      },
    },
    processApplication: async (id: string, flags: { forceDryRun?: boolean; forceRealSubmit?: boolean }) => {
      processed = { id, opts: flags };
      const app = apps.find((a) => a.id === id);
      if (app) {
        app.status = flags.forceRealSubmit ? "success" : "ready_to_apply";
        app.submitConfirmation = flags.forceRealSubmit ? "DETECTED_HTTP_201" : "DRY_RUN";
      }
    },
    findPortalAdapter: (url: string) => url.includes("recruitee.com") ? { id: "recruitee" } : null,
  };
}

async function testPrepareAndRun() {
  const dryDb = fakeDb();
  const dryRun = await prepareAndRunAtsTest({ adminOk: true }, { ...dryDb, env });
  assert.equal(dryRun.ok, true);
  if (dryRun.ok) {
    assert.equal(dryRun.mode, "dry_run");
    assert.equal(dryRun.adapter, "recruitee");
    assert.equal(dryRun.result?.submitConfirmation, "DRY_RUN");
  }
  assert.deepEqual(dryDb.processed()?.opts, { forceDryRun: true });

  const forbidden = await prepareAndRunAtsTest({ adminOk: false }, { ...fakeDb(), env });
  assert.equal(forbidden.ok, false);
  if (!forbidden.ok) assert.equal(forbidden.reason, "forbidden");

  const missingUser = await prepareAndRunAtsTest({ adminOk: true }, { ...fakeDb({ user: false }), env });
  assert.equal(missingUser.ok, false);

  const realBlocked = await prepareAndRunAtsTest({ adminOk: true, realSubmit: true }, { ...fakeDb(), env });
  assert.equal(realBlocked.ok, false);
  if (!realBlocked.ok) assert.equal(realBlocked.reason, "ats_test_real_submit_disabled");

  const realDb = fakeDb();
  const realRun = await prepareAndRunAtsTest({ adminOk: true, realSubmit: true }, {
    ...realDb,
    env: { ...env, ATS_TEST_REAL_SUBMIT: "on" },
  });
  assert.equal(realRun.ok, true);
  if (realRun.ok) assert.equal(realRun.mode, "real_submit");
  assert.deepEqual(realDb.processed()?.opts, { forceRealSubmit: true });

  const prior = await prepareAndRunAtsTest({ adminOk: true, realSubmit: true }, {
    ...fakeDb({ existing: [{ id: "old", userId: TEST_USER, submitConfirmation: "DRY_RUN" }] }),
    env: { ...env, ATS_TEST_REAL_SUBMIT: "on" },
  });
  assert.equal(prior.ok, false);
  if (!prior.ok) assert.equal(prior.reason, "ats_test_already_attempted");

  const uncertain = await prepareAndRunAtsTest({ adminOk: true }, {
    ...fakeDb({ existing: [{ id: "old", userId: TEST_USER, submitConfirmation: "UNCONFIRMED" }] }),
    env,
  });
  assert.equal(uncertain.ok, false);
  if (!uncertain.ok) assert.equal(uncertain.reason, "uncertain_submission");

  const otherUser = await prepareAndRunAtsTest({ adminOk: true }, {
    ...fakeDb({ existing: [{ id: "old", userId: "customer", submitConfirmation: null }] }),
    env,
  });
  assert.equal(otherUser.ok, false);
  if (!otherUser.ok) assert.equal(otherUser.reason, "ats_test_other_user_application");
}

function loadRoute() {
  const js = ts.transpileModule(readFileSync("src/app/api/admin/ats-test-apply/route.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const calls = { historical: 0, processed: [] as string[] };
  const exports: Record<string, unknown> = {};
  new Function("require", "exports", js)((name: string) => {
    const mocks: Record<string, unknown> = {
      "@/lib/application-pause": { applicationsPaused: () => false },
      "@/lib/application-rollout": {
        historicalRetriesBlocked: () => { calls.historical++; return true; },
      },
      "@/lib/ats-test-capability": {
        prepareAndRunAtsTest: async () => ({
          ok: true, mode: "dry_run", applicationId: "app-1", jobId: "job-1",
          destination: parseAtsTestDestinations(env)[0], adapter: "recruitee",
          result: { id: "app-1", status: "ready_to_apply", submittedVia: null, submitConfirmation: "DRY_RUN", submissionReceiptJson: null, errorMessage: null, submitStartedAt: null },
        }),
      },
      "@/lib/admin": { isAdmin: () => true },
      "@/lib/application-worker": { processApplication: async (id: string) => { calls.processed.push(id); } },
      "@/lib/db": { prisma: {} },
      "@/lib/portal-adapters": { findPortalAdapter: () => ({ id: "recruitee" }) },
      "@/lib/session": { getCurrentUser: async () => ({ email: "admin@example.test" }) },
      "next/server": { NextResponse: { json: (body: unknown, options?: { status?: number }) => ({ status: options?.status ?? 200, body }) } },
    };
    if (!(name in mocks)) throw new Error(`unexpected dependency ${name}`);
    return mocks[name];
  }, exports);
  return { route: exports as { POST: (req: unknown) => Promise<{ status: number; body: Record<string, unknown> }> }, calls };
}

async function testRoute() {
  const { route, calls } = loadRoute();
  const res = await route.POST({ json: async () => ({}) });
  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
  assert.equal(calls.historical > 0, true, "route consults historicalRetriesBlocked and does not bypass it");
  assert.deepEqual(calls.processed, [], "route must not call processApplication itself; prepareAndRunAtsTest owns the pipeline");
}

async function main() {
  await testPrepareAndRun();
  await testRoute();
  console.log("PASS ats-test-capability: dedicated user + allowlist, dry-run default, real submit gated, single-shot, unpublished only for test hosts, exclusions, fakes");
}

main().catch((error) => { console.error(error); process.exit(1); });
