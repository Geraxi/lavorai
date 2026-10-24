/**
 * Queue drain: claim only sendable rows, park quota/consent/skip-list,
 * multi-claim without double-send, capped attempts. No network, no real DB.
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
import { heldMessage } from "../src/lib/application-worker-gates";

process.env.APPLICATION_SENDING_MODE = "automatic";
process.env.APPLICATION_ROLLOUT_START_AT = new Date(Date.now() - 3_600_000).toISOString();
delete process.env.DRAIN_QUEUE_BATCH;
delete process.env.DRAIN_MAX_ATTEMPTS;
delete process.env.ATS_SKIP_HOSTS;
delete process.env.FREE_WEEKLY_APPLY_QUOTA;
delete process.env.APPLICATIONS_PAUSED;

const start = new Date(process.env.APPLICATION_ROLLOUT_START_AT);
const freshAt = new Date(+start + 60_000);
const now = new Date();

function load(path: string, extra: Record<string, unknown> = {}) {
  const dependencies: Record<string, unknown> = {
    "@/lib/application-rollout": rollout,
    "@/lib/application-pause": { applicationsPaused: () => process.env.APPLICATIONS_PAUSED === "true" },
    "@/lib/application-answer-continuation": continuation,
    "./application-answer-continuation": continuation,
    "@/lib/paid-priority": paidPriority,
    "@/lib/drain-limits": drainLimits,
    "@/lib/queue-sendability": sendability,
    "@/lib/ats-skip-hosts": skipHosts,
    "@/lib/billing": billing,
    "@/lib/application-worker-gates": { heldMessage },
    "@/lib/db": extra["@/lib/db"] ?? { prisma: {} },
    "@/lib/application-claim": extra["@/lib/application-claim"] ?? {},
    "@/lib/application-worker": extra["@/lib/application-worker"] ?? { processApplication: async () => {} },
    "@/lib/queue-drain": extra["@/lib/queue-drain"] ?? {},
    ...extra,
  };
  const module = { exports: {} as Record<string, unknown> };
  const code = ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(code, {
    module, exports: module.exports, Date, Map, Set, URL, console,
    process: { env: process.env },
    require: (name: string) => {
      if (!(name in dependencies)) throw new Error(`Unexpected dependency ${name} in ${path}`);
      return dependencies[name];
    },
  }, { filename: path });
  return module.exports as Record<string, any>;
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
    if (key === "startsWith") return typeof value === "string" && value.startsWith(expected);
    return match(value?.[key], expected);
  });
}

function sendableUser(overrides: Record<string, unknown> = {}) {
  return {
    tier: "pro", email: "paid@example.test", subscriptionStatus: "active",
    createdAt: new Date("2025-01-01"), trialEndsAt: null, trialGraceEndsAt: null,
    currentPeriodEnd: new Date(+now + 30 * 86400_000), pausedUntil: null, suspendedAt: null,
    emailVerified: freshAt, privacyConsentAt: freshAt,
    preferences: { autoApplyMode: "auto" },
    ...overrides,
  };
}

function freeUser(overrides: Record<string, unknown> = {}) {
  return sendableUser({
    tier: "free", email: "free@example.test", subscriptionStatus: null,
    createdAt: new Date("2025-01-01"), currentPeriodEnd: null, ...overrides,
  });
}

function row(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id, userId: "paid", status: "queued", createdAt: freshAt, consentGrantedAt: freshAt,
    answerContinuationJson: null, retryCount: 0, startedAt: null, completedAt: null,
    submittedAt: null, submittedVia: null, submitConfirmation: null, canaryLog: null,
    answersUsedJson: null, viewedAt: null, lastReplyAt: null, replyCount: 0, userStatus: null,
    errorMessage: null, job: { url: `https://boards.greenhouse.io/acme/jobs/${id}`, recruiterEmail: null },
    user: sendableUser(),
    ...overrides,
  };
}

function database(initial: ReturnType<typeof row>[]) {
  const rows = structuredClone(initial);
  let reads = 0, writes = 0;
  const application = {
    findUnique: async ({ where }: any) => { reads++; return structuredClone(rows.find((r) => match(r, where)) ?? null); },
    findMany: async ({ where, take }: any) => {
      reads++;
      return structuredClone(rows.filter((r) => match(r, where)).slice(0, take ?? 1000));
    },
    updateMany: async ({ where, data }: any) => {
      const matches = rows.filter((r) => match(r, where));
      for (const r of matches) Object.assign(r, data);
      writes += matches.length;
      return { count: matches.length };
    },
  };
  return { rows, prisma: { application }, counts: () => ({ reads, writes }) };
}

// --- unit: skip list & limits ---
assert.deepEqual(skipHosts.skipPortalHosts({}), [...skipHosts.DEFAULT_SKIP_PORTAL_HOSTS]);
assert.equal(skipHosts.isSkippedPortalUrl("https://jobs.ashbyhq.com/acme/uuid"), true);
assert.equal(skipHosts.isSkippedPortalUrl("https://boards.greenhouse.io/acme/jobs/1"), false);
assert.equal(skipHosts.requiresManualAtsHandoff({ url: "https://jobs.ashbyhq.com/acme/x", recruiterEmail: null }), true);
assert.equal(skipHosts.requiresManualAtsHandoff({ url: "https://jobs.ashbyhq.com/acme/x", recruiterEmail: "jobs@acme.com" }), false);
assert.equal(skipHosts.skipPortalHosts({ ATS_SKIP_HOSTS: "captcha.example.com" }).join(","), "captcha.example.com");
assert.deepEqual(skipHosts.skipPortalHosts({ ATS_SKIP_HOSTS: "" }), []);
assert.ok(skipHosts.jobDeliveryPriority({ url: "https://boards.greenhouse.io/a/jobs/1", recruiterEmail: "a@b.com" })
  > skipHosts.jobDeliveryPriority({ url: "https://jobs.ashbyhq.com/a/x", recruiterEmail: null }));
assert.equal(drainLimits.drainQueueBatch({}), 5);
assert.equal(drainLimits.drainQueueBatch({ DRAIN_QUEUE_BATCH: "8" }), 8);
assert.equal(drainLimits.maxDrainAttempts({}), 3);
assert.equal(drainLimits.drainProcessConcurrency({ WORKER_CONCURRENCY: "1", DRAIN_QUEUE_BATCH: "5" }), 1);

// --- unit: sendability ---
assert.equal(sendability.queuedUserBlockReason(sendableUser(), freshAt, now), null);
assert.equal(sendability.queuedUserBlockReason(sendableUser({ privacyConsentAt: null }), freshAt, now), "privacy_consent_missing");
assert.equal(sendability.queuedUserBlockReason(sendableUser({ emailVerified: null }), freshAt, now), "email_verification_missing");
assert.equal(sendability.weeklyQuotaBlockReason(freeUser(), 5, now), "free_weekly_quota_reached");
assert.equal(sendability.weeklyQuotaBlockReason(freeUser(), 4, now), null);
assert.equal(sendability.weeklyQuotaBlockReason(sendableUser(), 99, now), null);
assert.equal(sendability.isQueuedRowSendable(row("ok")), true);
assert.equal(sendability.isQueuedRowSendable(row("ashby", {
  job: { url: "https://jobs.ashbyhq.com/acme/uuid", recruiterEmail: null },
})), false);
assert.equal(sendability.isQueuedRowSendable(row("ashby-email", {
  job: { url: "https://jobs.ashbyhq.com/acme/uuid", recruiterEmail: "jobs@acme.com" },
})), true);

async function testClaimSelection() {
  const blocked = row("blocked", { userId: "free", user: freeUser({ privacyConsentAt: null }), createdAt: new Date(+freshAt - 10_000) });
  const quota = row("quota", { userId: "free2", user: freeUser(), createdAt: new Date(+freshAt - 5_000) });
  const sendable = row("sendable", { userId: "paid", createdAt: freshAt });
  const ashby = row("ashby", {
    userId: "paid2", createdAt: new Date(+freshAt + 1_000),
    job: { url: "https://jobs.ashbyhq.com/acme/uuid", recruiterEmail: null },
    user: sendableUser({ email: "paid2@example.test" }),
  });
  const used = row("used", {
    id: "used", userId: "free2", status: "success", createdAt: now, submittedAt: now,
    startedAt: now, user: freeUser(), job: { url: "https://boards.greenhouse.io/acme/jobs/used", recruiterEmail: null },
  });
  // 5 successes already in the window for free2 → quota row is unsendable
  const extras = Array.from({ length: 5 }, (_, i) => row(`used-${i}`, {
    userId: "free2", status: "success", createdAt: now, submittedAt: now, startedAt: now,
    user: freeUser(), job: { url: `https://boards.greenhouse.io/acme/jobs/u${i}`, recruiterEmail: null },
  }));
  const db = database([blocked, quota, sendable, ashby, used, ...extras]);
  const claims = load("src/lib/application-claim.ts", { "@/lib/db": { prisma: db.prisma } });
  const ids = await claims.findClaimableQueued(10);
  assert.equal(Array.from(ids).join(","), "sendable", "Claim selection skips consent-blocked, quota-blocked and skip-list rows");
  assert.equal(db.counts().writes, 0, "findClaimableQueued stays read-only");
}

async function testParkUnsendable() {
  const blocked = row("blocked", { userId: "no-consent", user: sendableUser({ privacyConsentAt: null }) });
  const ashby = row("ashby", { job: { url: "https://jobs.ashbyhq.com/acme/uuid", recruiterEmail: null } });
  const sendable = row("sendable");
  const db = database([blocked, ashby, sendable]);
  const drain = load("src/lib/queue-drain.ts", { "@/lib/db": { prisma: db.prisma } });
  const parked = await drain.parkUnsendableQueued({ db: db.prisma, now });
  assert.ok(parked.parked >= 2);
  assert.equal(parked.blockedByReason.privacy_consent_missing, 1);
  assert.equal(parked.skipped, 1);
  const held = db.rows.find((r) => r.id === "blocked")!;
  assert.equal(held.status, "queued");
  assert.ok(held.startedAt, "consent hold stamps startedAt so it is not re-claimed");
  assert.equal(held.errorMessage, heldMessage("privacy_consent_missing"));
  const manual = db.rows.find((r) => r.id === "ashby")!;
  assert.equal(manual.status, "ready_to_apply");
  assert.equal(manual.errorMessage, skipHosts.SKIPPED_ATS_MANUAL_MESSAGE);
  assert.equal(db.rows.find((r) => r.id === "sendable")!.startedAt, null);
}

async function testMultiClaimNoDoubleSend() {
  const a = row("a");
  const b = row("b", { createdAt: new Date(+freshAt + 1_000) });
  const db = database([a, b]);
  const claims = load("src/lib/application-claim.ts", { "@/lib/db": { prisma: db.prisma } });
  const ids = await claims.findClaimableQueued(5);
  assert.equal([...ids].sort().join(","), "a,b");
  const results = await Promise.all([
    claims.claimApplication("a"), claims.claimApplication("a"),
    claims.claimApplication("b"), claims.claimApplication("b"),
  ]);
  assert.equal(results.filter(Boolean).length, 2, "Each row is claimed exactly once");
  assert.ok(db.rows.every((r) => r.startedAt), "Both claimed rows have an owner token");
}

async function testDrainBatchAndSummary() {
  process.env.DRAIN_QUEUE_BATCH = "5";
  const apps = ["p1", "p2", "p3", "p4", "p5"].map((id, i) => row(id, { createdAt: new Date(+freshAt + i * 1000) }));
  const blocked = row("no-privacy", {
    userId: "blocked", createdAt: new Date(+freshAt - 1000),
    user: sendableUser({ privacyConsentAt: null, email: "blocked@example.test" }),
  });
  const db = database([blocked, ...apps]);
  const processed: string[] = [];
  const drain = load("src/lib/queue-drain.ts", {
    "@/lib/db": { prisma: db.prisma },
    "@/lib/application-claim": {
      findClaimableQueued: async (limit: number) => db.rows
        .filter((r) => r.status === "queued" && r.startedAt == null && r.user?.privacyConsentAt)
        .sort((x, y) => +x.createdAt - +y.createdAt)
        .slice(0, limit)
        .map((r) => r.id),
      claimApplication: async (id: string) => {
        const r = db.rows.find((x) => x.id === id);
        if (!r || r.startedAt) return false;
        r.startedAt = new Date();
        return true;
      },
    },
    "@/lib/application-worker": {
      processApplication: async (id: string) => {
        processed.push(id);
        const r = db.rows.find((x) => x.id === id)!;
        r.status = "success";
        r.submitConfirmation = "DETECTED_THANK_YOU";
      },
    },
  });
  const summary = await drain.drainQueuedApplications({
    now, startedMs: Date.now(), maxDurationMs: 300_000, db: db.prisma,
  });
  assert.equal(summary.parked, 1);
  assert.equal(summary.blockedByReason.privacy_consent_missing, 1);
  assert.equal(summary.claimed, 5);
  assert.equal(summary.sent, 5);
  assert.equal([...processed].sort().join(","), "p1,p2,p3,p4,p5");
  delete process.env.DRAIN_QUEUE_BATCH;
}

async function testAttemptCap() {
  process.env.DRAIN_MAX_ATTEMPTS = "3";
  const app = row("bounce");
  const db = database([app]);
  const drain = load("src/lib/queue-drain.ts", { "@/lib/db": { prisma: db.prisma } });
  assert.equal(await drain.incrementDrainAttempt("bounce", "page_error", { db: db.prisma, now }), "retry");
  assert.equal(db.rows[0].retryCount, 1);
  assert.equal(db.rows[0].status, "queued");
  assert.equal(await drain.incrementDrainAttempt("bounce", "page_error", { db: db.prisma, now }), "retry");
  assert.equal(await drain.incrementDrainAttempt("bounce", "page_error", { db: db.prisma, now }), "exhausted");
  assert.equal(db.rows[0].status, "ready_to_apply");
  assert.equal(db.rows[0].retryCount, 3);
  assert.match(db.rows[0].errorMessage, /dopo 3 tentativi/);
  assert.equal(rollout.rolloutApplicationIneligibility(db.rows[0], now), "rollout_retry_blocked");
  delete process.env.DRAIN_MAX_ATTEMPTS;
}

async function testSkipListEmailPreferred() {
  assert.equal(skipHosts.compareJobsForAutoApply(
    { url: "https://jobs.ashbyhq.com/a/1", recruiterEmail: "jobs@a.com" },
    { url: "https://boards.greenhouse.io/a/jobs/1", recruiterEmail: null },
  ) < 0, true, "recruiter email outranks a captcha-free form");
  assert.ok(skipHosts.jobDeliveryPriority({ url: "https://jobs.lever.co/a/1", recruiterEmail: null })
    > skipHosts.jobDeliveryPriority({ url: "https://jobs.ashbyhq.com/a/1", recruiterEmail: null }));
}

(async () => {
  await testClaimSelection();
  await testParkUnsendable();
  await testMultiClaimNoDoubleSend();
  await testDrainBatchAndSummary();
  await testAttemptCap();
  await testSkipListEmailPreferred();
  console.log("queue drain: ok");
})().catch((err) => { console.error(err); process.exitCode = 1; });
