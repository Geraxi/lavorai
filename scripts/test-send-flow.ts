import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { applicationDeliveryView } from "../src/lib/application-delivery-view";

async function main() {
  process.env.DATABASE_URL = "postgresql://synthetic:synthetic@127.0.0.1:59999/test_only";
  process.env.DIRECT_URL = process.env.DATABASE_URL;
  const { sendRecruiterEmailOnce } = await import("../src/lib/recruiter-delivery");
  const input = { applicationId: "synthetic", attemptKey: "attempt-1", recipient: "jobs@acme.invalid", recipientProvenanceJson: "{}",
    payload: { from: "test@example.invalid", to: "must-be-overridden@example.invalid", subject: "Test", text: "Synthetic" } };
  const run = async (response: any, throws = false, duplicate = false) => {
    const events: string[] = [];
    let sends = 0;
    const result = await sendRecruiterEmailOnce(input, {
      withinQuota: async (_kind, _to, fn) => { await fn(); return { sent: true, reason: null }; },
      recipientDomainAllowed: async () => ({ allowed: true, reason: null, domain: "acme.invalid", used: 0, limit: 12 }),
      findAttempt: async () => null,
      createAttempt: async () => { events.push("persist"); if (duplicate) throw Object.assign(new Error("duplicate"), { code: "P2002" }); return { id: "attempt-1" } as any; },
      send: async (payload, key) => { sends++; assert.equal(events[0], "persist"); assert.equal(payload.to, input.recipient); assert.equal(key, input.attemptKey); if (throws) throw new Error("socket lost"); return response; },
      accepted: async () => { events.push("accepted"); },
      uncertain: async (_id, rejected) => { events.push(rejected ? "rejected" : "unknown"); },
    });
    return { result, events, sends };
  };
  assert.equal((await run({ data: { id: "provider-id" }, error: null })).result.kind, "accepted");
  for (const error of [
    { name: "application_error", statusCode: null }, { name: "internal_server_error", statusCode: 500 },
    { name: "concurrent_idempotent_requests", statusCode: 409 }, { name: "invalid_idempotent_request", statusCode: 409 },
    { name: "request_timeout", statusCode: 408 }, { name: "unknown_error" },
  ]) {
    const result = await run({ data: null, error });
    assert.equal(result.result.kind, "uncertain", `Potential acceptance cannot be called rejected: ${error.name}`);
    assert(!result.events.includes("rejected")); assert.equal(result.sends, 1);
  }
  assert.equal((await run({ data: null, error: { name: "validation_error", statusCode: 422 } })).result.kind, "not_sent");
  assert.equal((await run({ data: null, error: null })).result.kind, "uncertain");
  assert.equal((await run(null, true)).result.kind, "uncertain");
  const duplicate = await run(null, false, true);
  assert.equal(duplicate.result.kind, "uncertain"); assert.equal(duplicate.sends, 0);
  const gateEvents: string[] = [];
  const denied = await sendRecruiterEmailOnce({ ...input, beforeSend: async () => { gateEvents.push("gate"); return false; } }, {
    withinQuota: async (_kind, _to, fn) => { await fn(); gateEvents.push("quota-recorded"); return { sent: true, reason: null }; },
    recipientDomainAllowed: async () => ({ allowed: true, reason: null, domain: "acme.invalid", used: 0, limit: 12 }),
    findAttempt: async () => null,
    createAttempt: async () => { gateEvents.push("persist"); return { id: "gate-attempt" } as any; },
    send: async () => { throw new Error("Denied eligibility must not contact provider"); },
    accepted: async () => { throw new Error("Denied eligibility must not be accepted"); },
    uncertain: async (_id, rejected) => { assert.equal(rejected, true); gateEvents.push("not-sent"); },
  });
  assert.deepEqual(denied, { kind: "not_sent", reason: "current_gate_blocked" });
  assert.deepEqual(gateEvents, ["persist", "gate", "not-sent"], "Latest gate precedes transmission and does not log a phantom send");
  // Real SDK catches a failed fetch and returns application_error rather than throwing.
  const oldFetch = globalThis.fetch;
  process.env.RESEND_API_KEY = "re_synthetic_test_only";
  try {
    globalThis.fetch = async () => { throw new Error("Synthetic connection lost after request"); };
    const result = await sendRecruiterEmailOnce(input, {
      withinQuota: async (_kind, _to, fn) => { await fn(); return { sent: true, reason: null }; },
      recipientDomainAllowed: async () => ({ allowed: true, reason: null, domain: "acme.invalid", used: 0, limit: 12 }),
      findAttempt: async () => null,
      createAttempt: async () => ({ id: "synthetic-sdk" } as any), accepted: async () => { throw new Error("not expected"); },
      uncertain: async (_id, rejected) => { assert.notEqual(rejected, true); },
    });
    assert.equal(result.kind, "uncertain");
  } finally { globalThis.fetch = oldFetch; delete process.env.RESEND_API_KEY; }
  const base = { status: "success", submittedVia: "portal_ashby", submitConfirmation: "DETECTED_HTTP_200", submissionReceiptJson: null };
  assert.equal(applicationDeliveryView(base).phase, "unconfirmed");
  assert.equal(applicationDeliveryView({ ...base, emailAttempts: [{ status: "accepted", providerEmailId: "id" }] }).phase, "accepted");
  assert.equal(applicationDeliveryView({ ...base, emailAttempts: [{ status: "delivered", providerEmailId: "id" }] }).phase, "delivered");
  assert.equal(applicationDeliveryView({ ...base, emailAttempts: [{ status: "bounced", providerEmailId: "id" }] }).phase, "failed");
  const uncertain = applicationDeliveryView({ ...base, status: "ready_to_apply", submitConfirmation: "UNCONFIRMED" });
  assert.equal(uncertain.phase, "unconfirmed"); assert(!uncertain.label.includes("NON inviata"));
  const worker = readFileSync("src/lib/application-worker.ts", "utf8");
  assert.match(worker, /: \{ status: "applying", submitConfirmation: "SUBMISSION_STARTED" \}/,
    "Late failure cannot downgrade a concurrently reconciled success");
  assert(!worker.includes("salaryExpectationEur = prefSalaryK"));
  assert.match(worker, /parseScopedApplicationAnswers\(answerRow\?\.userProvidedAnswersJson, applicationId\)/);
  assert(!worker.includes("const storedRows = await prisma.userAnswer"), "Global answer history cannot authorize another employer");
  for (const route of ["apply", "apply-batch", "consent"]) {
    const source = readFileSync(`src/app/api/applications/${route}/route.ts`, "utf8");
    assert.match(source, /enqueueApplication\([^,]+, \{ preserveClaim: true \}\)/, "Queue publication must preserve a poller claim");
  }
  assert(!worker.includes("RECRUITER_DELIVERY_BCC"), "Applicant documents must not be copied to unrelated debug inboxes");
  console.log("PASS send-flow: persisted-before-send, real SDK transport ambiguity, duplicate fence, truthful delivery UI and explicit factual-answer provenance.");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
