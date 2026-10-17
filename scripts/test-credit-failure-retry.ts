import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { createHash } from "node:crypto";
import { z } from "zod";
import * as billing from "../src/lib/billing";
import { Prisma, type PrismaClient } from "@prisma/client";
import {
  creditRetryRequest, creditRetryEligibility, creditRetryVersion, hasPriorAttemptEvidence,
  isAiCreditFailure, retryCreditFailures as rolloutRetryCreditFailures, verifyCreditRetryWorkerSchema, type CreditRetryRow,
} from "../src/lib/credit-failure-retry";


// Retain the historical retry algorithm's regression tests under an isolated
// mock gate. The exported production function must always reject live retries.
const legacyModule = { exports: {} as Record<string, any> };
const legacyDependencies: Record<string, unknown> = {
  "@/lib/application-rollout": { automaticApplicationsBlocked: () => false, historicalRetriesBlocked: () => false },
  "@/lib/billing": billing, "node:crypto": { createHash }, "@prisma/client": { Prisma }, zod: { z },
};
new Function("require", "module", "exports", ts.transpileModule(readFileSync("src/lib/credit-failure-retry.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText)(
  (id: string) => { assert.ok(id in legacyDependencies, `Unexpected dependency ${id}`); return legacyDependencies[id]; },
  legacyModule, legacyModule.exports,
);
const retryCreditFailures: typeof rolloutRetryCreditFailures = legacyModule.exports.retryCreditFailures;

const now = Date.now();
const ago = (days: number) => new Date(now - days * 86_400_000);
const message = "CREDITI AI ESAURITI: servizio temporaneamente non disponibile. Ricarica crediti OpenAI/Anthropic. Candidatura in coda per retry automatico.";
const row = (id = "app-a"): CreditRetryRow => ({
  id, userId: "user-a", jobId: `job-${id}`, sessionId: "round-a", status: "failed", errorMessage: message,
  startedAt: ago(2), completedAt: ago(2), createdAt: ago(3), retryCount: 0,
  submittedAt: null, submittedVia: null, submitConfirmation: null, canaryLog: null,
  viewedAt: null, lastReplyAt: null, replyCount: 0, userStatus: null,
  answersUsedJson: null, pendingQuestionsJson: null, cvDocxPath: null, cvPdfPath: null,
  coverLetterPath: null, coverLetterText: null,
  user: {
    id: "user-a", email: "fixture@example.com", tier: "pro", createdAt: ago(30),
    trialEndsAt: null, trialGraceEndsAt: null, subscriptionStatus: "active", currentPeriodEnd: ago(-10),
    pausedUntil: null, suspendedAt: null, emailVerified: ago(29), privacyConsentAt: ago(29),
    preferences: { autoApplyMode: "auto" }, cvDocuments: [{ id: "cv-a" }],
  },
  job: { closedAt: null },
  session: { id: "round-a", userId: "user-a", status: "active", sentCount: 0, targetCount: 30 },
});

// In-memory Prisma boundary. No production DB, queue, network, AI, or submissions.
function match(value: unknown, condition: unknown): boolean {
  if (condition === null || typeof condition !== "object" || condition instanceof Date) {
    return value instanceof Date && condition instanceof Date ? +value === +condition : value === condition;
  }
  return Object.entries(condition).every(([key, expected]) => {
    const item = value as Record<string, unknown>;
    if (key === "OR") return (expected as unknown[]).some((entry) => match(value, entry));
    if (key === "in") return (expected as unknown[]).includes(value);
    if (key === "not") return !match(value, expected);
    if (key === "gte") return +(value as Date) >= +(expected as Date);
    if (key === "contains" || key === "startsWith") return typeof value === "string"
      && (key === "contains" ? value.toLowerCase().includes(String(expected).toLowerCase())
        : value.toLowerCase().startsWith(String(expected).toLowerCase()));
    if (key === "mode") return true;
    return match(item?.[key], expected);
  });
}
function harness(initial: CreditRetryRow[]) {
  const rows = structuredClone(initial);
  let writes = 0;
  let cancelCalls = 0;
  let enqueueCalls = 0;
  let beforeUpdate: (() => void) | undefined;
  let beforeEnqueue: ((id: string) => void) | undefined;
  let failEnqueue = false;
  let failCommitAck = false;
  let tail = Promise.resolve();
  const application = {
    findMany: async ({ where, take, cursor }: { where: unknown; take?: number; cursor?: { id: string } }) => {
      const found = rows.filter((r) => match(r, where)).sort((a, b) => +a.createdAt - +b.createdAt || a.id.localeCompare(b.id));
      const start = cursor ? found.findIndex((r) => r.id === cursor.id) + 1 : 0;
      return structuredClone(found.slice(start, take === undefined ? undefined : start + take));
    },
    findUnique: async ({ where }: { where: unknown }) => structuredClone(rows.find((r) => match(r, where)) ?? null),
    count: async ({ where }: { where: unknown }) => rows.filter((r) => match(r, where)).length,
    updateMany: async ({ where, data }: { where: unknown; data: unknown }) => {
      beforeUpdate?.(); beforeUpdate = undefined;
      const matching = rows.filter((r) => match(r, where));
      for (const r of matching) Object.assign(r, data);
      writes += matching.length;
      return { count: matching.length };
    },
  };
  const db = {
    application,
    $transaction: async (fn: (tx: unknown) => Promise<unknown>, options: unknown) => {
      assert.deepEqual(options, { isolationLevel: "Serializable" });
      const previous = tail;
      let release!: () => void;
      tail = new Promise<void>((resolve) => { release = resolve; });
      await previous;
      try {
        const result = await fn({ application, $queryRaw: async (strings: TemplateStringsArray, userId: string) => {
          assert.match(strings.join(""), /pg_advisory_xact_lock\(hashtext/);
          assert.equal(userId, "user-a");
          return [{ result: 1 }];
        } });
        if (failCommitAck) throw new Error("Commit acknowledgment lost");
        return result;
      } finally { release(); }
    },
  } as unknown as PrismaClient;
  return { rows, deps: {
    db,
    cancel: async () => { cancelCalls++; },
    enqueue: async (id: string, options: { preserveClaim: true }) => {
      assert.deepEqual(options, { preserveClaim: true });
      enqueueCalls++; beforeEnqueue?.(id);
      if (failEnqueue) throw new Error("fixture queue failure");
    },
  }, counters: () => ({ writes, cancelCalls, enqueueCalls }),
  mutateBeforeUpdate: (fn: () => void) => { beforeUpdate = fn; },
  mutateAtEnqueue: (fn: (id: string) => void) => { beforeEnqueue = fn; },
  failEnqueue: () => { failEnqueue = true; }, failCommitAck: () => { failCommitAck = true; } };
}
const preview = (extra = {}) => creditRetryRequest.parse({ dryRun: true, ...extra });
const live = (rows: CreditRetryRow[], extra = {}) => creditRetryRequest.parse({
  dryRun: false, mode: rows.length === 1 ? "canary" : "batch", workerHealthConfirmed: true,
  applicationIds: rows.map((r) => r.id), versions: Object.fromEntries(rows.map((r) => [r.id, creditRetryVersion(r)])), ...extra,
});

async function main() {
  const blockedFixture = harness([row()]);
  await assert.rejects(rolloutRetryCreditFailures(live([row()]), blockedFixture.deps), /historical_application_retries_blocked/);
  assert.deepEqual(blockedFixture.counters(), { writes: 0, cancelCalls: 0, enqueueCalls: 0 });
  for (const text of [message, "crediti ai esauriti: outage", "400 Your credit balance is too low to access the Anthropic API", '{"code":"insufficient_quota"}', "You exceeded your current quota, please check your plan and billing details."]) assert.ok(isAiCreditFailure(text));
  for (const text of [null, "insufficient permissions", "quota exceeded", "Resend quota exceeded", "Streaming is required", "risposta troncata", "captcha-failed", "billing address invalid", "crediti esauriti", "CREDITI AI ESAURITI IN A USER MESSAGE"]) assert.equal(isAiCreditFailure(text), false);
  assert.equal(creditRetryRequest.parse({}).dryRun, true);
  assert.equal(creditRetryRequest.parse({}).days, 14);
  for (const invalid of [{ dryRun: false }, { days: 31 }, { days: "30" }, { limit: 201 }, { dryRun: "false" }, { applicationIds: ["a", "a"] }, { unknown: true }]) assert.equal(creditRetryRequest.safeParse(invalid).success, false);
  assert.throws(() => live([row()], { workerHealthConfirmed: false }));
  assert.throws(() => live([row()], { versions: {} }));
  assert.throws(() => live([row("a"), row("b")], { mode: "canary" }));
  assert.throws(() => live(Array.from({ length: 11 }, (_, index) => row(`a${index}`))));

  assert.equal(creditRetryEligibility(row(), ago(14)), null);
  const exclusionCases: [string, (r: CreditRetryRow) => void][] = [
    ["not_failed", (r) => { r.status = "queued"; }], ["outside_window", (r) => { r.createdAt = ago(20); }],
    ["not_ai_credit_failure", (r) => { r.errorMessage = "captcha-failed"; }], ["failure_not_completed", (r) => { r.completedAt = null; }],
    ["user_suspended", (r) => { r.user.suspendedAt = ago(1); }], ["consent_or_verification_missing", (r) => { r.user.privacyConsentAt = null; }],
    ["consent_or_verification_missing", (r) => { r.user.emailVerified = null; }], ["cv_missing", (r) => { r.user.cvDocuments = []; }],
    ["auto_apply_not_enabled", (r) => { r.user.preferences = { autoApplyMode: "hybrid" }; }],
    ["auto_apply_not_enabled", (r) => { r.user.preferences = { autoApplyMode: "off" }; }],
    ["subscription_paused", (r) => { r.user.pausedUntil = ago(-1); }],
    ["subscription_paused", (r) => { r.user.subscriptionStatus = "paused"; }],
    ["billing_ineligible", (r) => { r.user.tier = "free"; }],
    ["billing_ineligible", (r) => { r.user.tier = "free"; r.user.createdAt = ago(1); r.user.subscriptionStatus = null; }],
    ["billing_ineligible", (r) => { r.user.subscriptionStatus = "past_due"; }],
    ["billing_ineligible", (r) => { r.user.subscriptionStatus = null; }],
    ["billing_ineligible", (r) => { r.user.currentPeriodEnd = ago(1); }],
    ["job_closed", (r) => { r.job.closedAt = ago(1); }],
    ["session_inactive", (r) => { r.session!.status = "paused"; }],
    ["session_inactive", (r) => { r.session!.status = "completed"; }],
    ["session_inactive", (r) => { r.session!.userId = "other"; }],
  ];
  for (const [expected, mutate] of exclusionCases) { const r = row(); mutate(r); assert.equal(creditRetryEligibility(r, ago(14)), expected); }
  for (const key of ["submittedAt", "submittedVia", "submitConfirmation", "canaryLog", "viewedAt", "lastReplyAt", "userStatus", "answersUsedJson", "pendingQuestionsJson", "cvDocxPath", "cvPdfPath", "coverLetterPath", "coverLetterText"]) {
    const r = row(); Object.assign(r, { [key]: "evidence" });
    assert.ok(hasPriorAttemptEvidence(r)); assert.equal(creditRetryEligibility(r, ago(14)), "prior_attempt_evidence");
  }
  assert.ok(hasPriorAttemptEvidence({ ...row(), replyCount: 1 }));
  const lifetime = row(); lifetime.user.email = "umbertogeraci0@gmail.com"; lifetime.user.subscriptionStatus = null;
  lifetime.user.tier = "free"; lifetime.user.currentPeriodEnd = ago(10);
  assert.equal(creditRetryEligibility(lifetime, ago(14)), null);

  const a = row("a"); const b = { ...row("b"), jobId: a.jobId };
  const duplicate = harness([a, b]);
  const p = await retryCreditFailures(preview(), duplicate.deps);
  assert.deepEqual(p.candidates.map((c) => c.id), ["a"]);
  assert.equal(p.skipped[0].reason, "duplicate_user_job");
  assert.deepEqual(duplicate.counters(), { writes: 0, cancelCalls: 0, enqueueCalls: 0 });
  const older = { ...row(), createdAt: ago(20) };
  assert.equal((await retryCreditFailures(preview(), harness([older]).deps)).candidates.length, 0);
  assert.equal((await retryCreditFailures(preview({ days: 30 }), harness([older]).deps)).candidates.length, 1);
  assert.equal((await retryCreditFailures(preview({ applicationIds: ["missing"] }), harness([]).deps)).skipped[0].reason, "not_found");
  const limited = await retryCreditFailures(preview({ limit: 1 }), harness([a, row("b")]).deps);
  assert.equal(limited.hasMore, true); assert.equal(limited.found, 1); assert.equal(limited.nextCursor, "a");
  const secondPage = await retryCreditFailures(preview({ limit: 1, cursor: limited.nextCursor! }), harness([a, row("b")]).deps);
  assert.deepEqual(secondPage.candidates.map((c) => c.id), ["b"]); assert.equal(secondPage.hasMore, false);

  for (const status of ["success", "queued", "optimizing", "applying", "submitting", "ready_to_apply", "awaiting_consent", "needs_answers", "needs_session", "cancelled", "unknown"]) {
    const h = harness([a, { ...b, status }]);
    assert.equal((await retryCreditFailures(preview({ applicationIds: [a.id] }), h.deps)).skipped[0].reason, "counterpart_active_or_ambiguous");
  }
  for (const other of [{ ...b, submitConfirmation: "UNCONFIRMED" }, { ...b, errorMessage: "Unknown adapter timeout" }]) {
    assert.equal((await retryCreditFailures(preview({ applicationIds: [a.id] }), harness([a, other]).deps)).candidates.length, 0);
  }

  const seven = Array.from({ length: 7 }, (_, i) => row(`round-${i}`));
  for (const r of seven) r.session!.sentCount = 27;
  const reservations = Array.from({ length: 21 }, (_, i) => ({ ...row(`pending-${i}`), status: "queued" }));
  assert.equal((await retryCreditFailures(preview(), harness([...seven, ...reservations]).deps)).candidates.length, 0);
  assert.equal((await retryCreditFailures(preview(), harness(seven).deps)).candidates.length, 3);
  assert.equal((await retryCreditFailures(preview(), harness([...seven, ...reservations.slice(0, 2)]).deps)).candidates.length, 1);

  const same = harness([a]);
  const sameResults = await Promise.all([retryCreditFailures(live([a]), same.deps), retryCreditFailures(live([a]), same.deps)]);
  assert.equal(sameResults.reduce((n, r) => n + r.requeued, 0), 1);
  assert.deepEqual(same.counters(), { writes: 1, cancelCalls: 1, enqueueCalls: 1 });
  const siblings = harness([a, b]);
  const siblingResults = await Promise.all([retryCreditFailures(live([a]), siblings.deps), retryCreditFailures(live([b]), siblings.deps)]);
  assert.equal(siblingResults.reduce((n, r) => n + r.requeued, 0), 1);
  const capA = row("cap-a"), capB = row("cap-b"); capA.session!.sentCount = capB.session!.sentCount = 29;
  const cap = harness([capA, capB]);
  const capResults = await Promise.all([retryCreditFailures(live([capA]), cap.deps), retryCreditFailures(live([capB]), cap.deps)]);
  assert.equal(capResults.reduce((n, r) => n + r.requeued, 0), 1);

  const stale = harness([a]); stale.rows[0].completedAt = new Date();
  assert.equal((await retryCreditFailures(live([a]), stale.deps)).skipped[0].reason, "stale_preview");
  for (const mutation of [(r: CreditRetryRow) => { r.status = "optimizing"; r.startedAt = new Date(); }, (r: CreditRetryRow) => { r.submittedAt = new Date(); }]) {
    const h = harness([a]); h.mutateBeforeUpdate(() => mutation(h.rows[0]));
    assert.equal((await retryCreditFailures(live([a]), h.deps)).requeued, 0);
    assert.equal(h.counters().enqueueCalls, 0);
  }
  const enqueueFailure = harness([a]); enqueueFailure.failEnqueue();
  const failedQueue = await retryCreditFailures(live([a]), enqueueFailure.deps);
  assert.equal(failedQueue.requeued, 1); assert.deepEqual(failedQueue.enqueueWarnings, [a.id]);
  assert.equal(enqueueFailure.rows[0].status, "queued");
  assert.equal(enqueueFailure.rows[0].completedAt, null);
  const uncertain = harness([a]); uncertain.failCommitAck();
  const unknown = await retryCreditFailures(live([a]), uncertain.deps);
  assert.equal(unknown.ok, false); assert.deepEqual(unknown.unknownIds, [a.id]);
  assert.equal(unknown.requeued, 0); assert.equal(unknown.skipped.length, 0);
  assert.equal(uncertain.rows[0].status, "queued"); assert.equal(uncertain.counters().enqueueCalls, 0);
  const claimed = harness([a]);
  claimed.mutateAtEnqueue(() => { claimed.rows[0].startedAt = new Date(); });
  await retryCreditFailures(live([a]), claimed.deps);
  assert.ok(claimed.rows[0].startedAt); // no write after queue publication

  const columns = Prisma.dmmf.datamodel.models.flatMap((model) => model.fields.filter((field) => field.kind !== "object")
    .map((field) => ({ table_name: model.dbName ?? model.name, column_name: field.dbName ?? field.name })));
  const schemaDb = (missing: string[]) => ({ $queryRaw: async () => columns.filter((c) => !missing.includes(c.column_name)) }) as unknown as PrismaClient;
  await verifyCreditRetryWorkerSchema(schemaDb([]));
  await assert.rejects(verifyCreditRetryWorkerSchema(schemaDb(["demoGeneratedAt", "demoCompletedAt"])), /worker_schema_not_ready/);
  await assert.rejects(verifyCreditRetryWorkerSchema(schemaDb(["sentCount"])), /worker_schema_not_ready/);

  // Exercise real queue/route boundaries with a mock Prisma singleton and no network.
  (globalThis as unknown as { prisma: unknown }).prisma = { application: { updateMany: () => { throw new Error("claim reset must not run"); } }, $queryRaw: async () => [] };
  const originalFetch = globalThis.fetch;
  const originalEnv = { ...process.env };
  globalThis.fetch = async () => { throw new Error("network forbidden in retry tests"); };
  // Closed sending policy: queue boundaries must return before any DB access.
  process.env.APPLICATION_SENDING_MODE = "closed-for-test";
  try {
    const { enqueueApplication } = await import("../src/lib/application-queue");
    process.env.QUEUE_MODE = "db";
    await enqueueApplication("fixture", { preserveClaim: true });
    process.env.QUEUE_MODE = "bullmq";
    for (const key of ["REDIS_URL", "INNGEST_EVENT_KEY", "QSTASH_TOKEN", "NEXT_PUBLIC_SITE_URL", "VERCEL_URL"]) delete process.env[key];
    await enqueueApplication("fixture", { preserveClaim: true }); // no unclaimed in-process fallback
    const { POST } = await import("../src/app/api/admin/retry-credit-failures/route");
    const { NextRequest } = await import("next/server");
    process.env.ADMIN_SYNC_KEY = "local-test-only";
    const request = (body: string) => new NextRequest("http://localhost/api/admin/retry-credit-failures", { method: "POST", headers: { "x-admin-key": "local-test-only", "content-type": "application/json" }, body });
    assert.equal((await POST(request("{"))).status, 400);
    assert.equal((await POST(request(JSON.stringify({ dryRun: false })))).status, 400);
    const blocked = await POST(request(JSON.stringify(live([a]))));
    assert.equal(blocked.status, 503); assert.equal((await blocked.json()).error, "historical_application_retries_blocked");
  } finally {
    globalThis.fetch = originalFetch;
    for (const key of Object.keys(process.env)) if (!(key in originalEnv)) delete process.env[key];
    Object.assign(process.env, originalEnv);
    delete (globalThis as unknown as { prisma?: unknown }).prisma;
  }
  // Both admin entry points share the same bounded, explicit 14/30-day preview UI.
  const ui = readFileSync("src/components/admin-retry-credit-button.tsx", "utf8");
  assert.match(ui, /useState\(14\)/); assert.match(ui, /option value=\{30\}/); assert.match(ui, /dryRun: true/);
  assert.match(readFileSync("src/app/(app)/admin/_retry-button.tsx", "utf8"), /AdminRetryCreditButton as RetryCreditFailuresButton/);
  console.log("Credit retry checks passed: precise match; preview/input guards; eligibility/evidence; dedup; round capacity; stale/CAS/concurrent retries; queue claim preservation; live rollout retry block; worker-schema checker; both admin entry points. Mock DB, no external operations.");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
