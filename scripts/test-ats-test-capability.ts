import * as customerRollout from "../src/lib/customer-rollout";
import * as ordinaryValidation from "../src/lib/ordinary-validation";
/**
 * Restricted ATS test capability. Fakes only — no network, DB, or real submit.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import ts from "typescript";
import {
  ATS_TEST_CLAIMED,
  ATS_TEST_FICTIONAL_MARK,
  ATS_TEST_IN_PROGRESS,
  ATS_TEST_JOB_SOURCE,
  ATS_TEST_PLACEHOLDER_EMAIL,
  ATS_TEST_REFUSED_BEFORE_SUBMIT,
  allowUnpublishedRecruiteeOffer,
  atsTestApplicationId,
  atsTestCandidateEmail,
  atsTestCandidateEmailState,
  atsTestClaimWhere,
  atsTestDestinationLockKey,
  atsTestJobExternalId,
  atsTestPauseExemption,
  atsTestPauseExemptionForId,
  atsTestPriorAttemptReason,
  atsTestRealSubmitEnabled,
  atsTestSkipsDocumentTailoring,
  atsTestSkipsRecruiterLookup,
  atsTestUserId,
  authorizeAtsTest,
  claimAtsTestAttempt,
  excludeAtsTestJobRelationWhere,
  excludeAtsTestJobsWhere,
  isAtsTestAuthorization,
  isAtsTestDiagnosticApplication,
  isAtsTestJobSource,
  isAtsTestUser,
  maskAtsTestCandidateEmail,
  matchAtsTestDestination,
  parseAtsTestDestinations,
  prepareAndRunAtsTest,
  recheckAtsTestBeforeSubmitHttp,
  syntheticAtsTestCvText,
  syntheticAtsTestProfile,
  type AtsTestAuthorization,
} from "../src/lib/ats-test-capability";
import { recruiteeOfferValidation, requiresRecruiteeOriginReview } from "../src/lib/portal-adapters/recruitee";
assert.equal(requiresRecruiteeOriginReview(["https://careers.employer.test/o/engineer"], "unknown"), true);
assert.equal(requiresRecruiteeOriginReview(["https://careers.employer.test/jobs/engineer"], "recruitee"), true);
assert.equal(requiresRecruiteeOriginReview(["https://tenant.recruitee.com/o/engineer"], "recruitee", "recruitee"), false);
assert.equal(requiresRecruiteeOriginReview(["https://employer.test/jobs/engineer"], "unknown"), false);
import { currentWorkerIneligibility, type WorkerGateRow } from "../src/lib/application-worker-gates";
import { historicalRetriesBlocked } from "../src/lib/application-rollout";
import { applicationsPaused } from "../src/lib/application-pause";
import { blocksUncertainAutoRetry } from "../src/lib/uncertain-submission";
import { countsTowardDailyCap, occupiesWeeklyQuotaSlot, weeklyQuotaUsageWhere } from "../src/lib/daily-application-cap";

const TEST_USER = "ats-test-user-1";
const DEST = "produzioneweb.recruitee.com/o/trial-offer";
const DEST_URL = "https://produzioneweb.recruitee.com/o/trial-offer";
const DEST2 = "produzioneweb.recruitee.com/o/real-offer";
const DEST2_URL = "https://produzioneweb.recruitee.com/o/real-offer";
const CANDIDATE_EMAIL = "owner-mailbox@example.test";
const env = {
  ATS_TEST_USER_ID: TEST_USER,
  ATS_TEST_DESTINATIONS: `${DEST} ${DEST2}`,
  ATS_TEST_CANDIDATE_EMAIL: CANDIDATE_EMAIL,
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
assert.equal(parseAtsTestDestinations(env).length, 2);
assert.equal(matchAtsTestDestination(DEST_URL, env)?.slug, "trial-offer");
assert.equal(matchAtsTestDestination(DEST2_URL, env)?.slug, "real-offer");
assert.equal(matchAtsTestDestination("https://bunq.recruitee.com/o/other", env), null);
assert.equal(matchAtsTestDestination("http://produzioneweb.recruitee.com/o/trial-offer", env), null);
assert.equal(allowUnpublishedRecruiteeOffer(DEST_URL, env), true);
assert.equal(allowUnpublishedRecruiteeOffer("https://bunq.recruitee.com/o/x", env), false);
assert.equal(atsTestRealSubmitEnabled({}), false);
assert.equal(atsTestRealSubmitEnabled({ ATS_TEST_REAL_SUBMIT: "on" }), false);
assert.equal(atsTestRealSubmitEnabled({ ATS_TEST_REAL_SUBMIT: "true" }), true);
assert.equal(atsTestJobExternalId(parseAtsTestDestinations(env)[0]), "produzioneweb.recruitee.com/o/trial-offer");

const dest = parseAtsTestDestinations(env)[0];
const expectedId = `ats_test_${createHash("sha256").update(DEST_URL).digest("hex").slice(0, 24)}`;
assert.equal(atsTestApplicationId(dest), expectedId);
assert.equal(isAtsTestDiagnosticApplication(expectedId, dest), true);
assert.equal(isAtsTestDiagnosticApplication("app-random", dest), false);
assert.equal(atsTestDestinationLockKey(dest), "ats_test:produzioneweb.recruitee.com/o/trial-offer");

assert.equal(atsTestCandidateEmail({}).ok, false);
assert.equal((atsTestCandidateEmail({}) as { reason: string }).reason, "ats_test_candidate_email_unconfigured");
assert.equal((atsTestCandidateEmail({ ATS_TEST_CANDIDATE_EMAIL: "not-an-email" }) as { reason: string }).reason, "ats_test_candidate_email_invalid");
assert.equal((atsTestCandidateEmail({ ATS_TEST_CANDIDATE_EMAIL: ATS_TEST_PLACEHOLDER_EMAIL }) as { reason: string }).reason, "ats_test_candidate_email_placeholder");
assert.equal((atsTestCandidateEmail({ ATS_TEST_CANDIDATE_EMAIL: "x@inbound.lavorai.it" }) as { reason: string }).reason, "ats_test_candidate_email_inbound_domain");
assert.equal((atsTestCandidateEmail({ ATS_TEST_CANDIDATE_EMAIL: "x@apply.lavorai.it" }) as { reason: string }).reason, "ats_test_candidate_email_inbound_domain");
assert.equal((atsTestCandidateEmail({ ATS_TEST_CANDIDATE_EMAIL: "x@mail.inbound.lavorai.it" }) as { reason: string }).reason, "ats_test_candidate_email_inbound_domain");
assert.equal((atsTestCandidateEmail({
  ATS_TEST_CANDIDATE_EMAIL: "x@mail.custom.test",
  INBOUND_EMAIL_DOMAIN: "custom.test",
}) as { reason: string }).reason, "ats_test_candidate_email_inbound_domain");
const candidateOk = atsTestCandidateEmail(env);
assert.equal(candidateOk.ok, true);
if (candidateOk.ok) assert.equal(candidateOk.email, CANDIDATE_EMAIL);
assert.equal(maskAtsTestCandidateEmail(CANDIDATE_EMAIL), "o***@example.test");
assert.equal(atsTestCandidateEmailState(env).masked, "o***@example.test");
assert.equal(authorizeAtsTest({ adminOk: true }, { ATS_TEST_USER_ID: TEST_USER, ATS_TEST_DESTINATIONS: DEST }).ok, false);

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

assert.equal(isAtsTestAuthorization({ userId: TEST_USER, destination: dest, applicationId: expectedId, mode: "dry_run", realSubmitRequested: false }), false);
assert.equal(isAtsTestAuthorization({ [Symbol("lavorai.atsTestAuthorization")]: Symbol("lavorai.atsTestAuthorization") }), false);
assert.equal(atsTestPauseExemptionForId({ userId: TEST_USER, applicationId: expectedId }, expectedId, env), false);

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
  assert.equal(atsTestPriorAttemptReason([{
    id: expectedId, userId: TEST_USER, submitStartedAt: new Date(),
  }], "dry_run", env), "uncertain_submit_started");
  assert.equal(atsTestPriorAttemptReason([{
    id: expectedId, userId: TEST_USER, submitConfirmation: ATS_TEST_CLAIMED,
  }], "dry_run", env), ATS_TEST_IN_PROGRESS);

assert.equal(countsTowardDailyCap({ status: "success", submittedAt: new Date(), jobSource: "ats_test" }), false);
assert.equal(occupiesWeeklyQuotaSlot({ status: "success", submittedAt: new Date(), jobSource: "ats_test" }), false);
assert.equal((weeklyQuotaUsageWhere("u") as { job: { source: { not: string } } }).job.source.not, "ats_test");

assert.equal(historicalRetriesBlocked(), true);

const recruitee = readFileSync("src/lib/portal-adapters/recruitee.ts", "utf8");
assert.match(recruitee, /allowUnpublishedRecruiteeOffer/);
assert.match(recruitee, /recheckAtsTestBeforeSubmitHttp/);
assert.match(recruitee, /status !== "published" && !allowUnpublishedRecruiteeOffer/);
const dryRunAt = recruitee.indexOf("if (input.dryRun)");
const recheckAt = recruitee.indexOf("const submitGuard = recheckAtsTestBeforeSubmitHttp");
const candidatesPostAt = recruitee.indexOf('fetch(endpoint, { method: "POST"');
assert.ok(dryRunAt > 0 && recheckAt > dryRunAt && candidatesPostAt > recheckAt, "dry-run returns before recheck and Recruitee candidates POST");
assert.match(recruitee, /multipartEmail:/);

const liveness = readFileSync("src/lib/job-liveness.ts", "utf8");
assert.match(liveness, /allowUnpublishedRecruiteeOffer\(url\.href\)/);

const companies = readFileSync("src/lib/scrapers/ats-companies.ts", "utf8");
assert.doesNotMatch(companies, /produzioneweb/i);
assert.match(companies, /Restricted ATS-test Recruitee trials are NOT listed here/);

const matching = readFileSync("src/lib/dashboard-metrics-shared.ts", "utf8");
assert.match(matching, /MATCHING_SOURCES = \["greenhouse", "lever", "ashby", "smartrecruiters", "linkedin", "recruitee"\]/);
assert.doesNotMatch(matching, /MATCHING_SOURCES = \[[^\]]*ats_test/);

const cron = readFileSync("src/lib/auto-apply-cron.ts", "utf8");
assert.match(cron, /`ats_test` is excluded/);
const worker = readFileSync("src/lib/application-worker.ts", "utf8");
assert.match(worker, /if \(app\.job\.source === "ats_test"\) verifiedRecruiter = null/);
assert.match(worker, /"ats_test"/);
assert.match(worker, /atsTestPauseExemptionForId/);
assert.match(worker, /syntheticAtsTestProfile/);
assert.match(worker, /atsTestCandidateEmail/);
assert.match(worker, /if \(!atsTestSkipsDocumentTailoring\(atsTestAuth\)\)/);
assert.match(worker, /if \(!atsTestSkipsRecruiterLookup\(atsTestAuth\)\)/);
assert.match(worker, /tailorProfileForJob/);
assert.match(worker, /findVerifiedRecruiterEmail/);
assert.doesNotMatch(worker, /sendWithinQuota\([^)]*atsTestAuth/);
assert.match(worker, /if \(!input\.atsTestAuth\) assertApplicationsRunning\(\)/);
const tailorAt = worker.indexOf("tailorProfileForJob");
assert.ok(worker.lastIndexOf("atsTestSkipsDocumentTailoring", tailorAt) > 0, "token path skips tailoring");
const recruiterCall = worker.indexOf("verifiedRecruiter = await findVerifiedRecruiterEmail");
assert.ok(worker.lastIndexOf("atsTestSkipsRecruiterLookup", recruiterCall) > 0, "token path skips recruiter lookup");
assert.equal(atsTestSkipsDocumentTailoring(undefined), false);
assert.equal(atsTestSkipsRecruiterLookup(undefined), false);

const apply = readFileSync("src/app/api/applications/apply/route.ts", "utf8");
assert.match(apply, /isAtsTestJobSource\(job\.source\)/);

const applyBatch = readFileSync("src/app/api/applications/apply-batch/route.ts", "utf8");
assert.match(applyBatch, /!isAtsTestJobSource\(j\.source\)/);

const jobsRepo = readFileSync("src/lib/jobs-repo.ts", "utf8");
assert.match(jobsRepo, /excludeAtsTestJobsWhere/);
assert.match(jobsRepo, /!catalogueJobVisible\(job\)/);
const cataloguePolicy = readFileSync("src/lib/job-catalogue-policy.ts", "utf8");
assert.match(cataloguePolicy, /job.source==='ats_test'/);

const claim = readFileSync("src/lib/application-claim.ts", "utf8");
assert.match(claim, /job: \{ source: \{ not: "ats_test" \},/);
assert.match(claim, /blocksUncertainAutoRetry/);

const drain = readFileSync("src/lib/queue-drain.ts", "utf8");
assert.match(drain, /job: \{ source: \{ not: "ats_test" \} \}/);
assert.match(drain, /applicationsPaused/);

const testApply = readFileSync("src/app/api/admin/test-apply/route.ts", "utf8");
assert.match(testApply, /if \(historicalRetriesBlocked\(\)\)/);

const route = readFileSync("src/app/api/admin/ats-test-apply/route.ts", "utf8");
assert.match(route, /prepareAndRunAtsTest/);
assert.match(route, /processApplication/);
assert.match(route, /checkOrigin/);
assert.match(route, /historicalRetriesBlocked/);
assert.match(route, /uncertain-submission/);
assert.doesNotMatch(route, /if \(historicalRetriesBlocked\(\)\)/);
assert.doesNotMatch(route, /applicationsPaused/);
const capability = readFileSync("src/lib/ats-test-capability.ts", "utf8");
assert.match(capability, /atsTestAuth: token/);
assert.match(capability, /pg_advisory_xact_lock/);
assert.match(capability, /atsTestApplicationId/);
assert.match(capability, /P2002/);
assert.match(capability, /ATS_TEST_AUTH_BRAND/);
assert.match(capability, /claimAtsTestAttempt/);
assert.match(capability, /ATS_TEST_CLAIMED/);
assert.match(worker, /adoptAtsTestWorkLease/);
assert.match(worker, /if \(!input\.atsTestAuth && !await beginApplicationSubmission/);
assert.match(worker, /ATS test: claimAtsTestAttempt is the send fence/);
assert.match(worker, /requiresBrowser === false/);
assert.match(recruitee, /requiresBrowser:\s*false/);
assert.doesNotMatch(capability, /enqueueApplication/);
assert.doesNotMatch(capability, /autoApplyMode/);

const profile = syntheticAtsTestProfile();
assert.equal(profile.email, ATS_TEST_PLACEHOLDER_EMAIL);
assert.match(profile.summary, new RegExp(ATS_TEST_FICTIONAL_MARK.replace(/[[\]]/g, "\\$&")));
assert.match(syntheticAtsTestCvText(), new RegExp(ATS_TEST_FICTIONAL_MARK.replace(/[[\]]/g, "\\$&")));

const panel = readFileSync("src/app/(app)/admin/ats-test/_panel.tsx", "utf8");
assert.match(panel, /Dry run \(no submission\)/);
assert.match(panel, /Real submit \(one-time\)/);
assert.match(panel, /ATS_TEST_REAL_SUBMIT/);
assert.match(panel, /ATS_TEST_CANDIDATE_EMAIL/);
assert.match(panel, /candidateEmail\.masked/);
assert.match(panel, /submitConfirmation/);
assert.match(panel, /receiptId/);
assert.match(panel, /application id/);
assert.match(panel, /setDryLocked\(true\)/);
assert.match(panel, /setRealLocked\(true\)/);
assert.match(readFileSync("src/app/(app)/admin/ats-test/page.tsx", "utf8"), /AtsTestAdminPanel/);

type FakeApp = Record<string, unknown> & { id: string; userId: string };

function matchesWhere(row: Record<string, unknown>, where: Record<string, unknown> | undefined): boolean {
  if (!where) return true;
  return Object.entries(where).every(([key, value]) => {
    if (key === "OR") return (value as Record<string, unknown>[]).some((branch) => matchesWhere(row, branch));
    if (key === "AND") return (value as Record<string, unknown>[]).every((branch) => matchesWhere(row, branch));
    if (value && typeof value === "object" && !(value instanceof Date)) {
      if ("in" in value) return (value as { in: unknown[] }).in.includes(row[key]);
      if ("not" in value) return row[key] !== (value as { not: unknown }).not;
    }
    return row[key] === value || (value === null && row[key] == null);
  });
}

function fakeDb(opts: {
  user?: boolean;
  existing?: Array<{ id: string; userId: string; submitConfirmation?: string | null; submitStartedAt?: Date | null; status?: string }>;
  submitCalls?: { count: number };
  processApplication?: (id: string, flags: { atsTestAuth?: AtsTestAuthorization }, apps: FakeApp[]) => Promise<void>;
} = {}) {
  const jobs: Array<{ id: string; source: string; url: string; externalId: string; title: string }> = [];
  const apps: FakeApp[] = (opts.existing ?? []).map((row) => ({
    status: row.submitConfirmation === ATS_TEST_REFUSED_BEFORE_SUBMIT ? "ready_to_apply" : "queued",
    submittedAt: null,
    submittedVia: null,
    submitStartedAt: null,
    ...row,
  })) as FakeApp[];
  let processed: { id: string; opts: { atsTestAuth?: AtsTestAuthorization } } | null = null;
  let lock = Promise.resolve();
  let writeLock = Promise.resolve();
  const submitCalls = opts.submitCalls ?? { count: 0 };
  const prisma = {
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
      findMany: async ({ where }: { where?: { jobId?: string } } = {}) => (
        where?.jobId ? apps.filter((app) => app.jobId === where.jobId) : apps
      ) as never,
      findUnique: async ({ where }: { where: { id: string } }) => (
        apps.find((a) => a.id === where.id || matchesWhere(a, where)) as never ?? null
      ),
      create: async ({ data }: { data: Record<string, unknown> }) => {
        if (apps.some((app) => app.id === data.id)) {
          throw Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
        }
        const row = {
          id: String(data.id),
          status: "queued",
          submittedAt: null,
          submittedVia: null,
          submitConfirmation: null,
          submissionReceiptJson: null,
          errorMessage: null,
          submitStartedAt: null,
          ...data,
        } as FakeApp;
        apps.push(row);
        return { id: row.id };
      },
      updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        const prev = writeLock;
        let release!: () => void;
        writeLock = new Promise<void>((resolve) => { release = resolve; });
        await prev;
        try {
          let count = 0;
          for (const app of apps) {
            if (!matchesWhere(app, where)) continue;
            Object.assign(app, data);
            count++;
          }
          return { count };
        } finally {
          release();
        }
      },
    },
    $executeRaw: async () => undefined,
    $transaction: async <T>(fn: (tx: typeof prisma) => Promise<T>) => {
      const prev = lock;
      let release!: () => void;
      lock = new Promise<void>((resolve) => { release = resolve; });
      await prev;
      try {
        return await fn(prisma);
      } finally {
        release();
      }
    },
  };
  return {
    processed: () => processed,
    apps: () => apps,
    submitCalls,
    prisma,
    processApplication: async (id: string, flags: { atsTestAuth?: AtsTestAuthorization }) => {
      processed = { id, opts: flags };
      submitCalls.count += 1;
      if (opts.processApplication) {
        await opts.processApplication(id, flags, apps);
        return;
      }
      const app = apps.find((a) => a.id === id);
      if (app) {
        app.status = flags.atsTestAuth?.mode === "real_submit" ? "success" : "ready_to_apply";
        app.submitConfirmation = flags.atsTestAuth?.mode === "real_submit" ? "DETECTED_HTTP_201" : "DRY_RUN";
      }
    },
    findPortalAdapter: (url: string) => url.includes("recruitee.com") ? { id: "recruitee" } : null,
  };
}

async function captureToken(jobUrl = DEST_URL): Promise<AtsTestAuthorization> {
  const db = fakeDb();
  const run = await prepareAndRunAtsTest({ adminOk: true, jobUrl }, { ...db, env });
  assert.equal(run.ok, true);
  const token = db.processed()?.opts.atsTestAuth;
  assert.equal(isAtsTestAuthorization(token), true);
  return token!;
}

async function testPrepareAndRun() {
  const dryDb = fakeDb();
  const dryRun = await prepareAndRunAtsTest({ adminOk: true, jobUrl: DEST_URL }, { ...dryDb, env });
  assert.equal(dryRun.ok, true);
  if (dryRun.ok) {
    assert.equal(dryRun.mode, "dry_run");
    assert.equal(dryRun.adapter, "recruitee");
    assert.equal(dryRun.applicationId, atsTestApplicationId(dest));
    assert.equal(dryRun.result?.submitConfirmation, "DRY_RUN");
  }
  assert.equal(isAtsTestAuthorization(dryDb.processed()?.opts.atsTestAuth), true);
  assert.equal(dryDb.processed()?.opts.atsTestAuth?.mode, "dry_run");

  const forbidden = await prepareAndRunAtsTest({ adminOk: false }, { ...fakeDb(), env });
  assert.equal(forbidden.ok, false);
  if (!forbidden.ok) assert.equal(forbidden.reason, "forbidden");

  const notAllowlisted = await prepareAndRunAtsTest({
    adminOk: true, jobUrl: "https://bunq.recruitee.com/o/other",
  }, { ...fakeDb(), env });
  assert.equal(notAllowlisted.ok, false);
  if (!notAllowlisted.ok) assert.equal(notAllowlisted.reason, "ats_test_destination_not_allowlisted");

  const notTestUser = authorizeAtsTest({ adminOk: true, targetUserId: "customer-user" }, env);
  assert.equal(notTestUser.ok, false);
  if (!notTestUser.ok) assert.equal(notTestUser.reason, "ats_test_user_mismatch");

  const missingUser = await prepareAndRunAtsTest({ adminOk: true }, { ...fakeDb({ user: false }), env });
  assert.equal(missingUser.ok, false);

  const realBlocked = await prepareAndRunAtsTest({ adminOk: true, realSubmit: true }, { ...fakeDb(), env });
  assert.equal(realBlocked.ok, false);
  if (!realBlocked.ok) assert.equal(realBlocked.reason, "ats_test_real_submit_disabled");

  const realDb = fakeDb();
  const realRun = await prepareAndRunAtsTest({ adminOk: true, realSubmit: true, jobUrl: DEST2_URL }, {
    ...realDb,
    env: { ...env, ATS_TEST_REAL_SUBMIT: "true" },
  });
  assert.equal(realRun.ok, true);
  if (realRun.ok) assert.equal(realRun.mode, "real_submit");
  assert.equal(realDb.processed()?.opts.atsTestAuth?.mode, "real_submit");
  assert.equal(realDb.processed()?.opts.atsTestAuth?.realSubmitRequested, true);

  const prior = await prepareAndRunAtsTest({ adminOk: true }, {
    ...fakeDb({ existing: [{ id: expectedId, userId: TEST_USER, submitConfirmation: "DRY_RUN" }] }),
    env,
  });
  assert.equal(prior.ok, false);
  if (!prior.ok) assert.equal(prior.reason, "ats_test_already_attempted");

  const uncertain = await prepareAndRunAtsTest({ adminOk: true }, {
    ...fakeDb({ existing: [{ id: expectedId, userId: TEST_USER, submitConfirmation: "UNCONFIRMED" }] }),
    env,
  });
  assert.equal(uncertain.ok, false);
  if (!uncertain.ok) assert.equal(uncertain.reason, "uncertain_submission");

  const otherUser = await prepareAndRunAtsTest({ adminOk: true }, {
    ...fakeDb({ existing: [{ id: expectedId, userId: "customer", submitConfirmation: null }] }),
    env,
  });
  assert.equal(otherUser.ok, false);
  if (!otherUser.ok) assert.equal(otherUser.reason, "ats_test_other_user_application");

  const missingEmail = await prepareAndRunAtsTest({ adminOk: true }, {
    ...fakeDb(),
    env: { ATS_TEST_USER_ID: TEST_USER, ATS_TEST_DESTINATIONS: DEST },
  });
  assert.equal(missingEmail.ok, false);
  if (!missingEmail.ok) assert.equal(missingEmail.reason, "ats_test_candidate_email_unconfigured");

  const refusedRetry = await prepareAndRunAtsTest({ adminOk: true }, {
    ...fakeDb({ existing: [{ id: expectedId, userId: TEST_USER, submitConfirmation: ATS_TEST_REFUSED_BEFORE_SUBMIT }] }),
    env,
  });
  assert.equal(refusedRetry.ok, true, "refused-before-submit does not consume the destination");
}

async function testFourSubmitChecks() {
  const token = await captureToken();
  const base = {
    ownerUserId: TEST_USER,
    destinationUrl: DEST_URL,
    applicationId: token.applicationId,
    jobSource: "ats_test",
    realSubmit: false,
  };

  assert.equal(recheckAtsTestBeforeSubmitHttp(token, base, env).ok, true);
  assert.equal(recheckAtsTestBeforeSubmitHttp(token, { ...base, multipartEmail: CANDIDATE_EMAIL }, env).ok, true);
  assert.equal(
    (recheckAtsTestBeforeSubmitHttp(token, { ...base, multipartEmail: "other@example.test" }, env) as { reason: string }).reason,
    "ats_test_candidate_email_mismatch",
  );
  assert.equal(
    (recheckAtsTestBeforeSubmitHttp(token, base, { ...env, ATS_TEST_CANDIDATE_EMAIL: "" }) as { reason: string }).reason,
    "ats_test_candidate_email_unconfigured",
  );

  assert.equal(
    (recheckAtsTestBeforeSubmitHttp(token, { ...base, ownerUserId: "customer" }, env) as { reason: string }).reason,
    "ats_test_user_mismatch",
  );
  assert.equal(
    (recheckAtsTestBeforeSubmitHttp(token, { ...base, destinationUrl: "https://bunq.recruitee.com/o/other" }, env) as { reason: string }).reason,
    "ats_test_destination_not_allowlisted",
  );
  assert.equal(
    (recheckAtsTestBeforeSubmitHttp(token, { ...base, applicationId: "random-cuid" }, env) as { reason: string }).reason,
    "ats_test_application_not_diagnostic",
  );
  assert.equal(
    (recheckAtsTestBeforeSubmitHttp(token, { ...base, realSubmit: true }, env) as { reason: string }).reason,
    "ats_test_real_submit_disabled",
  );
  assert.equal(
    (recheckAtsTestBeforeSubmitHttp({ userId: TEST_USER, applicationId: token.applicationId }, { ...base, jobSource: "ats_test" }, env) as { reason: string }).reason,
    "ats_test_authorization_required",
  );

  const realTokenDb = fakeDb();
  const realRun = await prepareAndRunAtsTest({ adminOk: true, realSubmit: true, jobUrl: DEST2_URL }, {
    ...realTokenDb,
    env: { ...env, ATS_TEST_REAL_SUBMIT: "true" },
  });
  assert.equal(realRun.ok, true);
  const realToken = realTokenDb.processed()?.opts.atsTestAuth;
  assert.equal(recheckAtsTestBeforeSubmitHttp(realToken, {
    ownerUserId: TEST_USER,
    destinationUrl: DEST2_URL,
    applicationId: realToken!.applicationId,
    jobSource: "ats_test",
    realSubmit: true,
  }, { ...env, ATS_TEST_REAL_SUBMIT: "true" }).ok, true);
  assert.equal(
    (recheckAtsTestBeforeSubmitHttp(realToken, {
      ownerUserId: TEST_USER,
      destinationUrl: DEST2_URL,
      applicationId: realToken!.applicationId,
      jobSource: "ats_test",
      realSubmit: true,
    }, env) as { reason: string }).reason,
    "ats_test_real_submit_disabled",
  );
}

async function testConcurrentAndUncertainRetry() {
  const submitCalls = { count: 0 };
  const db = fakeDb({ submitCalls });
  const [first, second] = await Promise.all([
    prepareAndRunAtsTest({ adminOk: true, jobUrl: DEST_URL }, { ...db, env }),
    prepareAndRunAtsTest({ adminOk: true, jobUrl: DEST_URL }, { ...db, env }),
  ]);
  const oks = [first, second].filter((run) => run.ok);
  const refused = [first, second].filter((run) => !run.ok);
  assert.equal(oks.length, 1, "concurrent double POST yields exactly one success");
  assert.equal(refused.length, 1);
  if (!refused[0].ok) {
    assert.ok(
      refused[0].reason === "ats_test_already_attempted" || refused[0].reason === ATS_TEST_IN_PROGRESS,
      refused[0].reason,
    );
  }
  assert.equal(db.apps().filter((app) => app.id === expectedId).length, 1);
  assert.ok(submitCalls.count <= 1, "at most one adapter/processApplication call");

  const uncertainCalls = { count: 0 };
  const uncertainDb = fakeDb({
    submitCalls: uncertainCalls,
    existing: [{ id: expectedId, userId: TEST_USER, submitStartedAt: new Date(), submitConfirmation: "SUBMISSION_STARTED" }],
  });
  const retry = await prepareAndRunAtsTest({ adminOk: true, jobUrl: DEST_URL }, { ...uncertainDb, env });
  assert.equal(retry.ok, false);
  if (!retry.ok) assert.equal(retry.reason, "uncertain_submit_started");
  assert.equal(uncertainCalls.count, 0, "retry after uncertain result makes zero submit calls");
}

function gateRow(overrides: Partial<WorkerGateRow> = {}): WorkerGateRow {
  const now = new Date();
  return {
    id: expectedId, userId: TEST_USER, jobId: "job", sessionId: null, status: "queued", startedAt: null,
    leaseToken: null, leaseExpiresAt: null, submitStartedAt: null, submitClickPerformedAt: null,
    outboundSubmissionJson: null, destinationResponseJson: null, consentGrantedAt: now, createdAt: now, retryCount: 0,
    submissionReceiptJson: null, userProvidedAnswersJson: null, answerContinuationJson: null, pendingQuestionsJson: null, completedAt: null,
    cvDocxPath: null, submittedAt: null, submittedVia: null, submitConfirmation: null,
    canaryLog: null, answersUsedJson: null, viewedAt: null, lastReplyAt: null, replyCount: 0, userStatus: null,
    job: { closedAt: null, url: DEST_URL, recruiterEmail: null, title: "Trial", company: "Produzioneweb", description: "x", location: "Remote", remote: true, contractType: "employee", salaryMin: null, salaryMax: null },
    session: null,
    user: {
      email: "synthetic@example.invalid", name: "LavorAI Test", yearsExperience: null, englishLevel: null, noticePeriod: null, tier: "free", createdAt: now, trialEndsAt: null, trialGraceEndsAt: null,
      subscriptionStatus: "canceled", currentPeriodEnd: new Date(0), pausedUntil: null, suspendedAt: null,
      emailVerified: null, privacyConsentAt: null, avoidCompanies: null,
      cvProfile: null,
      preferences: { applicationAnswersJson: "{}", autoApplyMode: "off", rolesJson: "[]", locationsJson: "[]", salaryMin: 0, employmentType: "employee", matchMin: 0, sourcesJson: "[]" },
    },
    ...overrides,
  } as WorkerGateRow;
}

async function testPauseExemptionNotInheritable() {
  const previous = process.env.APPLICATIONS_PAUSED;
  const previousUser = process.env.ATS_TEST_USER_ID;
  const previousDest = process.env.ATS_TEST_DESTINATIONS;
  process.env.APPLICATIONS_PAUSED = "true";
  process.env.ATS_TEST_USER_ID = TEST_USER;
  process.env.ATS_TEST_DESTINATIONS = env.ATS_TEST_DESTINATIONS;
  try {
    assert.equal(applicationsPaused(), true);
    const row = gateRow();
    assert.equal(currentWorkerIneligibility(row), "applications_paused");
    const token = await captureToken();
    assert.equal(atsTestPauseExemption(token, row, env), true);
    assert.equal(atsTestSkipsDocumentTailoring(token), true);
    assert.equal(atsTestSkipsRecruiterLookup(token), true);
    assert.equal(currentWorkerIneligibility(row, new Date(), token), null);
    assert.equal(currentWorkerIneligibility(row, new Date(), { userId: TEST_USER, applicationId: expectedId }), "applications_paused");
    const customerRow = gateRow({ id: "customer-app", userId: "customer" });
    assert.equal(atsTestPauseExemption(token, customerRow, env), false);
    assert.equal(currentWorkerIneligibility(customerRow, new Date(), token), "applications_paused");
    const otherDest = gateRow({ job: { ...row.job, url: "https://bunq.recruitee.com/o/other" } });
    assert.equal(atsTestPauseExemption(token, otherDest, env), false);
    assert.equal(currentWorkerIneligibility(otherDest, new Date(), token), "applications_paused");

    const workerExports = loadWorker();
    let loaded = 0;
    workerExports.__setFindUnique(async () => { loaded++; return { id: expectedId, userId: TEST_USER, job: { source: "ats_test", url: DEST_URL } }; });
    await workerExports.processApplication(expectedId, { forceRealSubmit: true });
    assert.equal(loaded, 0, "ordinary processApplication stays paused even with a test-shaped id");
    await workerExports.processApplication(expectedId);
    assert.equal(loaded, 0);
  } finally {
    if (previous === undefined) delete process.env.APPLICATIONS_PAUSED; else process.env.APPLICATIONS_PAUSED = previous;
    if (previousUser === undefined) delete process.env.ATS_TEST_USER_ID; else process.env.ATS_TEST_USER_ID = previousUser;
    if (previousDest === undefined) delete process.env.ATS_TEST_DESTINATIONS; else process.env.ATS_TEST_DESTINATIONS = previousDest;
  }
}

function loadWorker() {
  let findUnique: (args: { where: { id: string } }) => Promise<unknown> = async () => null;
  const source = readFileSync("src/lib/application-worker.ts", "utf8");
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const exports: Record<string, unknown> = {};
  new Function("require", "exports", js)((name: string) => {
    if (name === "./ordinary-validation") return ordinaryValidation;
    if (name === "./customer-rollout" || name === "@/lib/customer-rollout") return customerRollout;
    if (name === "@/lib/application-pause") {
      return { applicationsPaused: () => true, assertApplicationsRunning: () => { throw new Error("applications_paused"); } };
    }
    if (name === "@/lib/ats-test-capability") {
      return {
        ATS_TEST_FICTIONAL_MARK,
        ATS_TEST_REFUSED_BEFORE_SUBMIT,
        atsTestCandidateEmail: (given?: Record<string, string | undefined>) => atsTestCandidateEmail(given ?? {
          ATS_TEST_CANDIDATE_EMAIL: process.env.ATS_TEST_CANDIDATE_EMAIL,
          INBOUND_EMAIL_DOMAIN: process.env.INBOUND_EMAIL_DOMAIN,
          INBOUND_USER_DOMAIN: process.env.INBOUND_USER_DOMAIN,
        }),
        adoptAtsTestWorkLease: async () => null,
        atsTestPauseExemptionForId,
        atsTestSkipsDocumentTailoring,
        atsTestSkipsRecruiterLookup,
        isAtsTestAuthorization,
        syntheticAtsTestCvText,
        syntheticAtsTestProfile,
      };
    }
    if (name === "@/lib/db") {
      return { prisma: { application: { findUnique: (args: { where: { id: string } }) => findUnique(args) } } };
    }
    if (name === "@/lib/ai-usage") return { withAiUsageContext: (_c: unknown, run: () => unknown) => run() };
    if (name === "@/lib/scrapers/ats-companies") {
      return { GREENHOUSE_COMPANIES: [], LEVER_COMPANIES: [], ASHBY_COMPANIES: [], WORKABLE_COMPANIES: [], SMARTRECRUITERS_COMPANIES: [] };
    }
    return {};
  }, exports);
  return {
    processApplication: exports.processApplication as (id: string, opts?: unknown) => Promise<void>,
    __setFindUnique(fn: typeof findUnique) { findUnique = fn; },
  };
}

function loadRoute() {
  const js = ts.transpileModule(readFileSync("src/app/api/admin/ats-test-apply/route.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const calls = { historical: 0, processed: [] as string[], origin: 0 };
  const exports: Record<string, unknown> = {};
  new Function("require", "exports", js)((name: string) => {
    const mocks: Record<string, unknown> = {
      "@/lib/application-rollout": {
        historicalRetriesBlocked: () => { calls.historical++; return true; },
      },
      "@/lib/ats-test-capability": {
        atsTestRealSubmitEnabled: () => false,
        atsTestCandidateEmailState: () => atsTestCandidateEmailState(env),
        parseAtsTestDestinations: () => parseAtsTestDestinations(env),
        prepareAndRunAtsTest: async () => ({
          ok: true, mode: "dry_run", applicationId: expectedId, jobId: "job-1",
          destination: dest, adapter: "recruitee",
          result: { id: expectedId, status: "ready_to_apply", submittedVia: null, submitConfirmation: "DRY_RUN", submissionReceiptJson: null, errorMessage: null, submitStartedAt: null },
        }),
      },
      "@/lib/admin": { isAdmin: () => true },
      "@/lib/application-worker": { processApplication: async (id: string) => { calls.processed.push(id); } },
      "@/lib/csrf": { checkOrigin: () => { calls.origin++; return true; } },
      "@/lib/db": { prisma: {} },
      "@/lib/portal-adapters": { findPortalAdapter: () => ({ id: "recruitee" }) },
      "@/lib/session": { getCurrentUser: async () => ({ email: "admin@example.test" }) },
      "next/server": { NextResponse: { json: (body: unknown, options?: { status?: number }) => ({ status: options?.status ?? 200, body }) } },
    };
    if (!(name in mocks)) throw new Error(`unexpected dependency ${name}`);
    return mocks[name];
  }, exports);
  return { route: exports as { POST: (req: unknown) => Promise<{ status: number; body: Record<string, unknown> }>; GET: (req: unknown) => Promise<{ status: number; body: Record<string, unknown> }> }, calls };
}

async function testRoute() {
  const { route, calls } = loadRoute();
  const res = await route.POST({ json: async () => ({}) });
  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
  assert.equal(calls.historical > 0, true, "route consults historicalRetriesBlocked and does not bypass it");
  assert.equal(calls.origin > 0, true, "route checks Origin/Referer");
  assert.deepEqual(calls.processed, [], "route must not call processApplication itself; prepareAndRunAtsTest owns the pipeline");
  const get = await route.GET({});
  assert.equal(get.status, 200);
  assert.equal(get.body.realSubmitEnabled, false);
  assert.deepEqual(get.body.candidateEmail, { configured: true, masked: "o***@example.test", reason: null });
}

async function testRecruiteeFetchMock() {
  const previous = {
    user: process.env.ATS_TEST_USER_ID,
    dest: process.env.ATS_TEST_DESTINATIONS,
    real: process.env.ATS_TEST_REAL_SUBMIT,
    candidate: process.env.ATS_TEST_CANDIDATE_EMAIL,
  };
  process.env.ATS_TEST_USER_ID = TEST_USER;
  process.env.ATS_TEST_DESTINATIONS = env.ATS_TEST_DESTINATIONS;
  process.env.ATS_TEST_CANDIDATE_EMAIL = CANDIDATE_EMAIL;
  delete process.env.ATS_TEST_REAL_SUBMIT;
  const { recruiteeAdapter } = await import("../src/lib/portal-adapters/recruitee");
  const token = await captureToken();
  const profile = { ...syntheticAtsTestProfile(), email: CANDIDATE_EMAIL };
  const calls: Array<{ url: string; method: string }> = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method ?? "GET").toUpperCase();
    calls.push({ url, method });
    if (method === "POST") throw new Error("dry-run must not POST /candidates");
    return {
      ok: true,
      status: 200,
      json: async () => ({ offer: { status: "published", open_questions: [] } }),
      text: async () => "",
    } as Response;
  }) as typeof fetch;
  const { mkdtemp, writeFile: writeDryFile, rm: removeDryDir } = await import("node:fs/promises");
  const dryDir = await mkdtemp("/tmp/lavorai-dry-attachment-");
  const dryCv = `${dryDir}/cv.txt`;
  await writeDryFile(dryCv, "FICTIONAL TEST CV");
  try {
    for (const url of ["https://evil.test/o/job", "https://acme.recruitee.com.evil.test/o/job", "https://user:pass@acme.recruitee.com/o/job", "https://acme.recruitee.com:444/o/job"]) {
      assert.equal(recruiteeAdapter.matches(url), false);
      const before = calls.length;
      const rejected = await recruiteeAdapter.apply({} as never, { profile, userEmail: "test@example.test", cvLocalPath: dryCv, clLocalPath: "", coverLetterText: "", jobUrl: url, dryRun: true });
      assert.equal(rejected.ok, false);
      assert.equal(calls.length, before, "untrusted origin must not be fetched");
    }
    for (const file of [`${dryDir}/missing`, `${dryDir}/empty`]) {
      if (file.endsWith("empty")) await writeDryFile(file, "");
      const refused = await recruiteeAdapter.apply({} as never, { profile, userEmail: "test@example.test", cvLocalPath: file, clLocalPath: "", coverLetterText: "", jobUrl: DEST_URL, dryRun: true });
      assert.equal(refused.ok, false);
      assert.equal(refused.status, "missing_field");
      assert.equal(refused.refusedBeforeSubmit, true);
    }
    const dryOutcome = await recruiteeAdapter.apply({} as never, {
      profile,
      userEmail: "user@example.test",
      cvLocalPath: dryCv,
      clLocalPath: "/tmp/synthetic-cl.txt",
      coverLetterText: `${ATS_TEST_FICTIONAL_MARK} letter`,
      jobUrl: DEST_URL,
      dryRun: true,
      atsTestAuth: token,
      atsTestOwnerUserId: TEST_USER,
      atsTestJobSource: "ats_test",
      applicationId: token.applicationId,
    });
    assert.equal(dryOutcome.ok, true);
    if (dryOutcome.ok) {
      assert.equal(dryOutcome.confirmation, "DRY_RUN");
      assert.equal(dryOutcome.receipt, undefined);
      assert.equal(dryOutcome.offerValidation?.wouldAcceptRealSubmit, true);
    }
    assert.equal(calls.filter((call) => call.method === "POST").length, 0, "dry run makes ZERO submission POSTs");
    assert.ok(calls.some((call) => call.method === "GET" && call.url.includes("/api/offers/")), "read-only offer GET is allowed");
  } finally {
    globalThis.fetch = originalFetch;
    await removeDryDir(dryDir, { recursive: true, force: true });
  }

  process.env.ATS_TEST_REAL_SUBMIT = "true";
  const realTokenDb = fakeDb();
  const realRun = await prepareAndRunAtsTest({ adminOk: true, realSubmit: true, jobUrl: DEST2_URL }, {
    ...realTokenDb,
    env: { ...env, ATS_TEST_REAL_SUBMIT: "true" },
  });
  assert.equal(realRun.ok, true);
  const realToken = realTokenDb.processed()?.opts.atsTestAuth;
  const realCalls: Array<{ url: string; method: string }> = [];
  const originalFetch2 = globalThis.fetch;
  const originalRead = await import("node:fs/promises");
  const readFile = originalRead.readFile;
  const { writeFile, unlink } = originalRead;
  const cvPath = "/tmp/lavorai-ats-test-cv.bin";
  await writeFile(cvPath, Buffer.from("cv"));
  const postedEmails: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method ?? "GET").toUpperCase();
    realCalls.push({ url, method });
    if (method !== "POST") {
      return {
        ok: true,
        status: 200,
        json: async () => ({ offer: { status: "published", open_questions: [] } }),
        text: async () => "",
      } as Response;
    }
    const body = init?.body as FormData | undefined;
    postedEmails.push(String(body?.get?.("candidate[email]") ?? ""));
    return {
      ok: true,
      status: 201,
      json: async () => ({ candidate: { id: "recruitee-receipt" } }),
      text: async () => '{"candidate":{"id":"recruitee-receipt"}}',
    } as Response;
  }) as typeof fetch;
  try {
    const realOutcome = await recruiteeAdapter.apply({} as never, {
      profile,
      userEmail: "user@example.test",
      cvLocalPath: cvPath,
      clLocalPath: cvPath,
      coverLetterText: `${ATS_TEST_FICTIONAL_MARK} letter`,
      jobUrl: DEST2_URL,
      dryRun: false,
      atsTestAuth: realToken,
      atsTestOwnerUserId: TEST_USER,
      atsTestJobSource: "ats_test",
      applicationId: realToken!.applicationId,
    });
    assert.equal(realOutcome.ok, true);
    assert.equal(realCalls.filter((call) => call.method === "POST" && call.url.includes("/candidates")).length, 1, "real submit makes exactly one POST");
    if (realOutcome.ok) assert.equal(realOutcome.receipt?.receiptId, "recruitee-receipt");
    assert.deepEqual(postedEmails, [CANDIDATE_EMAIL]);
    assert.notEqual(postedEmails[0], ATS_TEST_PLACEHOLDER_EMAIL);
    assert.notEqual(postedEmails[0], "user@example.test");
    assert.doesNotMatch(postedEmails[0] ?? "", /inbound\.lavorai\.it|apply\.lavorai\.it|reply\+/);

    const blocked = await recruiteeAdapter.apply({} as never, {
      profile,
      userEmail: "user@example.test",
      cvLocalPath: cvPath,
      clLocalPath: cvPath,
      coverLetterText: "x",
      jobUrl: DEST2_URL,
      dryRun: false,
      atsTestAuth: { userId: TEST_USER, applicationId: realToken!.applicationId },
      atsTestOwnerUserId: "customer",
      atsTestJobSource: "ats_test",
      applicationId: "random-cuid",
    });
    assert.equal(blocked.ok, false);
    assert.equal(realCalls.filter((call) => call.method === "POST" && call.url.includes("/candidates")).length, 1, "failed checks add zero POSTs");

    const mismatch = await recruiteeAdapter.apply({} as never, {
      profile: { ...profile, email: "other@example.test" },
      userEmail: "user@example.test",
      cvLocalPath: cvPath,
      clLocalPath: cvPath,
      coverLetterText: `${ATS_TEST_FICTIONAL_MARK} letter`,
      jobUrl: DEST2_URL,
      dryRun: false,
      atsTestAuth: realToken,
      atsTestOwnerUserId: TEST_USER,
      atsTestJobSource: "ats_test",
      applicationId: realToken!.applicationId,
    });
    assert.equal(mismatch.ok, false);
    if (!mismatch.ok) assert.match(mismatch.error, /ats_test_candidate_email_mismatch/);
    assert.equal(realCalls.filter((call) => call.method === "POST" && call.url.includes("/candidates")).length, 1, "recheck email mismatch makes zero POSTs");

    const offerCalls: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const method = (init?.method ?? "GET").toUpperCase();
      offerCalls.push(method);
      if (method === "POST") throw new Error("unsupported offer must not POST");
      return {
        ok: true,
        status: 200,
        json: async () => ({ offer: { status: "published", options_phone: "required", options_photo: "required", open_questions: [] } }),
        text: async () => "",
      } as Response;
    }) as typeof fetch;
    const phonePhoto = await recruiteeAdapter.apply({} as never, {
      profile,
      userEmail: CANDIDATE_EMAIL,
      cvLocalPath: cvPath,
      clLocalPath: cvPath,
      coverLetterText: `${ATS_TEST_FICTIONAL_MARK} letter`,
      jobUrl: DEST2_URL,
      dryRun: true,
      atsTestAuth: realToken,
      atsTestOwnerUserId: TEST_USER,
      atsTestJobSource: "ats_test",
      applicationId: realToken!.applicationId,
    });
    assert.equal(phonePhoto.ok, false);
    if (!phonePhoto.ok) {
      assert.equal(phonePhoto.status, "not_eligible");
      assert.equal(phonePhoto.refusedBeforeSubmit, true);
      assert.ok(phonePhoto.offerValidation?.unsupportedRequired.includes("phone"));
      assert.ok(phonePhoto.offerValidation?.unsupportedRequired.includes("photo"));
      assert.equal(phonePhoto.offerValidation?.wouldAcceptRealSubmit, false);
    }
    assert.equal(offerCalls.filter((method) => method === "POST").length, 0);
  } finally {
    globalThis.fetch = originalFetch2;
    await unlink(cvPath).catch(() => undefined);
    void readFile;
    if (previous.user === undefined) delete process.env.ATS_TEST_USER_ID; else process.env.ATS_TEST_USER_ID = previous.user;
    if (previous.dest === undefined) delete process.env.ATS_TEST_DESTINATIONS; else process.env.ATS_TEST_DESTINATIONS = previous.dest;
    if (previous.real === undefined) delete process.env.ATS_TEST_REAL_SUBMIT; else process.env.ATS_TEST_REAL_SUBMIT = previous.real;
    if (previous.candidate === undefined) delete process.env.ATS_TEST_CANDIDATE_EMAIL; else process.env.ATS_TEST_CANDIDATE_EMAIL = previous.candidate;
  }
}

function testOrdinaryGatesWithoutToken() {
  const previous = process.env.APPLICATIONS_PAUSED;
  delete process.env.APPLICATIONS_PAUSED;
  try {
    assert.equal(applicationsPaused(), false);
    const row = gateRow();
    assert.equal(currentWorkerIneligibility(row), "privacy_consent_missing");
    const withConsent = gateRow({
      user: { ...row.user, privacyConsentAt: new Date(), emailVerified: new Date() },
    });
    assert.equal(currentWorkerIneligibility(withConsent), "auto_apply_not_enabled");
  } finally {
    if (previous === undefined) delete process.env.APPLICATIONS_PAUSED; else process.env.APPLICATIONS_PAUSED = previous;
  }
}

function testOfferValidationAndHeldRetry() {
  assert.deepEqual(recruiteeOfferValidation({
    options_cv: "required",
    options_cover_letter: "optional",
    open_questions: [],
  }, { coverLetterText: "x" }).unsupportedRequired, []);
  const phone = recruiteeOfferValidation({ options_phone: "required", open_questions: [] }, {});
  assert.ok(phone.unsupportedRequired.includes("phone"));
  assert.equal(phone.wouldAcceptRealSubmit, false);
  const photo = recruiteeOfferValidation({ options_photo: "required", open_questions: [] }, {});
  assert.ok(photo.unsupportedRequired.includes("photo"));
  const other = recruiteeOfferValidation({ options_salary: "required", open_questions: [] }, {});
  assert.ok(other.unsupportedRequired.includes("salary"));
  const fileQ = recruiteeOfferValidation({
    open_questions: [{ id: 1, kind: "file", required: true, body: "Upload ID" }],
  }, {});
  assert.ok(fileQ.unsupportedRequired.includes("open_question:file"));

  assert.equal(atsTestPriorAttemptReason([{
    id: expectedId, userId: TEST_USER, submitConfirmation: ATS_TEST_REFUSED_BEFORE_SUBMIT,
  }], "dry_run", env), null);
}

function testCronDrainStayPaused() {
  const previous = process.env.APPLICATIONS_PAUSED;
  process.env.APPLICATIONS_PAUSED = "true";
  try {
    assert.equal(applicationsPaused(), true);
    const cronSrc = readFileSync("src/lib/auto-apply-cron.ts", "utf8");
    assert.match(cronSrc, /if \(applicationsPaused\(\) \|\| automaticApplicationsBlocked\(\)\) return/);
    assert.doesNotMatch(cronSrc, /atsTestAuth|atsTestPauseExemption/);
    const drainSrc = readFileSync("src/lib/queue-drain.ts", "utf8");
    assert.match(drainSrc, /if \(applicationsPaused\(\) \|\| rolloutCreationBlocked\(\)\) return/);
    assert.doesNotMatch(drainSrc, /atsTestAuth|atsTestPauseExemption/);
    const claimSrc = readFileSync("src/lib/application-claim.ts", "utf8");
    assert.match(claimSrc, /if \(applicationsPaused\(\)/);
    assert.doesNotMatch(claimSrc, /atsTestAuth|atsTestPauseExemption/);
    const quotaSrc = readFileSync("src/lib/email-quota.ts", "utf8");
    assert.match(quotaSrc, /if \(applicationsPaused\(\) && \["cv_ready", "application_sent"/);
    assert.doesNotMatch(quotaSrc, /atsTestAuth|atsTestPauseExemption/);
    const recruiterSrc = readFileSync("src/lib/recruiter-delivery.ts", "utf8");
    assert.doesNotMatch(recruiterSrc, /atsTestAuth|atsTestPauseExemption/);
    const cronRoute = readFileSync("src/app/api/cron/auto-apply/route.ts", "utf8");
    assert.match(cronRoute, /if \(applicationsPaused\(\)\) return/);
    const drainRoute = readFileSync("src/app/api/cron/drain-queue/route.ts", "utf8");
    assert.match(drainRoute, /if \(applicationsPaused\(\)\) return/);
  } finally {
    if (previous === undefined) delete process.env.APPLICATIONS_PAUSED; else process.env.APPLICATIONS_PAUSED = previous;
  }
}

async function testRefusedRetryAtMostOnceClaim() {
  const refusedExisting = {
    id: expectedId,
    userId: TEST_USER,
    status: "ready_to_apply",
    submitConfirmation: ATS_TEST_REFUSED_BEFORE_SUBMIT,
    submitStartedAt: null,
    submittedAt: null,
    submittedVia: null,
  };

  const claimDb = fakeDb({ existing: [refusedExisting] });
  const originalUpdate = claimDb.prisma.application.updateMany.bind(claimDb.prisma.application);
  let entered = 0;
  let releaseBarrier!: () => void;
  const barrier = new Promise<void>((resolve) => { releaseBarrier = resolve; });
  claimDb.prisma.application.updateMany = async (args) => {
    if (args.data?.submitConfirmation === ATS_TEST_CLAIMED) {
      entered++;
      if (entered === 2) releaseBarrier();
      await barrier;
    }
    return originalUpdate(args);
  };
  const [left, right] = await Promise.all([
    claimAtsTestAttempt(claimDb.prisma, expectedId),
    claimAtsTestAttempt(claimDb.prisma, expectedId),
  ]);
  const wins = [left, right].filter((result) => result.ok);
  const losses = [left, right].filter((result) => !result.ok);
  assert.equal(entered, 2, "both retries reached the claim");
  assert.equal(wins.length, 1, "exactly one claim succeeds");
  assert.equal(losses.length, 1);
  if (!losses[0].ok) assert.equal(losses[0].reason, ATS_TEST_IN_PROGRESS);
  assert.equal(claimDb.apps()[0].submitConfirmation, ATS_TEST_CLAIMED);
  assert.equal(claimDb.apps()[0].status, "optimizing");
  assert.ok(atsTestClaimWhere(expectedId));

  const { recruiteeAdapter } = await import("../src/lib/portal-adapters/recruitee");

  async function runConcurrentRetries(mode: "dry_run" | "real_submit") {
    const previous = {
      user: process.env.ATS_TEST_USER_ID,
      dest: process.env.ATS_TEST_DESTINATIONS,
      real: process.env.ATS_TEST_REAL_SUBMIT,
      candidate: process.env.ATS_TEST_CANDIDATE_EMAIL,
    };
    process.env.ATS_TEST_USER_ID = TEST_USER;
    process.env.ATS_TEST_DESTINATIONS = env.ATS_TEST_DESTINATIONS;
    process.env.ATS_TEST_CANDIDATE_EMAIL = CANDIDATE_EMAIL;
    if (mode === "real_submit") process.env.ATS_TEST_REAL_SUBMIT = "true";
    else delete process.env.ATS_TEST_REAL_SUBMIT;
    const { writeFile, unlink } = await import("node:fs/promises");
    const cvPath = "/tmp/lavorai-ats-test-claim-cv.bin";
    await writeFile(cvPath, Buffer.from("cv"));
    const posts: string[] = [];
    const processCalls = { count: 0 };
    const submitCalls = { count: 0 };
    let enteredClaim = 0;
    let releaseClaim!: () => void;
    const claimBarrier = new Promise<void>((resolve) => { releaseClaim = resolve; });
    const db = fakeDb({
      existing: [{ ...refusedExisting }],
      submitCalls,
      processApplication: async (id, flags, apps) => {
        processCalls.count++;
        const originalFetch = globalThis.fetch;
        globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
          const method = (init?.method ?? "GET").toUpperCase();
          if (method === "POST") {
            posts.push(String(input));
            return {
              ok: true,
              status: 201,
              json: async () => ({ candidate: { id: "recruitee-receipt" } }),
              text: async () => '{"candidate":{"id":"recruitee-receipt"}}',
            } as Response;
          }
          return {
            ok: true,
            status: 200,
            json: async () => ({ offer: { status: "published", open_questions: [] } }),
            text: async () => "",
          } as Response;
        }) as typeof fetch;
        try {
          const token = flags.atsTestAuth;
          const profile = { ...syntheticAtsTestProfile(), email: CANDIDATE_EMAIL };
          const outcome = await recruiteeAdapter.apply({} as never, {
            profile,
            userEmail: "user@example.test",
            cvLocalPath: cvPath,
            clLocalPath: cvPath,
            coverLetterText: `${ATS_TEST_FICTIONAL_MARK} letter`,
            jobUrl: DEST_URL,
            dryRun: mode === "dry_run",
            atsTestAuth: token,
            atsTestOwnerUserId: TEST_USER,
            atsTestJobSource: "ats_test",
            applicationId: id,
          });
          const app = apps.find((row) => row.id === id);
          if (app && outcome.ok) {
            app.status = mode === "real_submit" ? "success" : "ready_to_apply";
            app.submitConfirmation = mode === "real_submit" ? "DETECTED_HTTP_201" : "DRY_RUN";
          }
        } finally {
          globalThis.fetch = originalFetch;
        }
      },
    });
    const original = db.prisma.application.updateMany.bind(db.prisma.application);
    db.prisma.application.updateMany = async (args) => {
      if (args.data?.submitConfirmation === ATS_TEST_CLAIMED) {
        enteredClaim++;
        if (enteredClaim === 2) releaseClaim();
        await claimBarrier;
      }
      return original(args);
    };
    const runEnv = mode === "real_submit" ? { ...env, ATS_TEST_REAL_SUBMIT: "true" } : env;
    try {
      const [first, second] = await Promise.all([
        prepareAndRunAtsTest({ adminOk: true, realSubmit: mode === "real_submit", jobUrl: DEST_URL }, { ...db, env: runEnv }),
        prepareAndRunAtsTest({ adminOk: true, realSubmit: mode === "real_submit", jobUrl: DEST_URL }, { ...db, env: runEnv }),
      ]);
      const ok = [first, second].filter((run) => run.ok);
      const denied = [first, second].filter((run) => !run.ok);
      assert.equal(enteredClaim, 2, `${mode}: both retries reached the claim`);
      assert.equal(ok.length, 1, `${mode}: exactly one retry proceeds`);
      assert.equal(denied.length, 1, `${mode}: loser is 409`);
      if (!denied[0].ok) assert.equal(denied[0].reason, ATS_TEST_IN_PROGRESS);
      assert.equal(processCalls.count, 1, `${mode}: processApplication once`);
      if (mode === "dry_run") {
        assert.equal(posts.length, 0, "dry-run retries make zero POSTs");
      } else {
        assert.equal(posts.length, 1, "real-submit retries POST exactly once");
      }
    } finally {
      await unlink(cvPath).catch(() => undefined);
      if (previous.user === undefined) delete process.env.ATS_TEST_USER_ID; else process.env.ATS_TEST_USER_ID = previous.user;
      if (previous.dest === undefined) delete process.env.ATS_TEST_DESTINATIONS; else process.env.ATS_TEST_DESTINATIONS = previous.dest;
      if (previous.real === undefined) delete process.env.ATS_TEST_REAL_SUBMIT; else process.env.ATS_TEST_REAL_SUBMIT = previous.real;
      if (previous.candidate === undefined) delete process.env.ATS_TEST_CANDIDATE_EMAIL; else process.env.ATS_TEST_CANDIDATE_EMAIL = previous.candidate;
    }
  }

  await runConcurrentRetries("dry_run");
  await runConcurrentRetries("real_submit");

  const uncertainDb = fakeDb({
    existing: [{
      id: expectedId,
      userId: TEST_USER,
      status: "applying",
      submitConfirmation: "SUBMISSION_STARTED",
      submitStartedAt: new Date(),
    }],
    submitCalls: { count: 0 },
  });
  const uncertainCalls = { count: 0 };
  uncertainDb.submitCalls.count = 0;
  const afterUncertain = await prepareAndRunAtsTest({ adminOk: true, jobUrl: DEST_URL }, {
    ...fakeDb({
      submitCalls: uncertainCalls,
      existing: [{
        id: expectedId,
        userId: TEST_USER,
        status: "applying",
        submitConfirmation: "SUBMISSION_STARTED",
        submitStartedAt: new Date(),
      }],
    }),
    env,
  });
  assert.equal(afterUncertain.ok, false);
  if (!afterUncertain.ok) assert.equal(afterUncertain.reason, "uncertain_submit_started");
  assert.equal(uncertainCalls.count, 0, "uncertain result then retry is still blocked");
  void uncertainDb;
}

function testAtsTestNoticeGuardsInWorker() {
  const worker = readFileSync(new URL("../src/lib/application-worker.ts", import.meta.url), "utf8");
  assert.match(worker, /function isAtsTestNoticeSuppressed/);
  assert.match(worker, /ATS test mode=dry_run; no careers API POST/);
  assert.match(worker, /if \(isAtsTestNoticeSuppressed\(atsTestAuth\)\) return;/);
  assert.match(worker, /notifyNeedsAnswers\(applicationId, atsTestAuth\)/);
  assert.match(worker, /notifyApplicationManual\(applicationId, atsTestAuth\)/);
  assert.match(worker, /Token path never substitutes recruiter-email or user notices/);
  assert.match(worker, /leaseToken: null, leaseExpiresAt: null/);
  assert.doesNotMatch(
    worker,
    /notifyNeedsAnswers\(applicationId\)\.catch/,
    "needs-answers notify must receive the token so it can return before side effects",
  );
}

async function main() {
  // Execute the actual worker handoff block: no recruiter/browser continuation.
  const source = readFileSync("src/lib/application-worker.ts", "utf8");
  const start = source.indexOf("  if (requiresRecruiteeOriginReview(");
  const end = source.indexOf("  const recruiterLookup =", start);
  assert.ok(start > 0 && end > start);
  const writes: unknown[] = [];
  const guard = new Function("requiresRecruiteeOriginReview", "prisma", "liveLeaseFields", "NOT_SUBMITTED", `return async function(app, resolvedUrl, adapter) {
    const applicationId = 'synthetic', workToken = 'lease';
    ${source.slice(start, end)}
    return 'continued';
  }`)(requiresRecruiteeOriginReview, { application: { updateMany: async (data: unknown) => { writes.push(data); return { count: 1 }; } } }, () => ({ leaseToken: "lease" }), "NOT_SUBMITTED");
  assert.equal(await guard({ job: { url: "https://careers.employer.test/o/engineer", source: "recruitee" } }, "https://careers.employer.test/o/engineer", null), undefined);
  assert.equal(writes.length, 1);
  assert.deepEqual((writes[0] as { where: unknown }).where, { id: "synthetic", leaseToken: "lease", status: "ready_to_apply" });
  assert.equal((writes[0] as { data: { leaseToken: unknown } }).data.leaseToken, null);
  assert.equal(await guard({ job: { url: DEST_URL, source: "recruitee" } }, DEST_URL, { id: "recruitee" }), "continued");
  await testPrepareAndRun();
  await testFourSubmitChecks();
  await testConcurrentAndUncertainRetry();
  await testRefusedRetryAtMostOnceClaim();
  await testPauseExemptionNotInheritable();
  await testRoute();
  await testRecruiteeFetchMock();
  testOrdinaryGatesWithoutToken();
  testOfferValidationAndHeldRetry();
  testCronDrainStayPaused();
  testAtsTestNoticeGuardsInWorker();
  console.log("PASS ats-test-capability: branded token, pause skip only on that path, deterministic PK, dry-run zero POST, real one POST, candidate email, offer validation, at-most-once claim, fakes");
}

main().catch((error) => { console.error(error); process.exit(1); });
