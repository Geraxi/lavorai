import * as emailPolicy from "../src/lib/email-dispatch-policy";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import * as receipts from "../src/lib/submission-receipt";

// Dedicated local fixture only; never accepts ambient production connection strings.
const url = "postgresql://umbertogeraci@127.0.0.1:55463/lavorai_task3_fixture";
const db = new PrismaClient({ datasourceUrl: url });
let providerCalls = 0;
const accepted = new Map<string, string>();
let failWrite = false;
let rejectProvider = false;
const quota = async (_kind: string, _recipient: string, send: () => Promise<void>) => {
  try { await send(); return { sent: true }; } catch { return { sent: false, reason: "fixture_failure" }; }
};
const notificationDb = {
  application: db.application,
  applicationSentNotification: {
    findUnique: db.applicationSentNotification.findUnique.bind(db.applicationSentNotification),
    findMany: db.applicationSentNotification.findMany.bind(db.applicationSentNotification),
    upsert: db.applicationSentNotification.upsert.bind(db.applicationSentNotification),
    updateMany: async (query: any) => {
      if (query.data.status === "sent" && failWrite) { failWrite = false; throw Error("crash after provider acceptance"); }
      return db.applicationSentNotification.updateMany(query);
    },
  },
};
const deps: Record<string, unknown> = {
  "@/lib/email-dispatch-policy": emailPolicy,
  "@/lib/email-context": { emailContext: { run: (_context: unknown, fn: () => unknown) => fn() } },
  "node:crypto": { randomUUID }, "@/lib/db": { prisma: notificationDb },
  "@/lib/submission-receipt": receipts, "@/lib/application-pause": { applicationsPaused: () => false },
  "@/lib/email-quota": { sendWithinQuota: quota },
  "@/lib/resend": { Resend: class { emails = { send: async (payload: any, options: any) => {
    providerCalls++;
    await new Promise(resolve => setTimeout(resolve, 20));
    if (rejectProvider) return { error: { message: "synthetic rejection" } };
    const key = options.idempotencyKey;
    const body = JSON.stringify(payload);
    if (accepted.has(key)) assert.equal(accepted.get(key), body);
    else accepted.set(key, body);
    return { data: { id: `fixture-${key}` } };
  } }; } },
};
const module = { exports: {} as any };
vm.runInNewContext(ts.transpileModule(readFileSync("src/lib/application-sent-notification.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { module, exports: module.exports, Date, process: { env: { RESEND_API_KEY: "synthetic-only" } },
  require: (id: string) => { assert.ok(id in deps, `Network/unexpected dependency blocked: ${id}`); return deps[id]; } });
const notifications = module.exports;
async function main() {
  assert.equal(await db.user.count(), 0, "Refuse to use a populated database");
  await db.user.create({ data: { id: "fixture-user", email: "fixture@example.invalid" } });
  await db.job.create({ data: { id: "fixture-job", externalId: "fixture-job", source: "fixture", title: "Fixture",
    description: "Synthetic", url: "https://boards.greenhouse.io/fixture/jobs/123" } });
  const proof = JSON.stringify({ version: 1, provider: "greenhouse", kind: "dom", capturedAt: new Date().toISOString(),
    jobId: "123", signal: "new_receipt_and_form_removed" });
  const base = { userId: "fixture-user", jobId: "fixture-job", portal: "greenhouse", status: "success", sentNotificationRequiredAt: new Date(), submittedAt: new Date(), submittedVia: "portal_greenhouse" };
  // Simulate a committed receipt followed by process death, before any notification call.
  await db.application.create({ data: { ...base, id: "proved", submissionReceiptJson: proof } });
  await db.application.create({ data: { ...base, id: "legacy", sentNotificationRequiredAt: null } });
  await db.application.create({ data: { ...base, id: "wrong-job", submissionReceiptJson: proof.replace('"123"', '"456"') } });
  await db.application.create({ data: { ...base, id: "legacy-proved", submissionReceiptJson: proof, sentNotificationRequiredAt: null } });
  assert.equal(await db.applicationSentNotification.count(), 0);
  const payload = { from: "fixture@example.invalid", to: "fixture@example.invalid", subject: "Fixture", html: "Fixture", text: "Fixture" };
  let crashCalls = 0;
  await notifications.reconcileApplicationSentNotifications(async (id: string) => {
    assert.equal(id, "proved"); crashCalls++; throw Error("crash before intent creation");
  });
  assert.equal(crashCalls, 1); assert.equal(await db.applicationSentNotification.count(), 0);
  const notify = async (id: string) => { assert.equal(id, "proved"); await notifications.queueApplicationSentNotification(id, payload); };
  await db.applicationSentNotification.updateMany({ data: { nextAttemptAt: new Date(0) } });
  await Promise.all(Array.from({ length: 4 }, () => notifications.reconcileApplicationSentNotifications(notify)));
  assert.equal(providerCalls, 1); assert.equal(accepted.size, 1);
  assert.equal(await db.applicationSentNotification.count(), 1);
  assert.equal((await db.applicationSentNotification.findUniqueOrThrow({ where: { applicationId: "proved" } })).status, "sent");
  await notifications.reconcileApplicationSentNotifications(notify); assert.equal(providerCalls, 1);
  console.log("PASS PostgreSQL: receipt commit/crash gap, interrupted creator, 4 concurrent reconcilers, single persisted intent/send, legacy and wrong-job excluded");

  await db.application.create({ data: { ...base, id: "provider-crash", submissionReceiptJson: proof } });
  failWrite = true;
  await notifications.queueApplicationSentNotification("provider-crash", payload);
  assert.equal((await db.applicationSentNotification.findUniqueOrThrow({ where: { applicationId: "provider-crash" } })).status, "pending");
  const before = providerCalls;
  await db.applicationSentNotification.updateMany({ data: { nextAttemptAt: new Date(0) } });
  await Promise.all(Array.from({ length: 4 }, () => notifications.reconcileApplicationSentNotifications(notify)));
  assert.equal(providerCalls, before + 1); assert.equal(accepted.size, 2);
  assert.equal((await db.applicationSentNotification.findUniqueOrThrow({ where: { applicationId: "provider-crash" } })).status, "sent");
  assert.equal(await db.application.count({ where: { status: "success" } }), 5);
  console.log("PASS PostgreSQL: provider acceptance/write-crash, concurrent notification-only retries, stable key/payload, application status unchanged");

  await db.application.create({ data: { ...base, id: "rejected", submissionReceiptJson: proof } });
  rejectProvider = true;
  await notifications.queueApplicationSentNotification("rejected", payload);
  assert.equal((await db.applicationSentNotification.findUniqueOrThrow({ where: { applicationId: "rejected" } })).status, "pending");
  rejectProvider = false;
  await db.applicationSentNotification.updateMany({ data: { nextAttemptAt: new Date(0) } });
  await notifications.reconcileApplicationSentNotifications(notify);
  assert.equal((await db.applicationSentNotification.findUniqueOrThrow({ where: { applicationId: "rejected" } })).status, "sent");
  assert.equal(accepted.size, 3);
  console.log("PASS PostgreSQL: rejected notification resumes from outbox without submitting the application; zero real HTTP");
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => db.$disconnect());
