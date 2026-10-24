/**
 * Recruiter-email-first: fake mailer only. Never contacts Resend or DNS.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { recipientDomainDailyLimit, recipientDomainOf, canSendToRecipientDomain } from "../src/lib/recipient-domain-quota";

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

async function testFakeMailer() {
  let realSend = 0;
  const delivery = load("src/lib/recruiter-delivery.ts", {
    "@/lib/application-pause": { applicationsPaused: () => false },
    "@/lib/release-email-canary": { authorizeReleaseCanary: async () => false },
    resend: { Resend: class { emails = { send: async () => { realSend++; throw new Error("real Resend must not run in tests"); } }; } },
    "@/lib/email-quota": { sendWithinQuota: async () => { throw new Error("default quota unused"); } },
    "@/lib/application-delivery": {
      createApplicationEmailAttempt: async () => ({ id: "attempt-1" }),
      recordApplicationEmailAccepted: async () => {},
      recordApplicationEmailUncertain: async () => {},
    },
    "@/lib/recipient-domain-quota": {
      canSendToRecipientDomain: async () => ({ allowed: true, reason: null, domain: "acme.test", used: 0, limit: 12 }),
    },
  });
  let sends = 0;
  const payload = {
    from: "Mario Rossi <mario.rossi.abc@apply.lavorai.it>",
    to: "ignored@example.test",
    replyTo: "reply+app1@inbound.lavorai.it",
    subject: "Product Designer – Candidatura Mario Rossi",
    text: "Lettera",
  };
  const accepted = await delivery.sendRecruiterEmailOnce({
    applicationId: "app1",
    attemptKey: "k1",
    recipient: "careers@acme.test",
    recipientProvenanceJson: "{}",
    payload,
  }, {
    withinQuota: async (_k: string, _to: string, fn: () => Promise<void>) => { await fn(); return { sent: true, reason: null }; },
    createAttempt: async () => ({ id: "attempt-1" }),
    accepted: async (_id: string, providerId: string) => { assert.equal(providerId, "re_fake_1"); },
    uncertain: async () => { throw new Error("not expected"); },
    send: async (mail: { to: string; from: string; replyTo: string; subject: string }, key: string) => {
      sends++;
      assert.equal(mail.to, "careers@acme.test");
      assert.equal(mail.from, payload.from);
      assert.equal(mail.replyTo, payload.replyTo);
      assert.equal(mail.subject, payload.subject);
      assert.equal(key, "k1");
      return { data: { id: "re_fake_1" }, error: null };
    },
  });
  assert.equal(accepted.kind, "accepted");
  assert.equal(accepted.providerEmailId, "re_fake_1");
  assert.equal(sends, 1);
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

async function main() {
  await testFakeMailer();
  await testDomainQuotaHelper();
  console.log("PASS recruiter-email-first: fake mailer only, domain cap, no Resend.");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
