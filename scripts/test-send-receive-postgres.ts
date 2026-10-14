import assert from "node:assert/strict";
import ts from "typescript";
import vm from "node:vm";
import { execFileSync } from "node:child_process";
import { createHmac } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

async function main() {
  // Synthetic localhost only. Never consume ambient production credentials.
  const port = 55455;
  // CI may provide a separately created EMPTY fixture database. Never accept
  // the ordinary ambient DATABASE_URL or a non-local / business database.
  const fixtureUrl = process.env.SEND_REPLY_TEST_DATABASE_URL;
  if (fixtureUrl) {
    const target = new URL(fixtureUrl);
    assert.ok(["postgres:", "postgresql:"].includes(target.protocol));
    assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(target.hostname), "Test database must be localhost");
    assert.match(target.pathname, /^\/lavorai_send_reply_test(?:_[a-z0-9]+)?$/, "Test database must have a dedicated fixture name");
  }
  process.env.DATABASE_URL = fixtureUrl ?? `postgresql://postgres:password@127.0.0.1:${port}/postgres?connection_limit=16`;
  process.env.DIRECT_URL = process.env.DATABASE_URL;
  (process.env as Record<string, string>).NODE_ENV = "test";
  process.env.RESEND_API_KEY = "re_synthetic_test_only";
  process.env.INBOUND_EMAIL_DOMAIN = "inbound.example.invalid";
  process.env.RESEND_FROM_OVERRIDE = "LavorAI <notifications@example.invalid>";
  process.env.RESEND_WEBHOOK_SECRET = `whsec_${Buffer.from("local-test-signature-key").toString("base64")}`;
  const dir = await mkdtemp(join(tmpdir(), "lavorai-send-reply-postgres-"));
  let pg: { initialise(): Promise<void>; start(): Promise<void>; stop(): Promise<void> } | undefined;
  if (!fixtureUrl) {
    const dependency = process.env.WORKER_TEST_EMBEDDED_POSTGRES ?? "embedded-postgres";
    const { default: EmbeddedPostgres } = await import(dependency);
    pg = new EmbeddedPostgres({ databaseDir: join(dir, "data"), port, persistent: false,
      postgresFlags: ["-h", "127.0.0.1", "-c", "unix_socket_directories="], onLog() {}, onError() {} });
  }
  let db: import("@prisma/client").PrismaClient | undefined;
  const originalFetch = globalThis.fetch;
  const forwarded = new Map<string, { id: string; body: string }>();
  let forwardCalls = 0;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    assert.equal(url, "https://api.resend.com/emails", "No real network is allowed in this test");
    assert.equal(init?.method, "POST");
    forwardCalls++;
    const headers = new Headers(init?.headers);
    const key = headers.get("idempotency-key");
    assert.ok(key, "Every forward retry needs stable provider idempotency");
    const body = String(init?.body);
    let saved = forwarded.get(key);
    if (saved) assert.equal(body, saved.body, "Retries preserve the entire provider payload");
    else { saved = { id: `forward-${forwarded.size + 1}`, body }; forwarded.set(key, saved); }
    return new Response(JSON.stringify({ id: saved.id }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    if (pg) { await pg.initialise(); await pg.start(); }
    const { prisma } = await import("../src/lib/db"); db = prisma;
    // Prove the actual additive migration on a populated legacy schema.
    const fullSchema = await readFile("prisma/schema.prisma", "utf8");
    const baselineSchema = fullSchema
      .replace(/^.*submissionReceiptJson.*\n/gm, "").replace(/^.*userProvidedAnswersJson.*\n/gm, "").replace(/^.*consentGrantedAt.*\n/gm, "")
      .replace(/^.*emailAttempts\s+ApplicationEmailAttempt\[\].*\n/gm, "")
      .replace(/model ApplicationEmailAttempt \{[\s\S]*?\n\}/, "")
      .replace(/model EmailProviderEvent \{[\s\S]*?\n\}/, "")
      .replace(/^.*(?:providerMessageId|providerEventId|isSecurityCode|processingAppliedAt|forwardStatus|forwardPayloadJson|forwardIdempotencyKey|forwardStartedAt|forwardLeaseUntil|forwardLeaseToken|forwardedAt|forwardProviderId|forwardError).*\n/gm, "")
      .replace(/^  provider\s+String\?\s*\n/gm, "");
    const baselinePath = join(dir, "baseline.prisma");
    await writeFile(baselinePath, baselineSchema);
    const sql = execFileSync(process.execPath, [resolve("node_modules/prisma/build/index.js"), "migrate", "diff", "--from-empty", "--to-schema-datamodel", baselinePath, "--script"], { encoding: "utf8", env: process.env });
    for (const statement of sql.split(/;\s*(?:\n|$)/).filter((s) => s.trim())) await db.$executeRawUnsafe(statement);
    await db.$executeRaw`INSERT INTO "User" (id,email,"createdAt") VALUES ('legacy-user','legacy@example.invalid',CURRENT_TIMESTAMP)`;
    await db.$executeRaw`INSERT INTO "Job" (id,"externalId",source,title,description,url,"cachedAt") VALUES ('legacy-job','legacy-job','synthetic','Legacy fixture','Synthetic','https://example.invalid/legacy',CURRENT_TIMESTAMP)`;
    await db.$executeRaw`INSERT INTO "Application" (id,"userId","jobId",portal,status,"createdAt","submittedVia","submitConfirmation") VALUES ('legacy-app','legacy-user','legacy-job','synthetic','success',CURRENT_TIMESTAMP,'portal_ashby','DETECTED_HTTP_200')`;
    const migration = await readFile("prisma/migrations/20261013161000_application_delivery_replies/migration.sql", "utf8");
    await db.$transaction(async (tx) => {
      for (const statement of migration.split(/;\s*(?:\n|$)/).filter((s) => s.trim())) await tx.$executeRawUnsafe(statement);
    });
    const legacy = await db.application.findUniqueOrThrow({ where: { id: "legacy-app" } });
    assert.equal(legacy.status, "success"); assert.equal(legacy.submissionReceiptJson, null); assert.equal(legacy.consentGrantedAt, null); assert.equal(legacy.userProvidedAnswersJson, null);
    console.log("PASS PostgreSQL: additive migration preserves populated legacy outcomes without invented proof/consent.");

    const delivery = await import("../src/lib/application-delivery");
    const { sendRecruiterEmailOnce } = await import("../src/lib/recruiter-delivery");
    const { processInboundReply, retryPendingReplyForwards } = await import("../src/lib/application-reply-processing");
    const { applicationDeliveryView } = await import("../src/lib/application-delivery-view");
    const { POST: webhook } = await import("../src/app/api/webhooks/resend/route");
    const { NextRequest } = await import("next/server");
    const now = new Date();
    const user = await db.user.create({ data: { id: "synthetic-user", email: "candidate@example.invalid", tier: "pro", emailVerified: now, privacyConsentAt: now,
      subscriptionStatus: "active", currentPeriodEnd: new Date(+now + 86400000), preferences: { create: { autoApplyMode: "auto" } } } });
    const job = await db.job.create({ data: { externalId: "synthetic-job", source: "synthetic", title: "Product Designer", company: "Acme", description: "Synthetic role", url: "https://acme.example.invalid/jobs/1" } });
    const app = await db.application.create({ data: { id: "synthetic-application", userId: user.id, jobId: job.id, portal: "email", status: "applying", submitConfirmation: "SUBMISSION_STARTED", startedAt: now } });
    let sends = 0;
    const submission = { applicationId: app.id, attemptKey: "synthetic-attempt", recipient: "careers@acme.example.invalid", recipientProvenanceJson: '{"source":"synthetic"}',
      payload: { from: "LavorAI <applications@example.invalid>", to: "ignored@example.invalid", subject: "Synthetic application", text: "Synthetic only" } };
    const callbacks = { withinQuota: async (_kind: unknown, _to: unknown, callback: () => Promise<void>) => { await callback(); return { sent: true, reason: null }; },
      send: async (payload: { to: unknown }, key: string) => { sends++; assert.equal(payload.to, submission.recipient); assert.equal(key, submission.attemptKey); return { data: { id: "provider-synthetic-1" }, error: null }; } };
    const results = await Promise.all(Array.from({ length: 12 }, () => sendRecruiterEmailOnce(submission, callbacks)));
    assert.equal(results.filter((r) => r.kind === "accepted").length, 1); assert.equal(sends, 1);
    assert.equal(await db.applicationEmailAttempt.count({ where: { applicationId: app.id } }), 1);
    let attempt = await db.applicationEmailAttempt.findUniqueOrThrow({ where: { attemptKey: submission.attemptKey } });
    assert.equal(attempt.status, "accepted");
    console.log("PASS PostgreSQL: 12 concurrent outbound invocations persist one immutable attempt and make one synthetic provider send.");

    const event = { providerEventId: "delivery-evt", providerEmailId: "provider-synthetic-1", type: "email.delivered", occurredAt: now };
    await Promise.all(Array.from({ length: 12 }, () => delivery.recordApplicationDeliveryEvent(event)));
    assert.equal(await db.emailProviderEvent.count({ where: { providerEventId: event.providerEventId } }), 1);
    await delivery.recordApplicationDeliveryEvent({ ...event, providerEventId: "old-delayed-evt", type: "email.delivery_delayed", occurredAt: new Date(+now - 1000) });
    attempt = await db.applicationEmailAttempt.findUniqueOrThrow({ where: { id: attempt.id } }); assert.equal(attempt.status, "delivered");
    await delivery.recordApplicationDeliveryEvent({ ...event, providerEventId: "bounce-evt", type: "email.bounced", occurredAt: new Date(+now + 1000) });
    attempt = await db.applicationEmailAttempt.findUniqueOrThrow({ where: { id: attempt.id } }); assert.equal(attempt.status, "bounced");
    assert.equal(applicationDeliveryView({ ...app, emailAttempts: [attempt] }).phase, "failed");
    await delivery.recordApplicationDeliveryEvent({ providerEventId: "early-evt", providerEmailId: "early-provider", type: "email.delivered", occurredAt: now });
    const early = await delivery.createApplicationEmailAttempt({ applicationId: app.id, attemptKey: "early-attempt", recipient: submission.recipient });
    await delivery.recordApplicationEmailAccepted(early.id, "early-provider");
    assert.equal((await db.applicationEmailAttempt.findUniqueOrThrow({ where: { id: early.id } })).status, "delivered");
    console.log("PASS PostgreSQL: duplicate/out-of-order delivery journal and webhook-before-acceptance reconciliation are durable.");
    const tagged = await delivery.createApplicationEmailAttempt({ applicationId: app.id, attemptKey: "tagged-attempt", recipient: submission.recipient });
    const taggedEvent = { providerEventId: "tagged-provider-event", providerEmailId: "tagged-provider-id", type: "email.delivered", occurredAt: now };
    await delivery.recordApplicationDeliveryEvent({ ...taggedEvent, attemptId: tagged.id, recipients: ["wrong@acme.example.invalid"] });
    assert.equal((await db.applicationEmailAttempt.findUniqueOrThrow({ where: { id: tagged.id } })).providerEmailId, null);
    await delivery.recordApplicationDeliveryEvent({ ...taggedEvent, attemptId: tagged.id, recipients: [submission.recipient, "extra@example.invalid"] });
    assert.equal((await db.applicationEmailAttempt.findUniqueOrThrow({ where: { id: tagged.id } })).providerEmailId, null);
    await delivery.recordApplicationDeliveryEvent({ ...taggedEvent, attemptId: tagged.id, recipients: [submission.recipient] });
    const bound = await db.applicationEmailAttempt.findUniqueOrThrow({ where: { id: tagged.id } });
    assert.equal(bound.providerEmailId, taggedEvent.providerEmailId); assert.equal(bound.status, "delivered");
    console.log("PASS PostgreSQL: signed-tag crash recovery binds only the exact immutable recipient and replays durable orphan events.");


    const inbound = { data: { email_id: "inbound-synthetic-1", to: [`reply+${app.id}@inbound.example.invalid`], from: "Recruiter <recruiter@acme.example.invalid>", subject: "Meeting", text: "Are you available for a call next week?" }, providerEventId: "inbound-event-1", receivedAt: now };
    const duplicates = await Promise.allSettled(Array.from({ length: 12 }, () => processInboundReply(inbound)));
    assert(duplicates.some((r) => r.status === "fulfilled"));
    await processInboundReply(inbound);
    assert.equal(await db.applicationReply.count({ where: { applicationId: app.id } }), 1);
    assert.equal((await db.application.findUniqueOrThrow({ where: { id: app.id } })).replyCount, 1);
    assert.equal(forwarded.size, 1);
    const reply = await db.applicationReply.findFirstOrThrow({ where: { applicationId: app.id } });
    assert.equal(reply.forwardStatus, "sent"); assert.equal(reply.kind, "colloquio");
    console.log("PASS PostgreSQL: concurrent duplicate inbound creates one owner-scoped visible reply, increments once and forwards once.");

    for (const [suffix, subject, text, from] of [
      ["receipt", "Application received", "We have received your application. Do not reply to this email.", "noreply@acme.example.invalid"],
      ["bounce", "Mail delivery failed", "Delivery failure", "mailer-daemon@acme.example.invalid"],
      ["otp", "Security code", "Your verification code is 654321.", "no-reply@greenhouse.io"],
    ]) await processInboundReply({ ...inbound, data: { ...inbound.data, email_id: `inbound-${suffix}`, subject, text, from }, providerEventId: `event-${suffix}` });
    assert.equal((await db.application.findUniqueOrThrow({ where: { id: app.id } })).replyCount, 1);
    const otp = await db.applicationReply.findFirstOrThrow({ where: { providerMessageId: "inbound-otp" } });
    assert.equal(otp.isSecurityCode, true); assert.equal(otp.forwardStatus, "skipped");
    console.log("PASS PostgreSQL: receipts/bounces/OTP never inflate human replies; machine security code remains hidden and unforwarded.");

    // Simulate crash AFTER provider acceptance but BEFORE the outbox saved its ID.
    const update = db.applicationReply.updateMany.bind(db.applicationReply);
    let failOnce = true;
    (db.applicationReply as any).updateMany = async (args: any) => {
      if (failOnce && args.data.forwardStatus === "sent") { failOnce = false; throw new Error("synthetic DB write failure after provider acceptance"); }
      return update(args);
    };
    const newInbound = { ...inbound, data: { ...inbound.data, email_id: "inbound-crash", subject: "Follow-up", text: "Please share your availability." }, providerEventId: "event-crash" };
    const beforeUnique = forwarded.size;
    await assert.rejects(processInboundReply(newInbound), /retry_required/);
    await retryPendingReplyForwards(20);
    (db.applicationReply as any).updateMany = update;
    assert.equal(forwarded.size, beforeUnique + 1, "Provider stable key prevents duplicate forwarded mail after crash");
    assert.equal((await db.applicationReply.findFirstOrThrow({ where: { providerMessageId: "inbound-crash" } })).forwardStatus, "sent");
    console.log("PASS PostgreSQL: provider-accepted/outbox-write crash retries the same payload/key without duplicating user notification.");

    const raw = JSON.stringify({ type: "email.received", created_at: now.toISOString(), data: { ...inbound.data, email_id: "webhook-signed-message" } });
    const timestamp = String(Math.floor(Date.now() / 1000));
    const sig = createHmac("sha256", Buffer.from("local-test-signature-key")).update(`signed-event.${timestamp}.${raw}`).digest("base64");
    const request = () => new NextRequest("https://app.example.invalid/api/webhooks/resend", { method: "POST", body: raw, headers: { "svix-id": "signed-event", "svix-timestamp": timestamp, "svix-signature": `v1,${sig}` } });
    assert.equal((await webhook(request())).status, 200);
    assert.equal((await webhook(request())).status, 200);
    assert.equal((await webhook(new NextRequest("https://app.example.invalid/api/webhooks/resend", { method: "POST", body: raw }))).status, 401);
    assert.equal(await db.applicationReply.count({ where: { providerMessageId: "webhook-signed-message" } }), 1);
    assert(forwardCalls >= forwarded.size);
    console.log("PASS PostgreSQL + route: genuine synthetic signature verifies; unsigned rejected; duplicate signed webhook remains one message.");
    const { reconcileAcceptedApplicationEmails } = await import("../src/lib/application-email-reconciliation");
    const raceSession = await db.applicationSession.create({ data: { userId: user.id, key: "race", label: "race", targetCount: 10 } });
    const raceApp = await db.application.create({ data: { userId: user.id, jobId: job.id, sessionId: raceSession.id, portal: "email", status: "applying", submitConfirmation: "SUBMISSION_STARTED", startedAt: now } });
    const raceAttempt = await delivery.createApplicationEmailAttempt({ applicationId: raceApp.id, attemptKey: `application-${raceApp.id}-${now.getTime()}`, recipient: submission.recipient });
    await delivery.recordApplicationEmailAccepted(raceAttempt.id, "provider-race");
    assert.equal((await reconcileAcceptedApplicationEmails()).reconciled, 1);
    // Execute the actual parsed production email-failure write, not a reimplementation.
    const workerSource = await readFile("src/lib/application-worker.ts", "utf8");
    const ast = ts.createSourceFile("worker.ts", workerSource, ts.ScriptTarget.Latest, true);
    let failureWrite: string | null = null;
    function visit(node: ts.Node) {
      if (ts.isAwaitExpression(node) && /prisma\.application\.update/.test(node.getText(ast)) && node.getText(ast).includes('delivered.kind === "not_sent"')) failureWrite = node.getText(ast);
      ts.forEachChild(node, visit);
    }
    visit(ast); assert.ok(failureWrite);
    const executeFailure = new vm.Script(`(async () => { ${failureWrite}; })()`, { filename: "actual-worker-email-failure-write" });
    await executeFailure.runInNewContext({ prisma: db, applicationId: raceApp.id, workToken: now, delivered: { kind: "uncertain" }, NOT_SUBMITTED: "NOT_SUBMITTED", Date });
    assert.equal((await db.application.findUniqueOrThrow({ where: { id: raceApp.id } })).status, "success", "Stale failure cannot overwrite reconciled success");
    assert.equal((await reconcileAcceptedApplicationEmails()).reconciled, 0);
    assert.equal((await db.applicationSession.findUniqueOrThrow({ where: { id: raceSession.id } })).sentCount, 1);
    console.log("PASS independent PostgreSQL review: actual worker ambiguous-outcome write cannot downgrade concurrent reconciled success or double-increment round.");
    const deniedApp = await db.application.create({ data: { userId: user.id, jobId: job.id, portal: "email", status: "ready_to_apply", submitConfirmation: "UNCONFIRMED", startedAt: now } });
    const deniedAttempt = await delivery.createApplicationEmailAttempt({ applicationId: deniedApp.id, attemptKey: `application-${deniedApp.id}-${now.getTime()}`, recipient: submission.recipient });
    await delivery.recordApplicationEmailUncertain(deniedAttempt.id, true);
    await executeFailure.runInNewContext({ prisma: db, applicationId: deniedApp.id, workToken: now, delivered: { kind: "not_sent", reason: "current_gate_blocked" }, NOT_SUBMITTED: "NOT_SUBMITTED", Date });
    assert.equal((await db.application.findUniqueOrThrow({ where: { id: deniedApp.id } })).submitConfirmation, "NOT_SUBMITTED", "Proven denied email send can release its own held fence");
    await executeFailure.runInNewContext({ prisma: db, applicationId: raceApp.id, workToken: now, delivered: { kind: "not_sent", reason: "current_gate_blocked" }, NOT_SUBMITTED: "NOT_SUBMITTED", Date });
    assert.equal((await db.application.findUniqueOrThrow({ where: { id: raceApp.id } })).status, "success", "Known no-send cannot overwrite another accepted attempt");
    console.log("PASS PostgreSQL: final email gate denial remains proven NOT_SUBMITTED without erasing accepted or uncertain outcomes.");


    console.log("ALL SEND/RECEIVE POSTGRES CHECKS PASSED. Local synthetic database/provider only; zero external application or email transmission.");
  } finally {
    globalThis.fetch = originalFetch;
    if (db) await db.$disconnect();
    if (pg) await pg.stop();
    await rm(dir, { recursive: true, force: true });
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
