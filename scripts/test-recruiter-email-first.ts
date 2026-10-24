/**
 * Recruiter-email-first: fake mailer only. Never contacts Resend or DNS.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { recipientDomainDailyLimit, recipientDomainOf, canSendToRecipientDomain } from "../src/lib/recipient-domain-quota";
import {
  recruiterFromAddress,
  recruiterEmailAttemptKey,
  matchesApplicationEmailProofKey,
  recentRecruiterEmailDuplicate,
  DEFAULT_RECRUITER_EMAIL_FROM,
  RECRUITER_EMAIL_DEDUP_MS,
} from "../src/lib/recruiter-email-send";
import { extractPublishedRecruiterEmailFromText, employerDomainAllowsRecipient } from "../src/lib/recruiter-email";

function load(path: string, dependencies: Record<string, unknown>) {
  const output = ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} as Record<string, any> };
  vm.runInNewContext(output, {
    module, exports: module.exports,
    require: (id: string) => {
      assert.ok(id in dependencies, `Unexpected dependency ${id}`);
      return dependencies[id];
    },
    console: { log() {}, warn() {}, error() {} }, Buffer, Date, Map, Set, URL,
  }, { filename: path });
  return module.exports;
}

const deliveryDeps = {
  "@/lib/application-pause": { applicationsPaused: () => false },
  "@/lib/release-email-canary": { authorizeReleaseCanary: async () => false },
  resend: { Resend: class { emails = { send: async () => { throw new Error("real Resend must not run in tests"); } }; } },
  "@/lib/email-quota": { sendWithinQuota: async () => { throw new Error("default quota unused"); } },
  "@/lib/application-delivery": {
    createApplicationEmailAttempt: async () => ({ id: "attempt-1" }),
    recordApplicationEmailAccepted: async () => {},
    recordApplicationEmailUncertain: async () => {},
  },
  "@/lib/recipient-domain-quota": {
    canSendToRecipientDomain: async () => ({ allowed: true, reason: null, domain: "acme.test", used: 0, limit: 12 }),
  },
  "@/lib/recruiter-email-send": {
    isActiveRecruiterEmailStatus: (status: string) => ["sending", "accepted", "delivered", "delayed", "unknown"].includes(status),
  },
  "@/lib/db": { prisma: { applicationEmailAttempt: { findUnique: async () => null } } },
};

function testFromAndAttemptKey() {
  assert.equal(recruiterFromAddress("Mario Rossi"), `"Mario Rossi via LavorAI" <${DEFAULT_RECRUITER_EMAIL_FROM}>`);
  assert.equal(
    recruiterFromAddress("Anna Bianchi", { RECRUITER_EMAIL_FROM: "Candidature <jobs@lavorai.it>" }),
    `"Anna Bianchi via LavorAI" <jobs@lavorai.it>`,
  );
  assert.equal(recruiterFromAddress('Evil <script>\r\n"'), `"Evil script via LavorAI" <${DEFAULT_RECRUITER_EMAIL_FROM}>`);
  assert.equal(recruiterFromAddress("  "), `"Candidato via LavorAI" <${DEFAULT_RECRUITER_EMAIL_FROM}>`);
  const key = recruiterEmailAttemptKey("app1", "job9", "Careers@Acme.TEST");
  assert.equal(key, "recruiter-email:app1:job9:careers@acme.test");
  assert.equal(recruiterEmailAttemptKey("app1", "job9", "careers@acme.test"), key);
  assert.ok(!key.includes("T") && !/\d{13}/.test(key), "Send key must not include a run timestamp");
  const token = new Date("2026-10-24T12:00:00.000Z");
  assert.equal(matchesApplicationEmailProofKey(key, "app1", token), true);
  assert.equal(matchesApplicationEmailProofKey(`application-app1-${token.getTime()}`, "app1", token), true);
  assert.equal(matchesApplicationEmailProofKey("application-wrong-owner-1", "wrong-owner", token), false);
}

function testThirtyDayFence() {
  const now = new Date("2026-10-24T12:00:00.000Z");
  const row = (overrides: Record<string, unknown> = {}) => ({
    applicationId: "app-old",
    userId: "user1",
    jobId: "job1",
    recipient: "careers@acme.test",
    status: "accepted",
    createdAt: new Date(+now - 3 * 24 * 60 * 60 * 1000),
    acceptedAt: new Date(+now - 3 * 24 * 60 * 60 * 1000),
    providerEmailId: "re_1",
    ...overrides,
  });
  assert.ok(recentRecruiterEmailDuplicate([row()], { userId: "user1", jobId: "job1", recipient: "other@acme.test", now }));
  assert.ok(recentRecruiterEmailDuplicate([row({ jobId: "other-job" })], { userId: "user1", jobId: "job2", recipient: "careers@acme.test", now }));
  assert.equal(recentRecruiterEmailDuplicate([row({ userId: "other" })], { userId: "user1", jobId: "job1", recipient: "careers@acme.test", now }), null);
  assert.equal(recentRecruiterEmailDuplicate([row({
    createdAt: new Date(+now - RECRUITER_EMAIL_DEDUP_MS - 1000),
    acceptedAt: new Date(+now - RECRUITER_EMAIL_DEDUP_MS - 1000),
  })], { userId: "user1", jobId: "job1", recipient: "careers@acme.test", now }), null);
  assert.ok(recentRecruiterEmailDuplicate([row({ status: "sending", acceptedAt: null, providerEmailId: null })], {
    userId: "user1", jobId: "job1", recipient: "careers@acme.test", now,
  }));
  assert.equal(recentRecruiterEmailDuplicate([row({ status: "failed", acceptedAt: null, providerEmailId: null })], {
    userId: "user1", jobId: "job1", recipient: "careers@acme.test", now,
  }), null);
}

function testGenericInboxEmployerDomain() {
  const invite = (email: string) => `Inviare il CV a ${email} per questa posizione.`;
  assert.equal(
    extractPublishedRecruiterEmailFromText(invite("jobs@randstad.com"), "Acme", "https://www.adzuna.it/details/1"),
    null,
    "Generic staffing inbox on an aggregator is not the employer",
  );
  assert.equal(
    extractPublishedRecruiterEmailFromText(invite("cv@randstad.com"), "Acme", "https://it.indeed.com/viewjob?jk=1"),
    null,
  );
  assert.equal(
    extractPublishedRecruiterEmailFromText(invite("careers@acme.com"), "Acme", "https://www.adzuna.it/details/1")?.email,
    "careers@acme.com",
  );
  assert.equal(
    extractPublishedRecruiterEmailFromText(invite("hr@acme.com"), "Acme", "https://careers.acme.com/jobs/1")?.email,
    "hr@acme.com",
  );
  assert.equal(
    extractPublishedRecruiterEmailFromText("Send your CV to jobs@acme.com.", "Widget Labs", "https://boards.greenhouse.io/acme/jobs/123")?.email,
    "jobs@acme.com",
    "ATS tenant may authorize a generic inbox on the employer domain",
  );
  assert.equal(
    extractPublishedRecruiterEmailFromText("Send your CV to jobs@randstad.com.", "Acme", "https://boards.greenhouse.io/acme/jobs/123"),
    null,
    "ATS tenant does not authorize a staffing-agency inbox",
  );
  assert.equal(employerDomainAllowsRecipient("jobs@randstad.com", "Acme", "https://www.adzuna.it/details/1"), false);
  assert.equal(employerDomainAllowsRecipient("careers@acme.com", "Acme", "https://www.adzuna.it/details/1"), true);
  assert.equal(employerDomainAllowsRecipient("jobs@acme.com", "Widget Labs", "https://boards.greenhouse.io/acme/jobs/123"), true);
}

async function testFakeMailer() {
  let realSend = 0;
  const delivery = load("src/lib/recruiter-delivery.ts", {
    ...deliveryDeps,
    resend: { Resend: class { emails = { send: async () => { realSend++; throw new Error("real Resend must not run in tests"); } }; } },
  });
  let sends = 0;
  const from = recruiterFromAddress("Mario Rossi");
  const payload = {
    from,
    to: "ignored@example.test",
    replyTo: "reply+app1@inbound.lavorai.it",
    subject: "Product Designer – Candidatura Mario Rossi",
    text: "Lettera",
  };
  const attemptKey = recruiterEmailAttemptKey("app1", "job1", "careers@acme.test");
  let stored: { id: string; status: string; providerEmailId: string | null; acceptedAt: Date | null } | null = null;
  const sendOnce = () => delivery.sendRecruiterEmailOnce({
    applicationId: "app1",
    attemptKey,
    recipient: "careers@acme.test",
    recipientProvenanceJson: "{}",
    payload,
  }, {
    withinQuota: async (_k: string, _to: string, fn: () => Promise<void>) => { await fn(); return { sent: true, reason: null }; },
    createAttempt: async () => ({ id: "attempt-1" }),
    accepted: async (_id: string, providerId: string) => {
      assert.equal(providerId, "re_fake_1");
      stored = { id: "attempt-1", status: "accepted", providerEmailId: providerId, acceptedAt: new Date() };
    },
    uncertain: async () => { throw new Error("not expected"); },
    findAttempt: async () => stored,
    send: async (mail: { to: string; from: string; replyTo: string; subject: string }, key: string) => {
      sends++;
      assert.equal(mail.to, "careers@acme.test");
      assert.equal(mail.from, from);
      assert.match(mail.from, /via LavorAI/);
      assert.match(mail.from, /<candidature@lavorai\.it>/);
      assert.equal(mail.replyTo, payload.replyTo);
      assert.equal(mail.subject, payload.subject);
      assert.equal(key, attemptKey);
      return { data: { id: "re_fake_1" }, error: null };
    },
  });
  const accepted = await sendOnce();
  assert.equal(accepted.kind, "accepted");
  assert.equal(accepted.providerEmailId, "re_fake_1");
  assert.equal(sends, 1);
  const rerun = await sendOnce();
  assert.equal(rerun.kind, "accepted");
  assert.equal(rerun.providerEmailId, "re_fake_1");
  assert.equal(sends, 1, "A re-run of the same application/job/recipient must never email twice");
  assert.equal(realSend, 0, "Fake mailer must never call Resend");

  const blocked = await delivery.sendRecruiterEmailOnce({
    applicationId: "app1", attemptKey: "k2", recipient: "careers@acme.test",
    recipientProvenanceJson: "{}", payload,
  }, {
    recipientDomainAllowed: async () => ({ allowed: false, reason: "recipient_domain_daily_limit (12/12)", domain: "acme.test", used: 12, limit: 12 }),
    withinQuota: async () => { throw new Error("quota must not run when domain-capped"); },
    send: async () => { throw new Error("must not send"); },
    createAttempt: async () => { throw new Error("must not persist"); },
    accepted: async () => {},
    uncertain: async () => {},
    findAttempt: async () => null,
  });
  assert.equal(blocked.kind, "not_sent");
  assert.match(blocked.reason, /recipient_domain/);
}

async function testDomainQuotaHelper() {
  assert.equal(recipientDomainOf("Careers@Acme.COM"), "acme.com");
  assert.equal(recipientDomainOf("not-an-email"), null);
  assert.equal(recipientDomainDailyLimit({}), 12);
  assert.equal(recipientDomainDailyLimit({ RECIPIENT_DOMAIN_DAILY_LIMIT: "8" }), 8);
  const allowed = await canSendToRecipientDomain("jobs@acme.com", {
    countToday: async () => 3, limit: 12,
  });
  assert.equal(allowed.allowed, true);
  const denied = await canSendToRecipientDomain("jobs@acme.com", {
    countToday: async () => 12, limit: 12,
  });
  assert.equal(denied.allowed, false);
}

function testWorkerSource() {
  const worker = readFileSync("src/lib/application-worker.ts", "utf8");
  assert.match(worker, /recruiterFromAddress/);
  assert.match(worker, /recruiterEmailAttemptKey/);
  assert.match(worker, /findRecentRecruiterEmailDuplicate/);
  assert.doesNotMatch(worker, /ensureUserInbox/);
  assert.doesNotMatch(worker, /application-\$\{applicationId\}-\$\{workToken\.getTime\(\)\}/);
  assert.match(worker, /inboundReplyAddress/);
  assert.match(readFileSync(".env.example", "utf8"), /RECRUITER_EMAIL_FROM=candidature@lavorai\.it/);
}

async function main() {
  testFromAndAttemptKey();
  testThirtyDayFence();
  testGenericInboxEmployerDomain();
  testWorkerSource();
  await testFakeMailer();
  await testDomainQuotaHelper();
  console.log("PASS recruiter-email-first: From on lavorai.it, stable key, 30d fence, employer-domain generic inboxes, no Resend.");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
