import * as customerRollout from "../src/lib/customer-rollout";
/**
 * Answer-resumption handoffs: a skip-list (Ashby) answers_claimed row must
 * become a visible manual user-action and drop its quota reservation, and a
 * continuation_proof_missing refusal must persist the same kind of state.
 * In-memory fakes only — no network, no real database, no real send.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { queueAnswerContinuation } from "../src/lib/application-worker-gates";
import * as continuation from "../src/lib/application-answer-continuation";
import { CONTINUATION_PROOF_MISSING_MESSAGE } from "../src/lib/application-answer-continuation";
import * as skipHosts from "../src/lib/ats-skip-hosts";
import { SKIPPED_ATS_MANUAL_MESSAGE } from "../src/lib/ats-skip-hosts";
import * as applicationLease from "../src/lib/application-lease";
import {
  isQuotaExcludedHandoffOrHold,
  isWeeklyQuotaReservation,
  occupiesWeeklyQuotaSlot,
} from "../src/lib/daily-application-cap";
import { submissionSubjectKey } from "../src/lib/application-submission-budget";
import { applicationRolloutConfig } from "../src/lib/application-rollout";

const ASHBY_URL = "https://jobs.ashbyhq.com/acme/93455a8c-fbc5-4421-986b-9a63e3f22b36";
const GH_URL = "https://boards.greenhouse.io/acme/jobs/123";

function match(value: unknown, condition: unknown): boolean {
  if (condition === null || typeof condition !== "object" || condition instanceof Date) {
    return value instanceof Date && condition instanceof Date ? +value === +condition : value === condition;
  }
  return Object.entries(condition as Record<string, unknown>).every(([key, expected]) => {
    if (key === "gt") return value != null && +value > +(expected as Date);
    if (key === "gte") return value != null && +value >= +(expected as Date);
    if (key === "lt") return value != null && +value < +(expected as Date);
    if (key === "lte") return value != null && +value <= +(expected as Date);
    if (key === "in") return Array.isArray(expected) && expected.includes(value);
    if (key === "notIn") return Array.isArray(expected) && !expected.includes(value);
    if (key === "not") return expected === null ? value != null : !match(value, expected);
    if (key === "OR") return Array.isArray(expected) && expected.some((clause) => match(value, clause));
    if (key === "AND") return Array.isArray(expected) && expected.every((clause) => match(value, clause));
    return match((value as Record<string, unknown>)?.[key], expected);
  });
}

function makeRow(overrides: Record<string, unknown> = {}) {
  const now = Date.now();
  const startedAt = new Date(now - 5 * 60_000);
  return {
    id: "app-resume",
    userId: "u1",
    jobId: "j1",
    sessionId: null,
    session: null,
    cvDocxPath: null,
    createdAt: new Date(now - 60 * 60_000),
    consentGrantedAt: new Date(now - 30 * 60_000),
    retryCount: 0,
    status: "answers_claimed",
    startedAt,
    leaseToken: "lease-resume-1",
    leaseExpiresAt: new Date(now + 8 * 60_000),
    submitStartedAt: null,
    completedAt: null,
    submittedAt: null,
    submittedVia: null,
    submitConfirmation: "NOT_SUBMITTED",
    submissionReceiptJson: null,
    answerContinuationJson: null as string | null,
    pendingQuestionsJson: JSON.stringify([{ label: "Why this role?", kind: "textarea" }]),
    userProvidedAnswersJson: null as string | null,
    canaryLog: null,
    answersUsedJson: null,
    viewedAt: null,
    lastReplyAt: null,
    replyCount: 0,
    userStatus: null,
    errorMessage: null as string | null,
    recruiterEmailRecheckedAt: null as Date | null,
    job: {
      id: "j1",
      closedAt: null,
      url: ASHBY_URL,
      recruiterEmail: null,
      company: "Acme",
      title: "Engineer",
      description: "Build things",
      location: "Milano",
      remote: true,
      contractType: null,
      salaryMin: null,
      salaryMax: null,
      recruiterEmailSourceUrl: null,
      companyWebsite: null,
    },
    user: {
      id: "u1",
      email: "candidate@example.test",
      name: "Alex",
      yearsExperience: 3,
      englishLevel: null,
      noticePeriod: null,
      tier: "free",
      createdAt: new Date(now - 30 * 86400_000),
      trialEndsAt: null,
      trialGraceEndsAt: null,
      subscriptionStatus: "canceled",
      currentPeriodEnd: null,
      pausedUntil: null,
      suspendedAt: null,
      emailVerified: new Date(now - 86400_000),
      privacyConsentAt: new Date(now - 86400_000),
      avoidCompanies: null,
      cvProfile: null,
      cvDocuments: [],
      portalSessions: [],
      preferences: {
        autoApplyMode: "hybrid",
        rolesJson: "[]",
        locationsJson: "[]",
        applicationAnswersJson: null,
        employmentType: null,
        salaryMin: null,
        matchMin: 0,
        sourcesJson: null,
      },
    },
    ...overrides,
  };
}

function fakeLockedDb(row: ReturnType<typeof makeRow>) {
  const apply = (data: Record<string, unknown>) => Object.assign(row, data);
  const tx = {
    $queryRaw: async () => [],
    application: {
      findUnique: async () => row,
      findFirst: async () => null,
      findMany: async () => [],
      count: async () => 0,
      update: async ({ data }: { data: Record<string, unknown> }) => apply(data),
      updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        if (!match(row, where)) return { count: 0 };
        apply(data);
        return { count: 1 };
      },
    },
    applicationSubmissionReservation: {
      findMany: async () => [{
        id: "r1",
        applicationId: row.id,
        subjectKey: submissionSubjectKey(row.userId, row.jobId),
        channel: "portal_ashby",
        attemptStartedAt: row.startedAt,
        rolloutStartedAt: applicationRolloutConfig().startedAt!,
      }],
      findFirst: async () => null,
    },
    applicationEmailAttempt: { findFirst: async () => null },
    job: { findMany: async () => [{ id: row.jobId, url: row.job.url }] },
    userAnswer: { findMany: async () => [] },
  };
  return {
    application: {
      findUnique: async () => ({ userId: row.userId, sessionId: row.sessionId, jobId: row.jobId }),
    },
    $transaction: async (fn: (t: typeof tx) => unknown) => fn(tx),
  } as never;
}

function loadWorker(opts: {
  row: ReturnType<typeof makeRow>;
  inbox?: unknown;
  reserved?: string[];
}) {
  const reserved = opts.reserved ?? [];
  const prisma = {
    application: {
      findUnique: async () => opts.row,
      updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        if (!match(opts.row, where)) return { count: 0 };
        Object.assign(opts.row, data);
        return { count: 1 };
      },
    },
    job: { update: async () => ({}) },
  };
  const mocks: Record<string, unknown> = {
    "./customer-rollout": customerRollout,
    "@/lib/application-pause": { applicationsPaused: () => false, assertApplicationsRunning: () => undefined },
    "@/lib/ai-usage": { withAiUsageContext: (_ctx: unknown, run: () => unknown) => run() },
    "@/lib/db": { prisma },
    "@/lib/skip-list-email-lookup": { lookupPublishedSkipListInbox: async () => opts.inbox ?? null },
    "@/lib/ats-skip-hosts": skipHosts,
    "@/lib/scrapers/ats-companies": {
      GREENHOUSE_COMPANIES: [], LEVER_COMPANIES: [], ASHBY_COMPANIES: [],
      WORKABLE_COMPANIES: [], SMARTRECRUITERS_COMPANIES: [],
    },
    "@/lib/application-worker-gates": {
      reserveApplicationWork: async (id: string) => { reserved.push(id); return null; },
      attestAnswerPause: async () => false,
      beginApplicationSubmission: async () => false,
      completeApplicationSubmission: async () => false,
      recheckApplicationSubmission: async () => false,
      NOT_SUBMITTED: "NOT_SUBMITTED",
    },
    "@/lib/ats-test-capability": {
      isAtsTestAuthorization: () => false,
      atsTestPauseExemptionForId: () => false,
      adoptAtsTestWorkLease: async () => null,
      atsTestSkipsDocumentTailoring: () => false,
      atsTestSkipsRecruiterLookup: () => false,
      atsTestCandidateEmail: () => ({ ok: false, reason: "ats_test_candidate_email_unconfigured" }),
      syntheticAtsTestProfile: () => ({}),
      syntheticAtsTestCvText: () => "",
      ATS_TEST_FICTIONAL_MARK: "[LavorAI TEST · FICTIONAL]",
      ATS_TEST_REFUSED_BEFORE_SUBMIT: "REFUSED_BEFORE_SUBMIT",
    },
    "@/lib/application-lease": applicationLease,
    "@/lib/application-answer-continuation": continuation,
    "@/lib/proof-of-send": { notSubmitted: () => ({}) },
  };
  const js = ts.transpileModule(readFileSync("src/lib/application-worker.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const exports: Record<string, unknown> = {};
  new Function("require", "exports", js)((name: string) => mocks[name] ?? {}, exports);
  return {
    processApplication: exports.processApplication as (id: string) => Promise<void>,
    reserved,
  };
}

function assertReleasedHandoff(row: ReturnType<typeof makeRow>, message: string) {
  assert.equal(row.status, "ready_to_apply");
  assert.equal(row.errorMessage, message);
  assert.ok(row.errorMessage && row.errorMessage.length > 20, "visible reason");
  assert.equal(row.startedAt, null);
  assert.equal(row.leaseToken, null);
  assert.equal(row.leaseExpiresAt, null);
  assert.ok(row.completedAt instanceof Date);
  assert.equal(isQuotaExcludedHandoffOrHold(row), true);
  assert.equal(isWeeklyQuotaReservation(row), false);
  assert.equal(occupiesWeeklyQuotaSlot(row), false);
}

async function main() {
  delete process.env.APPLICATIONS_PAUSED;
  process.env.APPLICATION_SENDING_MODE = "automatic";
  process.env.APPLICATION_ROLLOUT_START_AT = new Date(Date.now() - 3_600_000).toISOString();

  const claimed = makeRow();
  assert.equal(isWeeklyQuotaReservation(claimed), true, "answers_claimed holds a weekly reservation before handoff");
  assert.equal(occupiesWeeklyQuotaSlot(claimed), true);
  const worker = loadWorker({ row: claimed });
  await worker.processApplication(claimed.id);
  assert.deepEqual(worker.reserved, [], "skip-list miss must not reserve work");
  assertReleasedHandoff(claimed, SKIPPED_ATS_MANUAL_MESSAGE);
  assert.ok(claimed.recruiterEmailRecheckedAt instanceof Date);

  const queuedSkip = makeRow({
    status: "queued",
    startedAt: null,
    leaseToken: null,
    leaseExpiresAt: null,
    submitConfirmation: null,
    errorMessage: null,
  });
  await loadWorker({ row: queuedSkip }).processApplication(queuedSkip.id);
  assertReleasedHandoff(queuedSkip, SKIPPED_ATS_MANUAL_MESSAGE);

  const alreadySent = makeRow({ submittedAt: new Date() });
  const sentBefore = { ...alreadySent };
  await loadWorker({ row: alreadySent }).processApplication(alreadySent.id);
  assert.equal(alreadySent.status, "answers_claimed");
  assert.equal(alreadySent.errorMessage, sentBefore.errorMessage);
  assert.equal(alreadySent.leaseToken, "lease-resume-1");

  const greenhouse = makeRow({ job: { ...makeRow().job, url: GH_URL } });
  const ghWorker = loadWorker({ row: greenhouse });
  await ghWorker.processApplication(greenhouse.id);
  assert.deepEqual(ghWorker.reserved, [greenhouse.id], "non-skip-list rows still go through reserve");
  assert.equal(greenhouse.status, "answers_claimed");

  const missing = makeRow({
    status: "needs_answers",
    answerContinuationJson: null,
    submitConfirmation: "NEEDS_ANSWERS",
  });
  assert.equal(
    await queueAnswerContinuation({
      applicationId: missing.id,
      userId: missing.userId,
      proofDigest: "a".repeat(64),
      expectedAnswersJson: missing.userProvidedAnswersJson,
    }, fakeLockedDb(missing)),
    "continuation_proof_missing",
  );
  assertReleasedHandoff(missing, CONTINUATION_PROOF_MISSING_MESSAGE);
  assert.equal(missing.submitConfirmation, "NOT_SUBMITTED");

  const unparseable = makeRow({
    status: "needs_answers",
    answerContinuationJson: "{not-json",
    submitConfirmation: "NOT_SUBMITTED",
  });
  assert.equal(
    await queueAnswerContinuation({
      applicationId: unparseable.id,
      userId: unparseable.userId,
      proofDigest: "b".repeat(64),
      expectedAnswersJson: unparseable.userProvidedAnswersJson,
    }, fakeLockedDb(unparseable)),
    "continuation_proof_missing",
  );
  assertReleasedHandoff(unparseable, CONTINUATION_PROOF_MISSING_MESSAGE);

  const submitted = makeRow({
    status: "needs_answers",
    answerContinuationJson: null,
    submittedAt: new Date(),
    submitConfirmation: "NOT_SUBMITTED",
  });
  assert.equal(
    await queueAnswerContinuation({
      applicationId: submitted.id,
      userId: submitted.userId,
      proofDigest: "c".repeat(64),
      expectedAnswersJson: submitted.userProvidedAnswersJson,
    }, fakeLockedDb(submitted)),
    "uncertain_submission",
  );
  assert.equal(submitted.status, "needs_answers", "a sent row must not be rewritten as a handoff");
  assert.notEqual(submitted.errorMessage, CONTINUATION_PROOF_MISSING_MESSAGE);

  console.log("PASS answer-resume-handoff: skip-list answers_claimed and continuation_proof_missing become visible user-action, lease released, quota free");
}

main().catch((err) => { console.error(err); process.exit(1); });
