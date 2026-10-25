import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { applicationsPaused } from "../src/lib/application-pause";
import { applicationDeliveryView } from "../src/lib/application-delivery-view";
import { deriveApplicationLifecycle } from "../src/lib/application-lifecycle";
import { deliveryEvidence } from "../src/lib/application-evidence";
import {
  EMAIL_TEST,
  LEGACY_CANARY_ATTEMPT_KEY,
  adminEmailTestAuthorized,
  authorizeEmailTestRequest,
  emailTestAttemptKey,
  emailTestDeliveryFromRecords,
  emailTestPayload,
  emailTestProvenance,
  emailTestSubject,
  emailTestUserId,
  extractEmailTestToken,
  inboundReceiptFromProviderResult,
  inboundTargetsEmailTestDestination,
  mergeEmailTestResultJson,
  parseEmailTestDestination,
  parseEmailTestRunKey,
  recordEmailTestInboundReceipt,
  recordEmailTestProviderResult,
  tryRecordEmailTestInbound,
} from "../src/lib/email-test-capability";
import { RELEASE_CANARY } from "../src/lib/release-email-canary";

function load(path: string, mocks: Record<string, unknown> = {}): any {
  const exports = {};
  const source = ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  new Function("require", "exports", source)((name: string) => mocks[name] ?? {}, exports);
  return exports;
}

function memoryDb() {
  const users = new Map<string, { id: string; email: string }>();
  const jobs = new Map<string, { id: string; source: string; [k: string]: unknown }>();
  const apps = new Map<string, any>();
  const grants = new Map<string, { id: string; runKey: string; destination: string; attemptKey: string; applicationId: string; providerResult: string | null; createdAt: Date }>();
  const attempts = new Map<string, { status: string; providerEmailId: string | null; acceptedAt: Date | null; lastEventType: string | null }>();
  const inbound: Array<{ id: string; applicationId: string; toAddress: string; receivedAt: Date }> = [];
  const db = {
    user: {
      findUnique: async ({ where }: { where: { id: string } }) => users.get(where.id) ?? null,
    },
    job: {
      findUnique: async ({ where }: { where: { id: string } }) => jobs.get(where.id) ?? null,
      create: async ({ data }: { data: any }) => { jobs.set(data.id, data); return data; },
    },
    application: {
      findUnique: async ({ where }: { where: { id: string } }) => apps.get(where.id) ?? null,
      create: async ({ data }: { data: any }) => {
        const row = {
          ...data, sessionId: null, cvDocxPath: null, cvPdfPath: null, coverLetterPath: null,
          coverLetterText: null, consentGrantedAt: null, startedAt: null, submittedAt: null, submittedVia: null,
          user: { id: data.userId },
          job: jobs.get(data.jobId) ?? { id: data.jobId, source: "email_test", closedAt: new Date() },
        };
        apps.set(data.id, row);
        return row;
      },
    },
    emailTestAttempt: {
      findUnique: async ({ where }: { where: any }) => {
        if (where.id) return [...grants.values()].find((g) => g.id === where.id) ?? null;
        if (where.attemptKey) return [...grants.values()].find((g) => g.attemptKey === where.attemptKey) ?? null;
        const key = `${where.runKey_destination.runKey}\0${where.runKey_destination.destination}`;
        return grants.get(key) ?? null;
      },
      create: async ({ data }: { data: any }) => {
        const key = `${data.runKey}\0${data.destination}`;
        if (grants.has(key) || [...grants.values()].some((g) => g.attemptKey === data.attemptKey)) {
          const err = new Error("unique"); (err as any).code = "P2002"; throw err;
        }
        if (data.attemptKey === LEGACY_CANARY_ATTEMPT_KEY) {
          const err = new Error("legacy key"); (err as any).code = "P2002"; throw err;
        }
        const row = { id: `grant-${grants.size + 1}`, createdAt: new Date(), providerResult: data.providerResult ?? null, ...data };
        grants.set(key, row);
        return row;
      },
      update: async ({ where, data }: { where: any; data: any }) => {
        const row = [...grants.values()].find((g) => g.id === where.id);
        if (!row) throw new Error("missing");
        Object.assign(row, data);
        return row;
      },
      updateMany: async ({ where, data }: { where: any; data: any }) => {
        let count = 0;
        for (const row of grants.values()) {
          if (where.attemptKey && row.attemptKey === where.attemptKey) {
            Object.assign(row, data);
            count++;
          }
        }
        return { count };
      },
    },
    applicationEmailAttempt: {
      findUnique: async ({ where }: { where: { attemptKey: string } }) => attempts.get(where.attemptKey) ?? null,
    },
    inboundEmail: {
      findFirst: async ({ where }: { where: { applicationId: string; toAddress: string } }) =>
        inbound.filter((row) => row.applicationId === where.applicationId && row.toAddress === where.toAddress)
          .sort((a, b) => b.receivedAt.getTime() - a.receivedAt.getTime())[0] ?? null,
    },
    $executeRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const sql = strings.join("?");
      if (!sql.includes('"EmailTestAttempt"') || !sql.includes('"providerResult"')) {
        throw new Error(`unexpected email-test merge sql: ${sql}`);
      }
      const patchJson = values[0];
      const key = values[1];
      if (typeof patchJson !== "string" || typeof key !== "string") throw new Error("merge params");
      const patch = JSON.parse(patchJson) as Record<string, unknown>;
      const byId = /WHERE\s+"id"\s*=/.test(sql);
      const preserveInbound = sql.includes("? 'inboundReceivedAt'");
      const row = [...grants.values()].find((g) => (byId ? g.id === key : g.attemptKey === key));
      if (!row) return 0;
      row.providerResult = mergeEmailTestResultJson(row.providerResult, patch, {
        preserveInboundReceipt: preserveInbound,
      });
      return 1;
    },
    $transaction: async <T,>(fn: (tx: typeof db) => Promise<T>) => fn(db),
  };
  return { db, users, jobs, apps, grants, attempts, inbound };
}

async function main() {
  assert.notEqual(EMAIL_TEST.applicationId, RELEASE_CANARY.applicationId);
  assert.notEqual(EMAIL_TEST.jobId, RELEASE_CANARY.jobId);
  assert.notEqual(emailTestAttemptKey("run-a", "delivered@resend.dev"), LEGACY_CANARY_ATTEMPT_KEY);
  assert.equal(LEGACY_CANARY_ATTEMPT_KEY, "release-canary-email-20261013-owner-v1");
  assert.match(readFileSync("prisma/migrations/20261025140000_email_test_attempt/migration.sql", "utf8"), /release-canary-email-20261013-owner-v1/);
  assert.match(readFileSync("prisma/migrations/20261025140000_email_test_attempt/migration.sql", "utf8"), /Not applied by this change/);
  assert.doesNotMatch(readFileSync("src/lib/email-test-capability.ts", "utf8"), /application-recovery-release|ApplicationReleaseBatch|ApplicationReleaseGrant/);
  const schemaDoc = readFileSync("docs/ops/new-schema-migrations.md", "utf8");
  assert.match(schemaDoc, /20261025140000_email_test_attempt/);
  assert.match(schemaDoc, /\(A\) is not required/);
  assert.match(schemaDoc, /20261025020000_application_release_budget/);
  assert.match(schemaDoc, /not a prerequisite of the email test/);

  const dests = [
    "delivered@resend.dev",
    "bounced@resend.dev",
    "complained@resend.dev",
    RELEASE_CANARY.replyTo,
  ];
  for (const dest of dests) assert.equal(parseEmailTestDestination(dest), dest.toLowerCase());
  assert.equal(parseEmailTestDestination("hiring@acme.com"), null);
  assert.equal(parseEmailTestDestination("mario.rossi@inbound.lavorai.it"), null);
  assert.equal(parseEmailTestDestination("reply+customer-app-xyz@inbound.lavorai.it"), null);
  assert.equal(parseEmailTestDestination("owner@resend.dev"), null);
  assert.equal(parseEmailTestRunKey("20261025-preview-1"), "20261025-preview-1");
  assert.equal(parseEmailTestRunKey("bad key"), null);
  assert.equal(parseEmailTestRunKey(""), null);

  process.env.EMAIL_TEST_USER_ID = "email-test-user";
  assert.equal(emailTestUserId(), "email-test-user");
  delete process.env.EMAIL_TEST_USER_ID;
  process.env.ATS_TEST_USER_ID = "ats-test-user";
  assert.equal(emailTestUserId(), "ats-test-user");
  process.env.EMAIL_TEST_USER_ID = "email-test-user";

  assert.equal(adminEmailTestAuthorized({ headerKey: "k" }, { ADMIN_SYNC_KEY: "k" }), true);
  assert.equal(adminEmailTestAuthorized({ headerKey: "wrong" }, { ADMIN_SYNC_KEY: "k" }), false);
  assert.equal(adminEmailTestAuthorized({ headerKey: "" }, { ADMIN_SYNC_KEY: "" }), false);
  assert.equal(adminEmailTestAuthorized({ headerKey: null }, { ADMIN_SYNC_KEY: "k" }), false);
  assert.equal(adminEmailTestAuthorized({ headerKey: "k" }, { ADMIN_SYNC_KEY: "" }), false, "empty admin key never authorizes");
  assert.deepEqual(authorizeEmailTestRequest({
    headerKey: "k", userId: null, isAdminUser: false, originOk: false, mutating: true,
  }, { ADMIN_SYNC_KEY: "k" }), { ok: true, method: "admin_key" });
  assert.deepEqual(authorizeEmailTestRequest({
    headerKey: null, userId: null, isAdminUser: false, originOk: false, mutating: true,
  }, { ADMIN_SYNC_KEY: "k" }), { ok: false, status: 401, error: "unauthorized" });
  assert.deepEqual(authorizeEmailTestRequest({
    headerKey: null, userId: "u-user", isAdminUser: false, originOk: true, mutating: true,
  }, { ADMIN_SYNC_KEY: "k" }), { ok: false, status: 403, error: "forbidden" });
  assert.deepEqual(authorizeEmailTestRequest({
    headerKey: null, userId: "u-admin", isAdminUser: true, originOk: false, mutating: true,
  }, { ADMIN_SYNC_KEY: "k" }), { ok: false, status: 403, error: "forbidden" });
  assert.deepEqual(authorizeEmailTestRequest({
    headerKey: null, userId: "u-admin", isAdminUser: true, originOk: true, mutating: true,
  }, { ADMIN_SYNC_KEY: "k" }), { ok: true, method: "session", userId: "u-admin" });
  assert.deepEqual(authorizeEmailTestRequest({
    headerKey: null, userId: "u-admin", isAdminUser: true, originOk: false, mutating: false,
  }, { ADMIN_SYNC_KEY: "k" }), { ok: true, method: "session", userId: "u-admin" });

  const { prepareAndRunEmailTest, authorizeEmailTest, readEmailTestDelivery } = await import("../src/lib/email-test-capability");
  const { db, users, apps, grants, attempts, inbound } = memoryDb();
  users.set("email-test-user", { id: "email-test-user", email: "test@example.invalid" });

  let sent = 0;
  const send = async (input: any) => {
    sent++;
    assert.notEqual(input.attemptKey, LEGACY_CANARY_ATTEMPT_KEY);
    assert.equal(input.emailTest, true);
    const token = extractEmailTestToken({ headers: input.payload.headers, subject: input.payload.subject });
    assert.ok(token, "outgoing test email must carry a correlation token");
    assert.equal(input.payload.headers[EMAIL_TEST.header], token);
    assert.equal(input.payload.subject, emailTestSubject(input.runKey, token));
    assert.match(input.payload.subject, /· run /);
    attempts.set(input.attemptKey, {
      status: "accepted", providerEmailId: "re_test_1", acceptedAt: new Date(), lastEventType: "email.sent",
    });
    return {
      kind: "accepted",
      attemptId: "att-1",
      providerEmailId: "re_test_1",
      provider: { accepted: true, emailId: "re_test_1" },
    };
  };

  process.env.APPLICATIONS_PAUSED = "true";
  delete process.env.LAVORAI_RELEASE_CANARY;
  delete process.env.APPLICATION_RECOVERY_RELEASE;
  assert.equal(applicationsPaused(), true);

  const refusedDest = await prepareAndRunEmailTest(
    { destination: "hiring@acme.com", runKey: "20261025-preview-1" },
    { prisma: db as any, send, env: process.env },
  );
  assert.equal(refusedDest.ok, false);
  if (!refusedDest.ok) assert.equal(refusedDest.reason, "email_test_destination_refused");
  assert.equal(sent, 0);

  const inboundAlias = await prepareAndRunEmailTest(
    { destination: "mario.rossi@inbound.lavorai.it", runKey: "20261025-preview-1" },
    { prisma: db as any, send, env: process.env },
  );
  assert.equal(inboundAlias.ok, false);
  if (!inboundAlias.ok) assert.equal(inboundAlias.reason, "email_test_destination_refused");
  assert.equal(sent, 0);

  apps.set("ordinary-customer-app", {
    id: "ordinary-customer-app", userId: "email-test-user", jobId: "real-job",
    portal: "email", status: "queued", submitConfirmation: null, sessionId: null,
    cvDocxPath: null, cvPdfPath: null, coverLetterPath: null, coverLetterText: null,
    consentGrantedAt: null, startedAt: null, submittedAt: null, submittedVia: null,
    user: { id: "email-test-user" },
    job: { id: "real-job", source: "verified_employer", closedAt: null },
  });
  const ordinary = await prepareAndRunEmailTest(
    { destination: "delivered@resend.dev", runKey: "20261025-preview-1", applicationId: "ordinary-customer-app" },
    { prisma: db as any, send, env: process.env },
  );
  assert.equal(ordinary.ok, false);
  if (!ordinary.ok) assert.equal(ordinary.reason, "email_test_ordinary_application");
  assert.equal(sent, 0);

  const legacyApp = await prepareAndRunEmailTest(
    { destination: "delivered@resend.dev", runKey: "20261025-preview-1", applicationId: RELEASE_CANARY.applicationId },
    { prisma: db as any, send, env: process.env },
  );
  assert.equal(legacyApp.ok, false);
  if (!legacyApp.ok) assert.equal(legacyApp.reason, "email_test_legacy_fixture_forbidden");
  assert.equal(sent, 0);

  const ok = await prepareAndRunEmailTest(
    { destination: "delivered@resend.dev", runKey: "20261025-preview-1" },
    { prisma: db as any, send, env: process.env },
  );
  assert.equal(ok.ok, true);
  if (ok.ok) {
    assert.equal(ok.applicationId, EMAIL_TEST.applicationId);
    assert.equal(ok.destination, "delivered@resend.dev");
    assert.equal(ok.attemptKey, emailTestAttemptKey("20261025-preview-1", "delivered@resend.dev"));
    assert.notEqual(ok.attemptKey, LEGACY_CANARY_ATTEMPT_KEY);
    assert.equal(ok.result.kind, "accepted");
    assert.equal(ok.delivery.evidenceLevel, "provider_accepted");
    assert.equal(ok.delivery.label, "Email accettata");
    assert.equal(ok.delivery.employerConfirmed, false);
    assert.equal(ok.delivery.providerEmailId, "re_test_1");
    assert.deepEqual(ok.provider, { accepted: true, emailId: "re_test_1" });
    assert.deepEqual(ok.delivery.provider, { accepted: true, emailId: "re_test_1" });
  }
  assert.equal(sent, 1);
  assert.equal(grants.size, 1);
  const stored = [...grants.values()][0];
  assert.match(stored.providerResult ?? "", /re_test_1/);

  const dup = await prepareAndRunEmailTest(
    { destination: "delivered@resend.dev", runKey: "20261025-preview-1" },
    { prisma: db as any, send, env: process.env },
  );
  assert.equal(dup.ok, false);
  if (!dup.ok) assert.equal(dup.reason, "email_test_duplicate_key");
  assert.equal(sent, 1, "duplicate key must not send again");

  const secondDest = await prepareAndRunEmailTest(
    { destination: "bounced@resend.dev", runKey: "20261025-preview-1" },
    { prisma: db as any, send, env: process.env },
  );
  assert.equal(secondDest.ok, true);
  assert.equal(sent, 2);

  const otherUserEnv = { ...process.env, EMAIL_TEST_USER_ID: "someone-else" };
  const mismatch = await authorizeEmailTest({
    applicationId: EMAIL_TEST.applicationId,
    attemptKey: emailTestAttemptKey("20261025-preview-1", "delivered@resend.dev"),
    runKey: "20261025-preview-1",
    recipient: "delivered@resend.dev",
    recipientProvenanceJson: emailTestProvenance(EMAIL_TEST.applicationId, "20261025-preview-1", "delivered@resend.dev"),
    payload: emailTestPayload("delivered@resend.dev", { runKey: "20261025-preview-1", token: stored.id }),
  }, db as any, otherUserEnv);
  assert.equal(mismatch, false);

  attempts.set(emailTestAttemptKey("20261025-preview-1", "delivered@resend.dev"), {
    status: "delivered", providerEmailId: "re_test_1", acceptedAt: new Date(), lastEventType: "email.delivered",
  });
  inbound.push({
    id: "inb-stale", applicationId: EMAIL_TEST.applicationId, toAddress: "delivered@resend.dev", receivedAt: new Date(),
  });
  const polled = await readEmailTestDelivery(
    { runKey: "20261025-preview-1", destination: "delivered@resend.dev" },
    db as any,
  );
  assert.equal(polled.ok, true);
  if (polled.ok) {
    assert.equal(polled.delivery.evidenceLevel, "provider_delivered");
    assert.equal(polled.delivery.label, "Email consegnata");
    assert.equal(polled.delivery.employerConfirmed, false);
    assert.equal(polled.delivery.lastEventType, "email.delivered");
  }

  const inboundStatus = emailTestDeliveryFromRecords({
    attempt: { status: "accepted", providerEmailId: "re_in", acceptedAt: new Date(), lastEventType: "email.sent" },
    inbound: { id: "inb-1" },
  });
  assert.equal(inboundStatus.evidenceLevel, "inbound_received");
  assert.equal(inboundStatus.employerConfirmed, false);

  const diagnosticAccepted = {
    status: "diagnostic", submittedVia: null, submitConfirmation: EMAIL_TEST.submitConfirmation,
    emailAttempts: [{ status: "accepted", providerEmailId: "re_test_1" }],
  };
  const diagnosticDelivered = {
    status: "diagnostic", submittedVia: null, submitConfirmation: EMAIL_TEST.submitConfirmation,
    emailAttempts: [{ status: "delivered", providerEmailId: "re_test_1" }],
  };
  assert.equal(applicationDeliveryView(diagnosticAccepted).label, "Email accettata");
  assert.equal(applicationDeliveryView(diagnosticAccepted).phase, "accepted");
  assert.notEqual(applicationDeliveryView(diagnosticAccepted).phase, "confirmed");
  assert.equal(applicationDeliveryView(diagnosticDelivered).label, "Email consegnata");
  assert.notEqual(applicationDeliveryView(diagnosticDelivered).phase, "confirmed");
  assert.match(applicationDeliveryView(diagnosticDelivered).detail, /non è una conferma del datore/i);
  assert.equal(deliveryEvidence(diagnosticDelivered), "excluded");
  assert.equal(deriveApplicationLifecycle(diagnosticDelivered).excludedFromMetrics, true);
  assert.equal(deriveApplicationLifecycle(diagnosticDelivered).status, "draft");
  assert.match(deriveApplicationLifecycle(diagnosticDelivered).message.it, /consegnata/i);
  assert.match(deriveApplicationLifecycle(diagnosticDelivered).message.it, /non è una conferma del datore/i);
  assert.notEqual(deriveApplicationLifecycle(diagnosticDelivered).status, "confirmed_submitted");

  const applySource = readFileSync("src/lib/application-delivery.ts", "utf8");
  assert.match(applySource, /status: \{ not: "diagnostic" \}/);

  const sender = load("src/lib/recruiter-delivery.ts", {
    "@/lib/application-pause": { applicationsPaused },
    "@/lib/release-email-canary": await import("../src/lib/release-email-canary"),
    "@/lib/email-test-capability": {
      LEGACY_CANARY_ATTEMPT_KEY,
      authorizeEmailTest: async (input: { applicationId: string; recipient: string }) =>
        input.applicationId === EMAIL_TEST.applicationId && input.recipient === "delivered@resend.dev",
      recordEmailTestProviderResult: async () => {},
    },
    "@/lib/recruiter-email-fallback": { recruiterEmailFallbackEnabled: () => false },
    "@/lib/email-quota": { sendWithinQuota: async (_k: string, _to: string, fn: () => Promise<void>) => { await fn(); return { sent: true, reason: null }; } },
    "@/lib/application-delivery": {
      createApplicationEmailAttempt: async () => ({ id: "att" }),
      recordApplicationEmailAccepted: async () => {},
      recordApplicationEmailUncertain: async () => {},
    },
    "@/lib/recipient-domain-quota": { canSendToRecipientDomain: async () => { throw new Error("email test must skip employer domain quota"); } },
    "@/lib/recruiter-email-send": { isActiveRecruiterEmailStatus: () => false },
    "@/lib/db": { prisma: { applicationEmailAttempt: { findUnique: async () => null }, application: { findUnique: async ({ where }: any) => apps.get(where.id) ?? null } } },
  }).sendRecruiterEmailOnce;

  const testInput = {
    applicationId: EMAIL_TEST.applicationId,
    attemptKey: emailTestAttemptKey("send-path", "delivered@resend.dev"),
    runKey: "send-path",
    recipient: "delivered@resend.dev",
    recipientProvenanceJson: emailTestProvenance(EMAIL_TEST.applicationId, "send-path", "delivered@resend.dev"),
    payload: emailTestPayload("delivered@resend.dev", { runKey: "send-path", token: "tok-send-path" }),
    emailTest: true as const,
  };
  let posts = 0;
  const sendDeps = {
    withinQuota: async (kind: string, to: string, fn: () => Promise<void>) => {
      assert.equal(kind, "email_test");
      assert.equal(to, "delivered@resend.dev");
      await fn();
      return { sent: true, reason: null };
    },
    recipientDomainAllowed: async () => { throw new Error("must skip"); },
    findAttempt: async () => null,
    createAttempt: async () => ({ id: "att-send" }),
    send: async () => { posts++; return { data: { id: "re_send" }, error: null }; },
    accepted: async () => {},
    uncertain: async () => {},
  };
  assert.deepEqual(await sender({ ...testInput, recipient: "hiring@acme.com" }, sendDeps), { kind: "not_sent", reason: "email_test_destination_refused" });
  assert.equal(posts, 0);
  assert.deepEqual(await sender({ ...testInput, applicationId: "ordinary-customer-app", emailTest: true }, sendDeps), { kind: "not_sent", reason: "email_test_refused" });
  assert.equal(posts, 0);
  assert.deepEqual(await sender({ ...testInput, attemptKey: LEGACY_CANARY_ATTEMPT_KEY }, sendDeps), { kind: "not_sent", reason: "email_test_legacy_key_forbidden" });
  assert.equal(posts, 0);
  assert.equal((await sender(testInput, sendDeps)).kind, "accepted");
  assert.equal(posts, 1);
  const failInput = {
    ...testInput,
    attemptKey: emailTestAttemptKey("send-fail", "delivered@resend.dev"),
    runKey: "send-fail",
    recipientProvenanceJson: emailTestProvenance(EMAIL_TEST.applicationId, "send-fail", "delivered@resend.dev"),
  };
  const failed = await sender(failInput, {
    ...sendDeps,
    send: async () => ({
      data: null,
      error: { name: "validation_error", statusCode: 401, message: "Bearer re_secret123 denied" },
    }),
  });
  assert.equal(failed.kind, "not_sent");
  assert.equal(failed.reason, "provider_rejected");
  assert.equal(failed.provider?.errorName, "validation_error");
  assert.equal(failed.provider?.statusCode, 401);
  assert.equal(failed.provider?.accepted, false);
  assert.match(failed.provider?.message ?? "", /denied/);
  assert.doesNotMatch(JSON.stringify(failed.provider), /re_secret123/);
  assert.equal(posts, 1);

  process.env.ADMIN_SYNC_KEY = "email-test-admin-key";
  const { isAdmin } = await import("../src/lib/admin");
  const { checkOrigin } = await import("../src/lib/csrf");
  let currentUser: { id: string; email: string } | null = null;
  const route = load("src/app/api/admin/email-test-send/route.ts", {
    "next/server": {
      NextResponse: { json: (body: unknown, options: any) => ({ body, status: options?.status ?? 200 }) },
    },
    "@/lib/session": { getCurrentUser: async () => currentUser },
    "@/lib/admin": { isAdmin },
    "@/lib/csrf": { checkOrigin },
    "@/lib/db": { prisma: db },
    "@/lib/recruiter-delivery": { sendRecruiterEmailOnce: send },
    "@/lib/email-test-capability": await import("../src/lib/email-test-capability"),
  });
  const ownedDest = RELEASE_CANARY.replyTo;
  const postBody = (runKey: string, destination = ownedDest) => ({
    headers: new Headers({ "content-type": "application/json" }),
    json: async () => ({ destination, runKey }),
  });
  const sessionHeaders = (extra: Record<string, string> = {}) => new Headers({
    "content-type": "application/json",
    host: "localhost:3000",
    origin: "http://localhost:3000",
    ...extra,
  });

  const sentBeforeAuth = sent;
  currentUser = { id: "u-user", email: "not-an-admin@example.invalid" };
  const nonAdmin = await route.POST(postBody("session-nonadmin"));
  assert.ok(nonAdmin.status === 401 || nonAdmin.status === 403, "non-admin session is refused");
  assert.equal(sent, sentBeforeAuth);

  currentUser = null;
  const noSession = await route.POST(postBody("session-none"));
  assert.equal(noSession.status, 401);
  assert.equal(noSession.body.error, "unauthorized");
  assert.equal(sent, sentBeforeAuth);

  currentUser = { id: "u-admin", email: "umbertogeraci0@gmail.com" };
  const badOrigin = await route.POST({
    headers: sessionHeaders({ origin: "https://evil.example" }),
    json: async () => ({ destination: ownedDest, runKey: "session-badorigin" }),
  });
  assert.equal(badOrigin.status, 403);
  assert.equal(badOrigin.body.error, "forbidden");
  assert.equal(sent, sentBeforeAuth);

  const before = sent;
  const sessionOk = await route.POST({
    headers: sessionHeaders(),
    json: async () => ({ destination: ownedDest, runKey: "session-ok" }),
  });
  assert.equal(sessionOk.status, 200);
  assert.equal(sessionOk.body.ok, true);
  assert.equal(sessionOk.body.employerConfirmed, false);
  assert.equal(sent, before + 1);

  const sessionGet = await route.GET({
    url: `http://localhost:3000/api/admin/email-test-send?runKey=session-ok&destination=${encodeURIComponent(ownedDest)}`,
    headers: sessionHeaders(),
  });
  assert.equal(sessionGet.status, 200);
  assert.equal(sessionGet.body.ok, true);
  assert.ok(sessionGet.body.delivery?.evidenceLevel);

  currentUser = null;
  const adminOk = await route.POST({
    headers: new Headers({ "x-admin-key": "email-test-admin-key", "content-type": "application/json" }),
    json: async () => ({ destination: "complained@resend.dev", runKey: "route-1" }),
  });
  assert.equal(adminOk.status, 200);
  assert.equal(adminOk.body.ok, true);
  assert.equal(adminOk.body.employerConfirmed, false);
  assert.equal(sent, before + 2);

  const adminDup = await route.POST({
    headers: new Headers({ "x-admin-key": "email-test-admin-key", "content-type": "application/json" }),
    json: async () => ({ destination: "complained@resend.dev", runKey: "route-1" }),
  });
  assert.equal(adminDup.status, 409);
  assert.equal(adminDup.body.error, "email_test_duplicate_key");
  assert.equal(sent, before + 2);

  currentUser = { id: "u-admin", email: "umbertogeraci0@gmail.com" };
  const sessionDup = await route.POST({
    headers: sessionHeaders(),
    json: async () => ({ destination: ownedDest, runKey: "session-ok" }),
  });
  assert.equal(sessionDup.status, 409);
  assert.equal(sessionDup.body.error, "email_test_duplicate_key");
  assert.equal(sent, before + 2);

  const routeSource = readFileSync("src/app/api/admin/email-test-send/route.ts", "utf8");
  assert.doesNotMatch(routeSource, /applicationsPaused\(\)/);
  assert.doesNotMatch(routeSource, /process\.env\.(APPLICATION_RECOVERY_RELEASE|LAVORAI_RELEASE_CANARY)/);
  assert.match(routeSource, /isAdmin\(/);
  assert.match(routeSource, /checkOrigin\(/);
  assert.match(routeSource, /\[email-test\] authorized/);
  assert.match(routeSource, /method: "admin_key"/);
  assert.doesNotMatch(routeSource, /console\.info\([^;]*ADMIN_SYNC_KEY|console\.info\([^;]*x-admin-key/);
  assert.match(readFileSync("src/lib/recruiter-delivery.ts", "utf8"), /emailTest \? "email_test"/);
  assert.match(readFileSync("src/lib/admin.ts", "utf8").split("\n")[37] ?? "", /export function isAdmin/);
  const pageSrc = readFileSync("src/app/(app)/admin/email-test/page.tsx", "utf8");
  const panelSrc = readFileSync("src/app/(app)/admin/email-test/_panel.tsx", "utf8");
  assert.match(pageSrc, /20261025-owned-inbound-1/);
  assert.match(pageSrc, /RELEASE_CANARY\.replyTo/);
  assert.match(panelSrc, /window\.confirm/);
  assert.match(panelSrc, /Send one test email/);
  assert.match(panelSrc, /Check status/);
  assert.match(panelSrc, /method: "GET"/);
  assert.match(panelSrc, /setSendLocked\(true\)/);
  assert.doesNotMatch(panelSrc, /setInterval|setTimeout\(|X-Admin-Key|ADMIN_SYNC_KEY/);
  assert.match(readFileSync("src/app/(app)/admin/layout.tsx", "utf8"), /if \(!isAdmin\(user\?\.email\)\) notFound\(\)/);

  const capabilitySrc = readFileSync("src/lib/email-test-capability.ts", "utf8");
  assert.doesNotMatch(capabilitySrc, /inboundEmail\.findFirst/);
  assert.match(capabilitySrc, /inboundReceivedAt/);
  assert.match(capabilitySrc, /\$executeRaw/);
  assert.doesNotMatch(capabilitySrc, /providerResult:\s*JSON\.stringify\(provider\)/);
  assert.doesNotMatch(capabilitySrc, /data:\s*\{\s*providerResult:\s*JSON\.stringify\(merged\)/);
  assert.match(readFileSync("src/lib/application-reply-processing.ts", "utf8"), /tryRecordEmailTestInbound/);
  const deliverySrc = readFileSync("src/lib/recruiter-delivery.ts", "utf8");
  assert.match(deliverySrc, /recordEmailTestProviderResult/);
  assert.doesNotMatch(deliverySrc, /providerResult:\s*JSON\.stringify\(provider\)/);

  const alias = RELEASE_CANARY.replyTo;
  assert.equal(inboundTargetsEmailTestDestination(alias), true);
  assert.equal(inboundTargetsEmailTestDestination(`Name <${alias}>`), true);
  assert.equal(inboundTargetsEmailTestDestination("delivered@resend.dev"), false);
  const sampleToken = "cmtesttoken0000000000001";
  assert.equal(extractEmailTestToken({
    headers: { "x-lavorai-email-test": sampleToken },
    subject: emailTestSubject("20261025-owned-inbound-1", sampleToken),
  }), sampleToken);
  assert.equal(extractEmailTestToken({
    subject: `Re: ${emailTestSubject("20261025-owned-inbound-1", sampleToken)}`,
  }), sampleToken);
  assert.equal(extractEmailTestToken({
    headers: { [EMAIL_TEST.header]: "aaa" },
    subject: emailTestSubject("20261025-owned-inbound-1", "bbb"),
  }), null);

  const createdAt = new Date("2026-10-25T14:00:00Z");
  const thisGrant = [...grants.values()].find((g) => g.runKey === "20261025-preview-1" && g.destination === alias)
    ?? (() => {
      const row = {
        id: "grant-inbound-this",
        runKey: "20261025-inbound-1",
        destination: alias,
        attemptKey: emailTestAttemptKey("20261025-inbound-1", alias),
        applicationId: EMAIL_TEST.applicationId,
        providerResult: JSON.stringify({ accepted: true, emailId: "re_in" }),
        createdAt,
      };
      grants.set(`${row.runKey}\0${row.destination}`, row);
      return row;
    })();
  const otherGrant = {
    id: "grant-inbound-other",
    runKey: "20261025-inbound-other",
    destination: alias,
    attemptKey: emailTestAttemptKey("20261025-inbound-other", alias),
    applicationId: EMAIL_TEST.applicationId,
    providerResult: JSON.stringify({ accepted: true, emailId: "re_other" }),
    createdAt,
  };
  grants.set(`${otherGrant.runKey}\0${otherGrant.destination}`, otherGrant);
  thisGrant.createdAt = createdAt;
  thisGrant.destination = alias;
  thisGrant.attemptKey = emailTestAttemptKey(thisGrant.runKey, alias);

  assert.equal(await tryRecordEmailTestInbound({
    to: alias,
    headers: { [EMAIL_TEST.header]: thisGrant.id },
    subject: emailTestSubject(thisGrant.runKey, thisGrant.id),
    receivedAt: new Date("2026-10-25T13:59:00Z"),
    providerMessageId: "mail-too-old",
  }, db as any), "unmatched_skip");
  assert.equal(inboundReceiptFromProviderResult(thisGrant.providerResult), null);

  assert.equal(await tryRecordEmailTestInbound({
    to: alias,
    headers: { [EMAIL_TEST.header]: "not-a-real-attempt" },
    subject: emailTestSubject(thisGrant.runKey, "not-a-real-attempt"),
    receivedAt: new Date("2026-10-25T14:05:00Z"),
    providerMessageId: "mail-mismatch",
  }, db as any), "unmatched_skip");
  assert.equal(inboundReceiptFromProviderResult(thisGrant.providerResult), null);

  assert.equal(await tryRecordEmailTestInbound({
    to: alias,
    subject: emailTestSubject(otherGrant.runKey, otherGrant.id),
    receivedAt: new Date("2026-10-25T14:05:00Z"),
    providerMessageId: "mail-other-run",
  }, db as any), "recorded");
  assert.equal(inboundReceiptFromProviderResult(thisGrant.providerResult), null);
  assert.equal(inboundReceiptFromProviderResult(otherGrant.providerResult)?.providerMessageId, "mail-other-run");

  const otherPolled = await readEmailTestDelivery(
    { runKey: thisGrant.runKey, destination: alias },
    db as any,
  );
  assert.equal(otherPolled.ok, true);
  if (otherPolled.ok) assert.notEqual(otherPolled.delivery.evidenceLevel, "inbound_received");

  let classifyCalls = 0;
  let forwardCalls = 0;
  let applyCalls = 0;
  const processing = load("src/lib/application-reply-processing.ts", {
    "@/lib/inbox-reply-policy": { replyMetadata: () => ({}) },
    "node:crypto": await import("node:crypto"),
    "@/lib/db": { prisma: db },
    "@/lib/email": { forwardReplyToUser: async () => { forwardCalls++; throw new Error("forward must not run"); } },
    "@/lib/reply-security-message": { isApplicationVerificationMessage: () => false },
    "@/lib/apply-reply-to-application": { applyReplyToApplication: async () => { applyCalls++; throw new Error("apply must not run"); } },
    "@/lib/application-delivery": { emailTransaction: async (fn: any) => fn(db) },
    "@/lib/inbound/service": { recordAtsConfirmation: async () => { throw new Error("confirmation must not run"); } },
    "@/lib/application-mailbox": {
      classifyMailbox: async () => { classifyCalls++; throw new Error("classify must not run"); },
      mailboxKindIsHuman: () => false,
      mailboxKindToReplyKind: () => "risposta",
      mailboxNotifyMode: () => "off",
      notifyDecision: () => "skipped",
    },
    "@/lib/email-test-capability": await import("../src/lib/email-test-capability"),
    "@/lib/resend-keys": await import("../src/lib/resend-keys"),
    "@/lib/user-notification-guard": await import("../src/lib/user-notification-guard"),
  });
  const receivedAt = new Date("2026-10-25T14:10:00Z");
  const inboundResult = await processing.processInboundReply({
    data: {
      email_id: "mail-this-attempt",
      to: alias,
      from: "inbound@resend.dev",
      subject: emailTestSubject(thisGrant.runKey, thisGrant.id),
      text: "LavorAI fictional test reply received.",
      headers: { [EMAIL_TEST.header]: thisGrant.id },
    },
    providerEventId: "evt-this-attempt",
    receivedAt,
  });
  assert.equal(inboundResult.matched, true);
  assert.equal(classifyCalls, 0);
  assert.equal(forwardCalls, 0);
  assert.equal(applyCalls, 0);
  assert.equal(inboundReceiptFromProviderResult(thisGrant.providerResult)?.providerMessageId, "mail-this-attempt");

  const receiptPolled = await readEmailTestDelivery(
    { runKey: thisGrant.runKey, destination: alias },
    db as any,
  );
  assert.equal(receiptPolled.ok, true);
  if (receiptPolled.ok) {
    assert.equal(receiptPolled.delivery.evidenceLevel, "inbound_received");
    assert.equal(receiptPolled.delivery.inboundId, "mail-this-attempt");
    assert.equal(receiptPolled.delivery.employerConfirmed, false);
  }

  const skipped = await processing.processInboundReply({
    data: {
      email_id: "mail-no-token",
      to: alias,
      from: "inbound@resend.dev",
      subject: "unrelated inbound to the canary alias",
      text: "please classify me",
    },
    providerEventId: "evt-no-token",
    receivedAt: new Date("2026-10-25T14:20:00Z"),
  });
  assert.equal(skipped.matched, true);
  assert.equal(classifyCalls, 0, "unmatched token on the test alias is fail-closed");
  assert.equal(forwardCalls, 0);
  assert.equal(applyCalls, 0);

  const firstInboundAt = new Date("2026-10-25T14:10:00.000Z");
  const laterInboundAt = new Date("2026-10-25T14:20:00.000Z");
  function seedGrant(id: string, runKey: string) {
    const row = {
      id,
      runKey,
      destination: alias,
      attemptKey: emailTestAttemptKey(runKey, alias),
      applicationId: EMAIL_TEST.applicationId,
      providerResult: null as string | null,
      createdAt,
    };
    grants.set(`${row.runKey}\0${row.destination}`, row);
    return row;
  }
  function parsed(row: { providerResult: string | null }) {
    return JSON.parse(row.providerResult ?? "{}");
  }

  const mergeBefore = seedGrant("merge-before", "merge-before");
  await recordEmailTestInboundReceipt(db as any, mergeBefore.id, { receivedAt: firstInboundAt, providerMessageId: "mail-before" });
  attempts.set(mergeBefore.attemptKey, {
    status: "accepted", providerEmailId: "re_before", acceptedAt: new Date(), lastEventType: "email.sent",
  });
  const beforeProviderMissing = await readEmailTestDelivery({ runKey: mergeBefore.runKey, destination: alias }, db as any);
  assert.equal(beforeProviderMissing.ok, true);
  if (beforeProviderMissing.ok) {
    assert.equal(beforeProviderMissing.delivery.evidenceLevel, "inbound_received");
    assert.equal(beforeProviderMissing.delivery.inboundId, "mail-before");
    assert.equal(beforeProviderMissing.delivery.provider?.accepted, true);
    assert.equal(beforeProviderMissing.delivery.provider?.emailId, "re_before");
  }
  await recordEmailTestProviderResult(db as any, mergeBefore.attemptKey, { accepted: true, emailId: "re_before" });
  assert.equal(parsed(mergeBefore).inboundProviderMessageId, "mail-before");
  assert.equal(parsed(mergeBefore).inboundReceivedAt, firstInboundAt.toISOString());
  assert.equal(parsed(mergeBefore).emailId, "re_before");
  assert.equal(parsed(mergeBefore).accepted, true);
  const beforeBoth = await readEmailTestDelivery({ runKey: mergeBefore.runKey, destination: alias }, db as any);
  assert.equal(beforeBoth.ok, true);
  if (beforeBoth.ok) {
    assert.equal(beforeBoth.delivery.evidenceLevel, "inbound_received");
    assert.equal(beforeBoth.delivery.inboundId, "mail-before");
    assert.equal(beforeBoth.delivery.provider?.emailId, "re_before");
    assert.equal(beforeBoth.delivery.provider?.accepted, true);
  }

  const after = seedGrant("merge-after", "merge-after");
  await recordEmailTestProviderResult(db as any, after.attemptKey, { accepted: true, emailId: "re_after" });
  await recordEmailTestInboundReceipt(db as any, after.id, { receivedAt: firstInboundAt, providerMessageId: "mail-after" });
  assert.equal(parsed(after).inboundProviderMessageId, "mail-after");
  assert.equal(parsed(after).emailId, "re_after");

  const interleaved = seedGrant("merge-stale", "merge-stale");
  const stale = interleaved.providerResult;
  await recordEmailTestInboundReceipt(db as any, interleaved.id, { receivedAt: firstInboundAt, providerMessageId: "mail-stale" });
  const naiveClobber = JSON.stringify({ ...JSON.parse(stale || "{}"), accepted: true, emailId: "re_stale" });
  assert.equal(JSON.parse(naiveClobber).inboundProviderMessageId, undefined, "stale whole-object write would drop inbound");
  await Promise.all([
    recordEmailTestProviderResult(db as any, interleaved.attemptKey, { accepted: true, emailId: "re_stale" }),
    recordEmailTestInboundReceipt(db as any, interleaved.id, { receivedAt: laterInboundAt, providerMessageId: "mail-stale-2" }),
  ]);
  assert.equal(parsed(interleaved).emailId, "re_stale");
  assert.equal(parsed(interleaved).inboundProviderMessageId, "mail-stale", "first inbound receipt is kept");
  assert.equal(parsed(interleaved).inboundReceivedAt, firstInboundAt.toISOString());

  const mergeDup = seedGrant("merge-dup", "merge-dup");
  await recordEmailTestInboundReceipt(db as any, mergeDup.id, { receivedAt: firstInboundAt, providerMessageId: "mail-first" });
  await recordEmailTestInboundReceipt(db as any, mergeDup.id, { receivedAt: laterInboundAt, providerMessageId: "mail-second" });
  assert.equal(parsed(mergeDup).inboundProviderMessageId, "mail-first");
  assert.equal(parsed(mergeDup).inboundReceivedAt, firstInboundAt.toISOString());

  console.log("PASS email test: fenced destinations, correlation token, inbound receipt without classify/forward/apply, atomic providerResult merge, pause/no-gate, honest labels.");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
