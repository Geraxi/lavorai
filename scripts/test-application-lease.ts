import * as providerPolicy from "../src/lib/application-provider-policy";
/**
 * Expiring application leases: takeover rejects the old worker's submit,
 * a live lease is not stolen, and submit_started is never auto-retried.
 * In-memory fakes only — no network, no real database.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as rollout from "../src/lib/application-rollout";
import * as continuation from "../src/lib/application-answer-continuation";
import * as paidPriority from "../src/lib/paid-priority";
import * as skipHosts from "../src/lib/ats-skip-hosts";
import * as drainLimits from "../src/lib/drain-limits";
import * as sendability from "../src/lib/queue-sendability";
import * as billing from "../src/lib/billing";
import { hasPotentialSubmission, reserveApplicationWork } from "../src/lib/application-worker-gates";
import * as applicationLease from "../src/lib/application-lease";
import * as recoveryRelease from "../src/lib/application-recovery-release";
import { attachMemoryRelease } from "../src/lib/application-recovery-release";
import * as uncertainSubmission from "../src/lib/uncertain-submission";
import {
  APPLICATION_LEASE_MS, asWorkLease, expiredLeaseWhere, issueApplicationLease,
  liveLeaseFields, renewLeaseData,
} from "../src/lib/application-lease";

process.env.APPLICATION_SENDING_MODE = "automatic";
process.env.APPLICATION_ROLLOUT_START_AT = new Date(Date.now() - 3_600_000).toISOString();
process.env.APPLY_GLOBAL_DAILY_CAP = "10";
process.env.APPLICATION_RECOVERY_RELEASE = "takeover";
delete process.env.APPLICATIONS_PAUSED;
delete process.env.DRAIN_MAX_ATTEMPTS;

const start = new Date(process.env.APPLICATION_ROLLOUT_START_AT);
const freshAt = new Date(+start + 60_000);
const now = new Date();

function loadClaim(prisma: unknown) {
  const dependencies: Record<string, unknown> = {
    "./application-provider-policy": providerPolicy,
    "@/lib/application-rollout": rollout,
    "@/lib/application-pause": { applicationsPaused: () => false },
    "@/lib/application-answer-continuation": continuation,
    "./application-answer-continuation": continuation,
    "@/lib/paid-priority": paidPriority,
    "@/lib/drain-limits": drainLimits,
    "@/lib/queue-sendability": sendability,
    "@/lib/ats-skip-hosts": skipHosts,
    "@/lib/billing": billing,
    "@/lib/application-worker-gates": { hasPotentialSubmission },
    "@/lib/job-liveness": { JOB_LIVENESS_UNKNOWN_HELD_MESSAGE: "liveness-held" },
    "@/lib/application-lease": applicationLease,
    "./application-lease": applicationLease,
    "@/lib/application-recovery-release": recoveryRelease,
    "@/lib/uncertain-submission": uncertainSubmission,
    "@/lib/db": { prisma },
  };
  const module = { exports: {} as Record<string, unknown> };
  const code = ts.transpileModule(readFileSync("src/lib/application-claim.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(code, {
    module, exports: module.exports, Date, Map, Set, URL, console,
    process: { env: process.env },
    require: (name: string) => {
      if (!(name in dependencies)) throw new Error(`Unexpected dependency ${name}`);
      return dependencies[name];
    },
  }, { filename: "src/lib/application-claim.ts" });
  return module.exports as {
    claimApplication: (id: string) => Promise<boolean>;
    recoverStuckApplications: () => Promise<number>;
    recoverExpiredQueuedClaims: (now?: Date) => Promise<number>;
    findClaimableQueued: (limit: number) => Promise<string[]>;
  };
}

function match(value: any, condition: any): boolean {
  if (condition === null || typeof condition !== "object" || condition instanceof Date) {
    return value instanceof Date && condition instanceof Date ? +value === +condition : value === condition;
  }
  return Object.entries(condition).every(([key, expected]: [string, any]) => {
    if (key === "gt") return value != null && +value > +expected;
    if (key === "gte") return value != null && +value >= +expected;
    if (key === "lt") return value != null && +value < +expected;
    if (key === "lte") return value != null && +value <= +expected;
    if (key === "in") return expected.includes(value);
    if (key === "notIn") return !expected.includes(value);
    if (key === "not") return expected === null ? value != null : !match(value, expected);
    if (key === "OR") return expected.some((c: any) => match(value, c));
    if (key === "AND") return expected.every((c: any) => match(value, c));
    return match(value?.[key], expected);
  });
}

function sendableUser() {
  return {
    name: "Alex Example", yearsExperience: 5, englishLevel: null, noticePeriod: null,
    tier: "pro", email: "paid@example.test", subscriptionStatus: "active",
    createdAt: new Date("2025-01-01"), trialEndsAt: null, trialGraceEndsAt: null,
    currentPeriodEnd: new Date(+now + 30 * 86400_000), pausedUntil: null, suspendedAt: null,
    emailVerified: freshAt, privacyConsentAt: freshAt,
    preferences: { autoApplyMode: "auto" },
  };
}

function row(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id, userId: "paid", jobId: `job-${id}`, sessionId: "round", status: "queued",
    createdAt: freshAt, consentGrantedAt: freshAt,
    answerContinuationJson: null, retryCount: 0, startedAt: null, leaseToken: null, leaseExpiresAt: null,
    submitStartedAt: null, completedAt: null,
    submittedAt: null, submittedVia: null, submitConfirmation: null, canaryLog: null,
    answersUsedJson: null, viewedAt: null, lastReplyAt: null, replyCount: 0, userStatus: null,
    errorMessage: null, cvDocxPath: null, submissionReceiptJson: null,
    userProvidedAnswersJson: null, pendingQuestionsJson: null,
    job: {
      closedAt: null, url: `https://boards.greenhouse.io/acme/jobs/${id}`, recruiterEmail: null,
      company: "Acme", title: "Designer", description: "Role", location: "Milano",
      remote: false, contractType: "employee", salaryMin: 60000, salaryMax: 70000,
    },
    session: { id: "round", userId: "paid", status: "active", sentCount: 0, targetCount: 30, title: "Designer", label: "Design" },
    user: sendableUser(),
    ...overrides,
  };
}

function database(initial: ReturnType<typeof row>[]) {
  const rows = structuredClone(initial);
  const application = {
    findUnique: async ({ where }: any) => structuredClone(rows.find((r) => match(r, where)) ?? null),
    findMany: async ({ where, take }: any) => structuredClone(rows.filter((r) => match(r, where)).slice(0, take ?? 1000)),
    updateMany: async ({ where, data }: any) => {
      const matches = rows.filter((r) => match(r, where));
      for (const r of matches) Object.assign(r, data);
      return { count: matches.length };
    },
    update: async ({ where, data }: any) => {
      const r = rows.find((row) => match(row, where));
      if (!r) return null;
      Object.assign(r, data);
      return r;
    },
  };
  return { rows, prisma: attachMemoryRelease({ application }) };
}

function ownedStatusWrite(db: ReturnType<typeof database>, id: string, token: Date, data: Record<string, unknown>) {
  return db.prisma.application.updateMany({
    where: { id, ...liveLeaseFields(token) },
    data,
  });
}

// --- helpers ---
const issued = issueApplicationLease(now);
assert.equal(typeof issued.leaseToken, "string");
assert.ok(issued.leaseToken.length >= 16);
assert.equal(+issued.leaseExpiresAt, +now + APPLICATION_LEASE_MS);
const other = issueApplicationLease(now);
assert.notEqual(issued.leaseToken, other.leaseToken);
const work = asWorkLease(issued.startedAt, issued.leaseToken);
assert.deepEqual(liveLeaseFields(work, now), {
  startedAt: work, leaseToken: issued.leaseToken, leaseExpiresAt: { gt: now },
});
assert.throws(() => liveLeaseFields(new Date()), /application_lease_missing/);
const expiredAt = new Date(+now - 1);
assert.equal(match({ completedAt: null, leaseExpiresAt: expiredAt, startedAt: now }, expiredLeaseWhere(now)), true);
assert.equal(match({ completedAt: null, leaseExpiresAt: null, startedAt: now }, expiredLeaseWhere(now)), true, "pre-lease startedAt is expired");
assert.equal(match({ completedAt: null, leaseExpiresAt: new Date(+now + 60_000), startedAt: now }, expiredLeaseWhere(now)), false);
assert.ok(+renewLeaseData(now).leaseExpiresAt > +now);

const migration = readFileSync("prisma/migrations/20261024233000_application_work_lease/migration.sql", "utf8");
assert.match(migration, /Not applied by this change/);
assert.match(migration, /ADD COLUMN "leaseToken"/);
assert.match(migration, /ADD COLUMN "leaseExpiresAt"/);
assert.match(migration, /ADD COLUMN "submitStartedAt"/);
assert.doesNotMatch(migration, /UPDATE "/);
assert.doesNotMatch(migration, /DROP /);
const schema = readFileSync("prisma/schema.prisma", "utf8");
assert.match(schema, /leaseToken\s+String\?/);
assert.match(schema, /leaseExpiresAt\s+DateTime\?/);
assert.match(schema, /submitStartedAt\s+DateTime\?/);
const gates = readFileSync("src/lib/application-worker-gates.ts", "utf8");
assert.match(gates, /boundary === "final_submit" \? \{ submitStartedAt:/);
assert.match(gates, /ownershipWhere\(id, token/);
const worker = readFileSync("src/lib/application-worker.ts", "utf8");
assert.match(worker, /liveLeaseFields\(workToken\)/);
assert.match(worker, /if \(prepared\.count !== 1\) return;/);

async function testExpiredLeaseTakeoverRejectsOldSubmit() {
  const stale = new Date(Date.now() - 25 * 60_000);
  const oldToken = "old-worker-lease";
  const expired = row("takeover", {
    startedAt: stale,
    leaseToken: oldToken,
    leaseExpiresAt: new Date(Date.now() - 1_000),
  });
  const db = database([expired]);
  const oldWork = asWorkLease(stale, oldToken);

  const stillExpired = await ownedStatusWrite(db, "takeover", oldWork, {
    status: "success", submitConfirmation: "EMAIL_SENT", submittedAt: new Date(),
  });
  assert.equal(stillExpired.count, 0, "expired lease cannot write submit/status");
  assert.equal(db.rows[0].status, "queued");
  assert.equal(db.rows[0].submittedAt, null);

  const claims = loadClaim(db.prisma);
  assert.equal(await claims.recoverStuckApplications(), 1, "expired queued lease is reclaimed");
  assert.equal(db.rows[0].startedAt, null);
  assert.equal(db.rows[0].leaseToken, null);
  assert.equal(db.rows[0].status, "queued");

  assert.equal(await claims.claimApplication("takeover"), true, "new worker takes the expired claim");
  const taken = db.rows[0];
  assert.ok(taken.leaseToken && taken.leaseToken !== oldToken);
  assert.ok(taken.leaseExpiresAt instanceof Date && +taken.leaseExpiresAt > Date.now());

  const oldSubmit = await ownedStatusWrite(db, "takeover", oldWork, {
    status: "success", submitConfirmation: "EMAIL_SENT", submittedAt: new Date(), submittedVia: "email_recruiter",
  });
  assert.equal(oldSubmit.count, 0, "old worker submit/status write is rejected after takeover");
  assert.equal(taken.status, "queued");
  assert.equal(taken.submittedAt, null);
  assert.notEqual(taken.leaseToken, oldToken);
}

async function testLiveLeaseNotStolen() {
  const live = issueApplicationLease();
  const held = row("live", {
    startedAt: live.startedAt,
    leaseToken: live.leaseToken,
    leaseExpiresAt: live.leaseExpiresAt,
  });
  const db = database([held]);
  const claims = loadClaim(db.prisma);
  assert.deepEqual(Array.from(await claims.findClaimableQueued(10)), [], "a live claim is not pollable");
  assert.equal(await claims.claimApplication("live"), false, "claim refuses a live lease");
  assert.equal(await claims.recoverStuckApplications(), 0, "recovery does not steal a live lease");
  assert.equal(db.rows[0].leaseToken, live.leaseToken);
  assert.equal(+db.rows[0].startedAt!, +live.startedAt);
  assert.equal(db.rows[0].status, "queued");

  const ownerWrite = await ownedStatusWrite(db, "live", asWorkLease(live.startedAt, live.leaseToken), {
    status: "optimizing", errorMessage: null,
  });
  assert.equal(ownerWrite.count, 1, "the live owner can still write");
}

async function testSubmitStartedNeverAutoRetried() {
  const stale = new Date(Date.now() - 25 * 60_000);
  const marked = row("submit-started", {
    startedAt: stale,
    leaseToken: "dead-worker",
    leaseExpiresAt: new Date(Date.now() - 1_000),
    submitStartedAt: stale,
  });
  const orphan = row("orphan-submit", { submitStartedAt: stale });
  const db = database([marked, orphan]);
  assert.equal(hasPotentialSubmission(marked), true);
  const reservedWhileQueued = await reserveApplicationWork("submit-started", {
    application: {
      findUnique: async () => ({ userId: marked.userId, sessionId: marked.sessionId, jobId: marked.jobId }),
    },
    $transaction: async (fn: (tx: any) => Promise<unknown>) => fn({
      $queryRaw: async () => [{ now }],
      application: {
        findUnique: async () => marked,
        findFirst: async () => null,
        findMany: async () => [],
        count: async () => 0,
        update: async ({ data }: any) => {
          if (data?.status === "ready_to_apply" && /Nessun nuovo invio automatico/i.test(data.errorMessage ?? "")) {
            Object.assign(marked, data);
            return marked;
          }
          throw new Error("submit_started must not be rewritten");
        },
        updateMany: async () => { throw new Error("submit_started must not be rewritten"); },
      },
      applicationSubmissionReservation: { findFirst: async () => null, findMany: async () => [] },
    }),
  } as never);
  assert.equal(reservedWhileQueued, null, "reserve refuses a queued submit_started row");
  const claims = loadClaim(db.prisma);
  assert.deepEqual(Array.from(await claims.findClaimableQueued(10)), [], "submit_started is not claimable");
  assert.equal(await claims.claimApplication("submit-started"), false);

  const recovered = await claims.recoverStuckApplications();
  assert.equal(recovered, 1);
  const after = db.rows.find((r) => r.id === "submit-started")!;
  assert.equal(db.rows.find((r) => r.id === "orphan-submit")!.status, "queued", "unexpired-lease submit_started stays out of recover");
  assert.equal(after.status, "ready_to_apply");
  assert.equal(after.submitConfirmation, "UNCONFIRMED");
  assert.equal(after.startedAt, null);
  assert.equal(after.leaseToken, null);
  assert.match(after.errorMessage ?? "", /già avviato|riconciliare|nessun nuovo tentativo automatico/i);
  assert.notEqual(after.status, "queued");

  assert.equal(await claims.recoverStuckApplications(), 0, "reconcile/uncertain is not retried");
  assert.equal(await claims.claimApplication("submit-started"), false);
  assert.deepEqual(Array.from(await claims.findClaimableQueued(10)), []);

  const reserved = await reserveApplicationWork("submit-started", {
    application: {
      findUnique: async () => ({ userId: after.userId, sessionId: after.sessionId, jobId: after.jobId }),
    },
    $transaction: async (fn: (tx: any) => Promise<unknown>) => fn({
      $queryRaw: async () => [{ now }],
      application: {
        findUnique: async () => after,
        findFirst: async () => null,
        findMany: async () => [],
        count: async () => 0,
        update: async () => { throw new Error("submit_started must not be rewritten"); },
        updateMany: async () => { throw new Error("submit_started must not be rewritten"); },
      },
      applicationSubmissionReservation: { findFirst: async () => ({ id: "existing" }), findMany: async () => [] },
    }),
  } as never);
  assert.equal(reserved, null, "reserve refuses a submit_started row");
}

async function main() {
  await testExpiredLeaseTakeoverRejectsOldSubmit();
  await testLiveLeaseNotStolen();
  await testSubmitStartedNeverAutoRetried();
  console.log("PASS application leases: takeover rejects old submit, live lease not stolen, submit_started never auto-retried");
}

main().catch((error) => { console.error(error); process.exit(1); });
