import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import ts from "typescript";
import * as crypto from "node:crypto";
import * as asyncHooks from "node:async_hooks";
import { PrismaClient } from "@prisma/client";

// Intentionally fixed local address. Ambient DATABASE_URL, API keys and fetch
// are never used. The provider SDK is replaced before any application import.
const db = new PrismaClient({ datasourceUrl: "postgresql://umbertogeraci@127.0.0.1:55439/lavorai_email_test" });
const environment: Record<string, string> = { RESEND_API_KEY: "synthetic-only", RESEND_DAILY_LIMIT: "95", RESEND_MONTHLY_LIMIT: "2900" };
let ownsFixture = false;
let mode = "success", failures = 0, crashWrites = 0, providerCalls = 0;
let starts: number[] = [];
const accepted = new Map<string, { body: string; id: string }>();
class FakeResend {
  fetchRequest = async () => { throw Error("No network allowed"); };
  emails = { send: async (payload: unknown, options: { idempotencyKey?: string } = {}) => {
    providerCalls++; starts.push(Date.now());
    if (mode === "429" && failures++ === 0) return { error: { statusCode: 429, name: "rate_limit_exceeded" }, data: null };
    if (mode === "reject") return { error: { statusCode: 422, name: "validation_error" }, data: null };
    if (mode === "missing") return { data: {}, error: null };
    const key = options.idempotencyKey ?? crypto.randomUUID();
    const body = JSON.stringify(payload);
    if (accepted.has(key)) assert.equal(accepted.get(key)!.body, body, "retry payload immutable");
    else accepted.set(key, { body, id: `fixture-${accepted.size}` });
    if (mode === "timeout") throw Error("accepted but response lost");
    return { data: { id: accepted.get(key)!.id }, error: null };
  } };
}
const instrumentedDb = new Proxy(db, { get(target, property) {
  if (property === "emailOutbox") return new Proxy(db.emailOutbox, { get(table, method) {
    if (method === "updateMany") return async (query: any) => {
      if (crashWrites && ["sent", "pending"].includes(query.data.status)) { crashWrites--; throw Error("process died after acceptance"); }
      return db.emailOutbox.updateMany(query);
    };
    return Reflect.get(table, method);
  } });
  return Reflect.get(target, property);
} });
const cache = new Map<string, any>();
const allowed = new Set(["email-context", "email-dispatch-policy", "email-dispatch", "resend", "email-outbox", "email-quota", "application-pause"]);
function load(name: string): any {
  if (cache.has(name)) return cache.get(name);
  assert.ok(allowed.has(name), `Unexpected executable dependency blocked: ${name}`);
  const module = { exports: {} }; cache.set(name, module.exports);
  vm.runInNewContext(ts.transpileModule(readFileSync(`src/lib/${name}.ts`, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { module, exports: module.exports, Date, Buffer, AbortSignal, setTimeout, console,
    process: { env: environment },
    fetch: () => { throw Error("Network disabled"); },
    require: (id: string) => {
      if (id === "node:crypto") return crypto;
      if (id === "node:async_hooks") return asyncHooks;
      if (id === "resend") return { Resend: FakeResend };
      if (id === "@/lib/db") return { prisma: instrumentedDb };
      if (id.startsWith("@/lib/")) return load(id.slice(6));
      throw Error(`Unexpected dependency: ${id}`);
    },
  });
  return module.exports;
}
const queue = load("email-outbox");
const gate = load("email-dispatch");
const policy = load("email-dispatch-policy");
const payload = (subject: string) => ({ from: "fixture@example.invalid", to: "fixture@example.invalid", subject, text: "fixture only",
  attachments: [{ filename: "fixture.txt", content: Buffer.from("immutable bytes") }] });
async function reset() {
  await db.emailOutbox.deleteMany(); await db.emailLog.deleteMany(); await db.emailReservation.deleteMany(); await db.emailDispatchGate.deleteMany();
  accepted.clear(); starts = []; mode = "success"; failures = 0; crashWrites = 0; providerCalls = 0;
  environment.RESEND_DAILY_LIMIT = "95"; environment.RESEND_MONTHLY_LIMIT = "2900";
}
async function ready(id: string) {
  await db.emailOutbox.update({ where: { id }, data: { nextAttemptAt: new Date(0), leaseUntil: new Date(0) } });
}
async function rowFor(subject: string) {
  return db.emailOutbox.findFirstOrThrow({ where: { payloadJson: { contains: `"subject":"${subject}"` } } });
}
async function main() {
  assert.equal(await db.user.count(), 0, "Refuse a populated database");
  ownsFixture = true;
  await db.user.create({ data: { id: "fixture", email: "fixture@example.invalid" } });
  await reset();
  const kinds = ["onboarding_nudge", "upgrade_nudge", "daily_summary", "weekly_digest", "trial_day_3", "checkout_recovery", "checkout_feedback"];
  const results = await Promise.all(kinds.map(kind => queue.sendQueuedNotification(kind, "fixture@example.invalid", async () => payload(kind))));
  assert.ok(results.every(r => r.sent), JSON.stringify({ results, rows: await db.emailOutbox.findMany({ select: { status: true, error: true } }) })); assert.equal(providerCalls, 7);
  assert.ok(starts.slice(1).every((t, i) => t - starts[i] >= 240), "seven concurrent producers share rate spacing");
  assert.equal(await db.emailReservation.count(), 7); assert.equal(await db.emailLog.count(), 7);
  console.log("PASS seven concurrent producers, shared database rate gate, truthful accepted logs");

  await reset();
  await Promise.all([1, 2, 3].map(i => promisify(execFile)(process.execPath,
    ["--import", "tsx", "scripts/test-email-reliability-postgres.ts", "--producer", String(i)],
    { env: { PATH: process.env.PATH }, cwd: process.cwd() })));
  assert.equal(await db.emailLog.count(), 3); assert.equal(await db.emailReservation.count(), 3);
  console.log("PASS shared gate across three independent Node processes");

  await reset(); environment.RESEND_DAILY_LIMIT = "2";
  await Promise.all(Array.from({ length: 7 }, (_, i) => queue.sendQueuedNotification("cv_ready", "fixture@example.invalid", async () => payload(`quota-${i}`))));
  assert.equal(providerCalls, 2); assert.equal(await db.emailReservation.count(), 2); assert.equal(await db.emailLog.count(), 2);
  assert.equal(await db.emailOutbox.count({ where: { status: "pending" } }), 5);
  console.log("PASS atomic quota boundary: seven contenders, exactly two reservations/acceptances");

  await reset(); environment.RESEND_DAILY_LIMIT = "5";
  await db.emailReservation.createMany({ data: Array.from({ length: 4 }, (_, i) => ({ id: `baseline-${i}` })) });
  await assert.rejects(gate.acquireEmailDispatch("weekly_digest"), /email_quota_wait/);
  const essential = await gate.acquireEmailDispatch("password_reset"); await gate.releaseEmailDispatch(essential.token);
  assert.equal(await db.emailReservation.count(), 5);
  console.log("PASS essential capacity reserved from routine email quota");

  await reset(); mode = "429";
  assert.equal((await queue.sendQueuedNotification("cv_ready", "fixture@example.invalid", async () => payload("retry"))).sent, false);
  let row = await rowFor("retry"); assert.equal(row.status, "pending"); assert.equal(row.attempts, 1); assert.equal(await db.emailLog.count(), 0);
  assert.ok(+row.nextAttemptAt >= +row.firstAttemptAt! + 29_000);
  await queue.dispatchEmailNotification(row.id); assert.equal(providerCalls, 1, "backoff forbids immediate retry");
  await ready(row.id); assert.equal((await queue.dispatchEmailNotification(row.id)).sent, true);
  assert.equal(providerCalls, 2); assert.equal(accepted.size, 1); assert.equal(await db.emailReservation.count(), 1);
  console.log("PASS 429 then success, bounded backoff, same reservation and provider idempotency key");

  await reset(); crashWrites = 2;
  await assert.rejects(queue.sendQueuedNotification("cv_ready", "fixture@example.invalid", async () => payload("crash")));
  row = await rowFor("crash"); assert.equal(row.status, "sending"); assert.equal(row.providerEmailId, null); assert.equal(accepted.size, 1);
  await ready(row.id);
  await Promise.all([queue.dispatchEmailNotification(row.id), queue.dispatchEmailNotification(row.id)]);
  row = await rowFor("crash"); assert.equal(row.status, "sent"); assert.equal(accepted.size, 1); assert.equal(providerCalls, 2);
  assert.equal(await db.emailLog.count(), 1);
  console.log("PASS hard crash after acceptance, lease recovery and concurrent idempotent replay");

  await reset(); mode = "timeout";
  await queue.sendQueuedNotification("cv_ready", "fixture@example.invalid", async () => payload("unknown"));
  row = await rowFor("unknown"); assert.equal(row.status, "pending"); assert.equal(await db.emailLog.count(), 0);
  await db.emailOutbox.update({ where: { id: row.id }, data: { nextAttemptAt: new Date(0), firstAttemptAt: new Date(Date.now() - policy.EMAIL_RETRY_WINDOW_MS - 1) } });
  mode = "success"; await queue.dispatchEmailNotification(row.id);
  assert.equal((await rowFor("unknown")).status, "review_required"); assert.equal(providerCalls, 1);
  console.log("PASS timeout ambiguity never marked sent; expired provider window never replayed");

  await reset(); mode = "timeout";
  await queue.sendQueuedNotification("onboarding_nudge", "fixture@example.invalid", async () => payload("old campaign"));
  row = await rowFor("old campaign");
  await db.emailOutbox.update({ where: { id: row.id }, data: { nextAttemptAt: new Date(0), createdAt: new Date(Date.now() - 86400_000),
    firstAttemptAt: new Date(Date.now() - policy.EMAIL_RETRY_WINDOW_MS - 1) } });
  await queue.dispatchEmailNotification(row.id);
  mode = "success";
  const fenced = await queue.sendQueuedNotification("onboarding_nudge", "fixture@example.invalid", async () => payload("new day and changed rendering"));
  assert.equal(fenced.reason, "review_required"); assert.equal(providerCalls, 1); assert.equal(await db.emailOutbox.count(), 1);
  console.log("PASS new campaign/day cannot bypass unresolved acceptance or expired idempotency window");

  for (const failure of ["reject", "missing"]) {
    await reset(); mode = failure;
    await queue.sendQueuedNotification("cv_ready", "fixture@example.invalid", async () => payload(failure));
    row = await rowFor(failure); assert.equal(row.sentAt, null); assert.equal(row.providerEmailId, null); assert.equal(await db.emailLog.count(), 0);
    assert.equal(row.status, failure === "reject" ? "failed" : "pending");
    if (failure === "missing") {
      await db.emailOutbox.update({ where: { id: row.id }, data: { attempts: policy.EMAIL_MAX_ATTEMPTS, nextAttemptAt: new Date(0) } });
      await queue.dispatchEmailNotification(row.id); assert.equal(providerCalls, 1);
    }
  }
  console.log("PASS provider errors/missing ID never sent, permanent failure and bounded attempts");

  await reset();
  await queue.sendQueuedNotification("application_manual", "fixture@example.invalid", async () => payload("manual"), "application/1");
  await queue.sendQueuedNotification("application_manual", "fixture@example.invalid", async () => payload("changed rendering"), "application/1");
  assert.equal(providerCalls, 1); assert.equal(await db.emailOutbox.count(), 1);
  assert.equal(await db.application.count(), 0); assert.equal(await db.applicationEmailAttempt.count(), 0);
  console.log("PASS stable event key, notification retries cannot create/retry recruiter applications");

  await reset(); mode = "429";
  await queue.sendQueuedNotification("cv_ready", "fixture@example.invalid", async () => payload("suspended"));
  row = await rowFor("suspended"); await ready(row.id);
  await db.user.update({ where: { id: "fixture" }, data: { suspendedAt: new Date() } });
  await queue.dispatchEmailNotification(row.id); assert.equal(providerCalls, 1); assert.equal((await rowFor("suspended")).status, "failed");
  await db.user.delete({ where: { id: "fixture" } }); assert.equal(await db.emailOutbox.count(), 0);
  console.log("PASS current recipient suspension and account-deletion payload cascade");
}
const task = process.argv[2] === "--producer"
  ? queue.sendQueuedNotification("cv_ready", "fixture@example.invalid", async () => payload(`process-${process.argv[3]}`)).then((result: any) => assert.equal(result.sent, true)).finally(() => db.$disconnect())
  : main().finally(async () => {
  if (!ownsFixture) { await db.$disconnect(); return; }
  await db.emailOutbox.deleteMany(); await db.emailLog.deleteMany(); await db.emailReservation.deleteMany(); await db.emailDispatchGate.deleteMany();
  await db.user.deleteMany({ where: { id: "fixture" } }); await db.$disconnect();
});
task.catch(error => { console.error(error); process.exitCode = 1; });
