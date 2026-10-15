import { posthogMocks } from "./helpers/posthog-mocks";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import * as crypto from "node:crypto";
import ts from "typescript";

// Real production modules with hermetic database/provider boundaries. No service,
// external email, production credential or live application is reachable.
function load(path: string, dependencies: Record<string, unknown>, globals: Record<string, unknown> = {}) {
  dependencies = { ...posthogMocks, ...dependencies };
  const output = ts.transpileModule(readFileSync(path, "utf8"), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
  } }).outputText;
  const module = { exports: {} as Record<string, any> };
  vm.runInNewContext(output, { module, exports: module.exports,
    require: (id: string) => { assert.ok(id in dependencies, `Unexpected dependency ${id}`); return dependencies[id]; },
    console: { log() {}, warn() {}, error() {} }, Buffer, Date, Map, Set, URL, AbortSignal,
    ...globals,
  }, { filename: path });
  return module.exports;
}
const env: Record<string, string> = { NODE_ENV: "production", RESEND_API_KEY: "synthetic-only", INBOUND_EMAIL_DOMAIN: "inbound.example.test" };
const globals = { process: { env } };
const security = load("src/lib/application-security-code.ts", {});
const replySecurity = load("src/lib/reply-security-message.ts", { "@/lib/application-security-code": security });
const parser = load("src/lib/reply-parser.ts", { "@/lib/reply-security-message": replySecurity });
const app: Record<string, any> = { id: "app-one", userId: "user-one", userStatus: null, lastReplyAt: null, replyCount: 0, viewedAt: null,
  user: { email: "candidate@example.test" }, job: { title: "Product Designer", company: "Example Company" } };
let replies: Array<Record<string, any>> = [];
let attempts: Array<Record<string, any>> = [];
let events: Array<Record<string, any>> = [];
let forwardingCalls = 0;
let deliveredForwards = 0;
let failForward = false;
let failAfterAcceptedWrite = false;
let fetchCalls = 0;
let fetchedBody = "Hello, can we schedule an interview?";
const forwarded = new Map<string, { payload: string; id: string }>();
const matches = (row: Record<string, any>, where: Record<string, any>): boolean => Object.entries(where).every(([key, value]) => {
  if (key === "OR") return value.some((branch: any) => matches(row, branch));
  if (value && typeof value === "object" && !(value instanceof Date)) {
    if ("in" in value) return value.in.includes(row[key]);
    if ("lte" in value) return row[key] != null && row[key] <= value.lte;
    if ("not" in value) return row[key] !== value.not;
    if (key === "provider_providerMessageId") return row.provider === value.provider && row.providerMessageId === value.providerMessageId;
  }
  return row[key] === value;
});
const update = (row: Record<string, any>, data: Record<string, any>) => {
  for (const [key, value] of Object.entries(data)) row[key] = value && typeof value === "object" && "increment" in value ? (row[key] ?? 0) + value.increment : value;
  return { ...row };
};
const table = (rows: () => Array<Record<string, any>>, defaults: () => Record<string, any> = () => ({})) => ({
  findUnique: async ({ where }: any) => rows().find((row) => matches(row, where)) ?? null,
  findUniqueOrThrow: async ({ where }: any) => { const row = rows().find((row) => matches(row, where)); assert.ok(row); return { ...row }; },
  findMany: async ({ where = {}, take }: any) => rows().filter((row) => matches(row, where)).slice(0, take ?? Infinity),
  create: async ({ data }: any) => { const row = { id: `id-${crypto.randomUUID()}`, ...defaults(), ...data }; rows().push(row); return { ...row }; },
  update: async ({ where, data }: any) => { const row = rows().find((row) => matches(row, where)); assert.ok(row); return update(row, data); },
  updateMany: async ({ where, data }: any) => {
    if (data.forwardStatus === "sent" && failAfterAcceptedWrite) { failAfterAcceptedWrite = false; throw new Error("synthetic_db_write_failure"); }
    const matched = rows().filter((row) => matches(row, where)); matched.forEach((row) => update(row, data)); return { count: matched.length };
  },
  upsert: async ({ where, create }: any) => {
    const existing = rows().find((row) => matches(row, where)); if (existing) return { ...existing };
    const row = { id: `id-${crypto.randomUUID()}`, ...defaults(), ...create }; rows().push(row); return { ...row };
  },
});
const prisma: Record<string, any> = {
  application: { ...table(() => [app]), findMany: async () => [{ ...app }] },
  user: { findFirst: async () => ({ id: "user-one" }) },
  applicationReply: table(() => replies, () => ({ forwardStartedAt: null, forwardLeaseUntil: null, forwardLeaseToken: null, forwardedAt: null })),
  applicationEmailAttempt: table(() => attempts, () => ({ providerEmailId: null, acceptedAt: null, lastEventAt: null, status: "sending" })),
  emailProviderEvent: table(() => events, () => ({ processedAt: null, failureReason: null })),
};
prisma.$transaction = async (work: any) => work(prisma);
const delivery = load("src/lib/application-delivery.ts", { "@/lib/db": { prisma } });
const projection = load("src/lib/apply-reply-to-application.ts", { "@/lib/db": { prisma }, "@/lib/reply-parser": parser });
const processing = load("src/lib/application-reply-processing.ts", {
  "node:crypto": crypto, "@/lib/db": { prisma }, "@/lib/reply-parser": parser,
  "@/lib/reply-security-message": replySecurity, "@/lib/application-delivery": delivery,
  "@/lib/apply-reply-to-application": projection,
  "@/lib/email": { forwardReplyToUser: async (input: unknown, options: { idempotencyKey: string }) => {
    forwardingCalls++;
    if (failForward) throw new Error("synthetic_provider_failure");
    const previous = forwarded.get(options.idempotencyKey);
    if (previous) { assert.equal(JSON.stringify(input), previous.payload, "Retries must use frozen payload"); return previous.id; }
    const id = `provider-forward-${++deliveredForwards}`;
    forwarded.set(options.idempotencyKey, { payload: JSON.stringify(input), id });
    return id;
  } },
}, { ...globals, fetch: async (url: string) => {
  assert.ok(url.startsWith("https://api.resend.com/emails/receiving/")); fetchCalls++;
  return { ok: true, json: async () => ({ text: fetchedBody, html: null }) };
} });

async function main() {
  const secret = `whsec_${Buffer.from("synthetic-signature-key").toString("base64")}`;
  env.RESEND_WEBHOOK_SECRET = secret;
  const signature = load("src/lib/resend-webhook-signature.ts", { "node:crypto": crypto }, globals);
  const body = '{"type":"email.received"}';
  const timestamp = String(Math.floor(Date.now() / 1000));
  const id = "evt-synthetic";
  const value = crypto.createHmac("sha256", Buffer.from("synthetic-signature-key")).update(`${id}.${timestamp}.${body}`).digest("base64");
  const headers = new Headers({ "svix-id": id, "svix-timestamp": timestamp, "svix-signature": `v1,${value}` });
  assert.equal(signature.verifyResendWebhook(headers, body), true);
  assert.equal(signature.verifyResendWebhook(headers, body + "x"), false);
  assert.equal(signature.verifyResendWebhook(headers, body, Date.now() + 400_000), false);
  headers.set("svix-signature", `v2,${value}`);
  assert.equal(signature.verifyResendWebhook(headers, body), false);
  delete env.RESEND_WEBHOOK_SECRET;
  assert.equal(signature.verifyResendWebhook(headers, body), false, "No production unsigned fallback");
  env.RESEND_ALLOW_UNSIGNED_WEBHOOKS = "1";
  assert.equal(signature.verifyResendWebhook(headers, body), false, "Explicit unsigned flag cannot bypass production");
  console.log("PASS webhook signature: raw-body integrity, freshness, version, fail-closed production.");

  assert.equal(processing.inboundApplicationIds(["other@example.test", "Name <reply+app-one@inbound.example.test>"], env.INBOUND_EMAIL_DOMAIN)[0], app.id);
  assert.equal(processing.inboundApplicationIds("reply+app-one@evil.example.test", env.INBOUND_EMAIL_DOMAIN).length, 0);
  const receivedAt = new Date("2026-10-13T12:00:00Z");
  const incoming = { data: { email_id: "inbound-one", to: ["other@example.test", "reply+app-one@inbound.example.test"], from: "recruiter@example.test", subject: "Next steps" }, providerEventId: "received-one", receivedAt };
  failForward = true;
  await assert.rejects(processing.processInboundReply(incoming), /retry_required/);
  assert.equal(replies.length, 1); assert.equal(app.replyCount, 1); assert.equal(replies[0].forwardStatus, "failed");
  assert.equal(fetchCalls, 1, "Hydrate metadata-only email");
  const stored = replies[0].forwardPayloadJson;
  app.job.title = "Changed later"; app.user.email = "changed@example.test";
  failForward = false;
  await processing.processInboundReply({ ...incoming, providerEventId: "received-one-replay" });
  assert.equal(replies.length, 1); assert.equal(app.replyCount, 1); assert.equal(replies[0].forwardStatus, "sent");
  assert.equal(replies[0].forwardPayloadJson, stored);
  await processing.processInboundReply(incoming);
  assert.equal(forwardingCalls, 2, "Already sent never sends again");
  assert.equal(fetchCalls, 1, "Duplicate webhook resumes stored outbox without provider read");
  console.log("PASS inbound metadata hydration, provider-message deduplication, durable failure, stable recipient/body, retry without double count.");

  failAfterAcceptedWrite = true;
  const second = { ...incoming, data: { ...incoming.data, email_id: "inbound-two", text: "Let's arrange a call." }, providerEventId: "received-two" };
  await assert.rejects(processing.processInboundReply(second), /retry_required/);
  assert.equal(deliveredForwards, 2);
  await processing.processInboundReply(second);
  assert.equal(deliveredForwards, 2, "Crash after provider acceptance must reuse key, not deliver twice");
  assert.equal(replies[1].forwardStatus, "sent");
  const callsBeforeExpiry = forwardingCalls;
  replies[1].forwardStatus = "failed"; replies[1].forwardStartedAt = new Date(Date.now() - 23 * 60 * 60 * 1000);
  await processing.forwardStoredReply(replies[1].id);
  assert.equal(replies[1].forwardStatus, "unknown"); assert.equal(forwardingCalls, callsBeforeExpiry);
  console.log("PASS acceptance-before-DB-failure recovery and expired idempotency window blocks replay.");

  const humanCount = app.replyCount;
  const lastReplyAt = app.lastReplyAt;
  for (const [key, sender, subject, text] of [
    ["receipt", "no-reply@ats.example.test", "Application received", "We have received your application. Do not reply."],
    ["bounce", "mailer-daemon@example.test", "Undeliverable", "Mail delivery failed"],
    ["auto", "person@example.test", "Out of office", "I am out of office"],
    ["security", "no-reply@us.greenhouse-mail.io", "Verification code", "Your verification code: A1234567"],
    ["security-ashby", "no-reply@ashbyhq.com", "One-time code", "Your one-time code is 123456"],
  ]) {
    await processing.processInboundReply({ ...incoming, providerEventId: `event-${key}`, data: { ...incoming.data, email_id: `mail-${key}`, from: sender, subject, text } });
  }
  assert.equal(app.replyCount, humanCount); assert.equal(app.lastReplyAt, lastReplyAt); assert.equal(app.viewedAt, null);
  const securityRow = replies.find((row) => row.providerMessageId === "mail-security")!;
  assert.equal(securityRow.isSecurityCode, true); assert.equal(securityRow.forwardStatus, "skipped");
  assert.equal(securityRow.forwardPayloadJson, null);
  assert.equal(replySecurity.isApplicationVerificationMessage({ fromAddress: "no-reply@example.test", subject: "Undeliverable: Security code for your application" }), false);
  assert.equal(replies.find((row) => row.providerMessageId === "mail-security-ashby")?.forwardStatus, "skipped");
  assert.equal(replySecurity.isApplicationVerificationMessage({ fromAddress: "recruiter@example.test", subject: "Interview", bodyText: "Did your verification code work? Can we schedule a call?" }), false);
  console.log("PASS receipt/auto/bounce do not count as human replies or views; OTP never forwarded.");

  app.job.title = "Product Designer";
  fetchedBody = "From: Jane <jane@example.test>\nExample Company Product Designer\nLet's schedule a call.";
  const forwardResult = await processing.processInboundReply({ ...incoming, providerEventId: "event-manual", data: { email_id: "mail-manual", from: "candidate@example.test", to: "inbox@inbound.example.test", subject: "Fwd: News" } });
  assert.equal(forwardResult.matched, true, "Forwarded email body fetched before company/job matching");
  assert.equal(replies.find((r) => r.providerMessageId === "mail-manual")?.fromAddress, "Jane <jane@example.test>");
  console.log("PASS metadata-only manual forwards hydrate before matching.");

  const attempt = await delivery.createApplicationEmailAttempt({ applicationId: app.id, attemptKey: "attempt-one", recipient: "Hiring@Example.Test" });
  assert.equal(attempt.recipient, "hiring@example.test");
  const delivered = { providerEventId: "delivery-one", providerEmailId: "outbound-one", type: "email.delivered", occurredAt: new Date("2026-10-13T12:00:00Z") };
  await delivery.recordApplicationDeliveryEvent(delivered);
  assert.equal(events.length, 1); assert.equal(events[0].processedAt, null, "Unmatched event is durable");
  await delivery.recordApplicationEmailAccepted(attempt.id, "outbound-one");
  assert.equal(attempts[0].status, "delivered", "Webhook-before-acceptance race reconciled");
  await delivery.recordApplicationDeliveryEvent(delivered);
  assert.equal(events.length, 1, "Provider event replay is deduplicated");
  for (const type of ["email.sent", "email.delivery_delayed"]) await delivery.recordApplicationDeliveryEvent({ ...delivered, providerEventId: type, type, occurredAt: new Date("2026-10-13T12:02:00Z") });
  assert.equal(attempts[0].status, "delivered", "Later weaker signals cannot undo delivery");
  await delivery.recordApplicationDeliveryEvent({ ...delivered, providerEventId: "bounce-later", type: "email.bounced", occurredAt: new Date("2026-10-13T12:03:00Z") });
  assert.equal(attempts[0].status, "bounced");
  await delivery.recordApplicationEmailUncertain(attempt.id);
  await delivery.recordApplicationEmailAccepted(attempt.id, "outbound-one");
  assert.equal(attempts[0].status, "bounced", "Sender bookkeeping cannot overwrite bounce");
  await delivery.recordApplicationDeliveryEvent({ ...delivered, providerEventId: "delivery-late-arrival" });
  assert.equal(attempts[0].status, "bounced", "Stale event cannot overwrite newer bounce");
  await assert.rejects(delivery.recordApplicationEmailAccepted(attempt.id, "different-provider-id"), /immutable/);
  const lost = await delivery.createApplicationEmailAttempt({ applicationId: app.id, attemptKey: "attempt-lost-acceptance", recipient: "hiring@example.test" });
  await delivery.recordApplicationEmailUncertain(lost.id);
  await delivery.recordApplicationDeliveryEvent({ ...delivered, providerEventId: "wrong-tag-recipient", providerEmailId: "wrong-provider-id", attemptId: lost.id, recipients: ["wrong@example.test"] });
  assert.equal(attempts[1].providerEmailId, null, "Signed tag without exact recipient cannot bind");
  await delivery.recordApplicationDeliveryEvent({ ...delivered, providerEventId: "recovered-acceptance", providerEmailId: "recovered-provider-id", attemptId: lost.id, recipients: ["hiring@example.test"] });
  assert.equal(attempts[1].providerEmailId, "recovered-provider-id");
  assert.equal(attempts[1].status, "delivered", "Signed attempt+recipient recovers lost API-acceptance write without another send");
  console.log("PASS provider-ID correlation, journal deduplication, API-acceptance race, immutable mapping, monotonic delivery evidence.");

  const token = new Date("2026-10-13T10:00:00Z");
  let reconciledStatus = "ready_to_apply";
  let roundCount = 0;
  let completeCalls = 0;
  const late = load("src/lib/application-email-reconciliation.ts", {
    "@/lib/db": { prisma: { applicationEmailAttempt: { findMany: async () => reconciledStatus === "success" ? [] : [
      { applicationId: "late-app", attemptKey: `application-late-app-${token.getTime()}`, acceptedAt: receivedAt, application: { startedAt: token } },
      { applicationId: "wrong-owner", attemptKey: "application-wrong-owner-1", acceptedAt: receivedAt, application: { startedAt: token } },
    ] } } },
    "@/lib/application-worker-gates": { completeApplicationSubmission: async (id: string, owner: Date, data: any) => {
      completeCalls++;
      assert.equal(id, "late-app"); assert.equal(owner, token); assert.equal(data.submittedAt, receivedAt);
      assert.equal(data.submitConfirmation, "EMAIL_SENT");
      if (reconciledStatus === "success") return false;
      reconciledStatus = "success"; roundCount++; return true;
    } },
  });
  assert.equal((await late.reconcileAcceptedApplicationEmails()).reconciled, 1);
  assert.equal((await late.reconcileAcceptedApplicationEmails()).reconciled, 0);
  assert.equal(roundCount, 1); assert.equal(completeCalls, 1, "Wrong owner token never reaches completion");
  console.log("PASS late accepted-attempt reconciliation uses exact owner gate once and never sends email.");

  const route = load("src/app/api/webhooks/resend/route.ts", {
    "node:crypto": crypto,
    "next/server": { NextResponse: { json: (body: unknown, options?: { status: number }) => ({ body, status: options?.status ?? 200 }) } },
    "@/lib/resend-webhook-signature": { verifyResendWebhook: () => true },
    "@/lib/application-delivery": { DELIVERY_EVENT_STATUS: delivery.DELIVERY_EVENT_STATUS, recordApplicationDeliveryEvent: async () => { throw new Error("synthetic_db_failure"); } },
    "@/lib/application-reply-processing": { processInboundReply: async () => { throw new Error("synthetic_db_failure"); } },
  }, globals);
  const request = (type: string) => ({ text: async () => JSON.stringify({ type, data: { email_id: "test" } }), headers: new Headers({ "svix-id": "test" }) });
  assert.equal((await route.POST(request("email.received"))).status, 503, "Missing secret blocks production");
  env.RESEND_WEBHOOK_SECRET = secret;
  assert.equal((await route.POST(request("email.received"))).status, 500, "Every inbound storage failure retries");
  assert.equal((await route.POST(request("email.delivered"))).status, 500, "Delivery storage failure retries");
  console.log("PASS webhook fail-closed configuration and non-2xx on all processing/storage failures.");
  console.log("ALL DELIVERY/REPLY CHECKS PASSED. Isolated mocks only; database integration is a separate check.");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
