import * as emailPolicy from "../src/lib/email-dispatch-policy";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as receipt from "../src/lib/submission-receipt";

// No application writes, queues or network are exposed to this fixture.
const now = new Date();
let clock = +now;
let quotaDelay = 0;
class ClockDate extends Date {
  constructor(value?: string | number | Date) { super(value === undefined ? clock : value instanceof Date ? +value : value); }
  static now() { return clock; }
}
const proof = JSON.stringify({ version: 1, provider: "greenhouse", kind: "dom", capturedAt: now.toISOString(),
  jobId: "123", signal: "new_receipt_and_form_removed" });
const app: any = { id: "a", sentNotificationRequiredAt: now, status: "success", submittedAt: now, submittedVia: "portal_greenhouse", submissionReceiptJson: proof,
  job: { url: "https://boards.greenhouse.io/acme/jobs/123" }, user: { email: "user@example.invalid" }, emailAttempts: [] };
let row: any = null;
let candidates: any[] = [app];
let calls = 0, accepted = 0, fail = false, failWrite = false, paused = false;
const keys = new Set<string>();
const payloads: string[] = [];
function matches(where: any) {
  return Object.entries(where).every(([key, value]: [string, any]) => {
    if (key === "OR") return row.leaseUntil == null || row.leaseUntil <= now;
    if (value?.gt) return row[key] > value.gt;
    if (value instanceof Date) return +row[key] === +value;
    return row[key] === value;
  });
}
const table = {
  upsert: async ({ create }: any) => { row ??= { ...create, status: "pending", attempts: 0, nextAttemptAt: new Date(0), sentAt: null, firstAttemptAt: null, leaseUntil: null, leaseToken: null }; return row; },
  findUnique: async () => row && { ...row },
  findMany: async () => row && !row.sentAt && ["pending", "sending"].includes(row.status) ? [{ applicationId: row.applicationId }] : [],
  updateMany: async ({ where, data }: any) => {
    if (data.status === "sent" && failWrite) { failWrite = false; throw Error("db after provider acceptance"); }
    if (!row || !matches(where)) return { count: 0 };
    if (data.attempts?.increment) data = { ...data, attempts: row.attempts + data.attempts.increment };
    Object.assign(row, data); return { count: 1 };
  },
};
const deps: Record<string, any> = {
  "@/lib/email-dispatch-policy": emailPolicy,
  "@/lib/email-context": { emailContext: { run: (_context: unknown, fn: () => unknown) => fn() } },
  "node:crypto": { randomUUID: () => `lease-${Math.random()}` },
  "@/lib/db": { prisma: { application: { findUnique: async () => app,
    findMany: async ({ where, take }: any) => candidates.filter(candidate => (!where.id?.gt || candidate.id > where.id.gt)
      && (!row || row.applicationId !== candidate.id)).sort((a, b) => a.id.localeCompare(b.id)).slice(0, take) }, applicationSentNotification: table } },
  "@/lib/application-pause": { applicationsPaused: () => paused },
  "@/lib/submission-receipt": receipt,
  "@/lib/email-quota": { sendWithinQuota: async (_kind: string, _to: string, send: () => Promise<void>) => {
    try { clock += quotaDelay; await send(); return { sent: true }; } catch { return { sent: false, reason: "fixture_failure" }; }
  } },
  "@/lib/resend": { Resend: class { emails = { send: async (payload: any, options: any) => {
    calls++; payloads.push(JSON.stringify(payload));
    if (fail) return { error: { message: "provider failure" } };
    if (!keys.has(options.idempotencyKey)) { accepted++; keys.add(options.idempotencyKey); }
    return { data: { id: "provider-fixture" } };
  } }; } },
};
const module = { exports: {} as any };
vm.runInNewContext(ts.transpileModule(readFileSync("src/lib/application-sent-notification.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { module, exports: module.exports, Date: ClockDate, process: { env: { RESEND_API_KEY: "fixture" } },
  require: (key: string) => { assert.ok(key in deps, key); return deps[key]; } });
const payload = { from: "LavorAI <noreply@example.invalid>", to: app.user.email, subject: "Confirmed", html: "fixture", text: "fixture" };
async function main() {
  app.submissionReceiptJson = null;
  await module.exports.queueApplicationSentNotification("a", payload);
  assert.equal(row, null); assert.equal(calls, 0);
  app.submissionReceiptJson = proof; app.job.url = "https://boards.greenhouse.io/acme/jobs/456";
  await module.exports.queueApplicationSentNotification("a", payload);
  assert.equal(row, null, "receipt must match this job");
  app.job.url = "https://boards.greenhouse.io/acme/jobs/123";
  fail = true;
  await module.exports.queueApplicationSentNotification("a", payload);
  assert.equal(row.status, "pending"); assert.equal(row.sentAt, null);
  fail = false; failWrite = true; row.nextAttemptAt = new Date(0);
  await module.exports.retryApplicationSentNotification("a", now);
  assert.equal(row.status, "pending"); assert.equal(accepted, 1);
  row.nextAttemptAt = new Date(0);
  await Promise.all([module.exports.retryApplicationSentNotification("a", now), module.exports.retryApplicationSentNotification("a", now)]);
  assert.equal(row.status, "sent"); assert.equal(accepted, 1, "stable key prevents second notification after acceptance/write crash");
  const before = calls;
  await module.exports.queueApplicationSentNotification("a", { ...payload, text: "changed" });
  assert.equal(calls, before); assert.ok(payloads.every(value => value === JSON.stringify(payload)));
  row = { ...row, sentAt: null, status: "pending", firstAttemptAt: new Date(+now - 24 * 3600_000) };
  await module.exports.retryApplicationSentNotification("a", now);
  assert.equal(row.status, "review_required"); assert.equal(calls, before);
  row.nextAttemptAt = new Date(0); row.status = "pending"; row.firstAttemptAt = new Date(+now - 22 * 3600_000);
  row.leaseUntil = null; row.leaseToken = null; clock = +now; quotaDelay = 2 * 3600_000;
  await module.exports.retryApplicationSentNotification("a", now);
  assert.equal(row.status, "review_required", "quota wait crossing replay window stops at dispatch");
  assert.equal(row.leaseToken, null); assert.equal(calls, before);
  row.nextAttemptAt = new Date(0); row.status = "pending"; row.firstAttemptAt = null; clock = +now; quotaDelay = 6 * 60_000;
  await module.exports.retryApplicationSentNotification("a", now);
  assert.equal(calls, before, "expired lease cannot dispatch after quota wait");
  quotaDelay = 0; clock = +now;
  paused = true; row.status = "pending"; row.firstAttemptAt = null;
  await module.exports.retryApplicationSentNotification("a", now); assert.equal(calls, before);
  // Receipt committed, process dies before queue/upsert: next cron reconstructs only this notification.
  paused = false; row = null; quotaDelay = 0; clock = +now;
  candidates = [{ ...app, id: "legacy", submissionReceiptJson: null },
    { ...app, id: "legacy-proved", sentNotificationRequiredAt: null },
    { ...app, id: "wrong-job", job: { url: "https://boards.greenhouse.io/acme/jobs/456" } }, app];
  const beforeReconcile = calls;
  let notified = 0;
  await module.exports.reconcileApplicationSentNotifications(async (id: string) => {
    assert.equal(id, "a"); notified++; throw Error("crash before outbox creation");
  });
  assert.equal(row, null); assert.equal(calls, beforeReconcile);
  const resume = async (id: string) => { assert.equal(id, "a"); await module.exports.queueApplicationSentNotification(id, payload); };
  await Promise.all([module.exports.reconcileApplicationSentNotifications(resume), module.exports.reconcileApplicationSentNotifications(resume)]);
  assert.equal(row.status, "sent"); assert.equal(calls, beforeReconcile + 1, "concurrent reconciliation dispatches once");
  await module.exports.reconcileApplicationSentNotifications(resume);
  assert.equal(calls, beforeReconcile + 1); assert.equal(notified, 1);
  console.log("PASS receipt->outbox crash reconciliation, interrupted creator, concurrent cron/worker, duplicate cron and legacy/wrong-job exclusions");
  console.log("PASS notification proof/job binding, provider rejection, retry without application, concurrent retry, immutable payload/key, accepted-before-write crash, expiry and pause");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
