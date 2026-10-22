import * as emailPolicy from "../src/lib/email-dispatch-policy";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { createHash } from "node:crypto";
import { applicationsPaused } from "../src/lib/application-pause";

function load(path: string, mocks: Record<string, any>, transform: (source: string) => string = source => source): any {
  const exports = {};
  const source = ts.transpileModule(transform(readFileSync(path, "utf8")), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
  } }).outputText;
  new Function("require", "exports", source)((name: string) => mocks[name] ?? {}, exports);
  return exports;
}

async function main() {
  const saved = { pause: process.env.APPLICATIONS_PAUSED, mode: process.env.LAVORAI_RELEASE_CANARY, domain: process.env.INBOUND_EMAIL_DOMAIN, ownerId: process.env.LAVORAI_RELEASE_CANARY_OWNER_ID, recipient: process.env.LAVORAI_RELEASE_CANARY_RECIPIENT };
  try {
    process.env.LAVORAI_RELEASE_CANARY_OWNER_ID = "fictional-owner-test";
    process.env.LAVORAI_RELEASE_CANARY_RECIPIENT = "fictional-owner@example.invalid";
    process.env.APPLICATIONS_PAUSED = "true";
    process.env.LAVORAI_RELEASE_CANARY = "email-20261013-owner";
    process.env.INBOUND_EMAIL_DOMAIN = "inbound.lavorai.it";
    let row: any;
    let reads = 0;
    let changeBeforeSend = false;
    const testPin = createHash("sha256").update(JSON.stringify(["fictional-owner-test", "fictional-owner@example.invalid"])).digest("hex");
    const productionBinding = load("src/lib/release-email-canary.ts", { "node:crypto": { createHash } });
    assert.equal(productionBinding.releaseCanaryOwner(), null, "Production pin rejects fictional/configured arbitrary recipients");
    const canary = load("src/lib/release-email-canary.ts", {
      "node:crypto": { createHash },
      "@/lib/application-pause": { applicationsPaused },
      "@/lib/db": { prisma: { application: { findUnique: async () => { reads++; return changeBeforeSend && reads > 1 ? { ...row, userId: "other-customer" } : row; } } } },
    }, source => source.replace(/const PINNED_OWNER_SHA256 = "[a-f0-9]{64}";/, `const PINNED_OWNER_SHA256 = "${testPin}";`));
    const C = { ...canary.RELEASE_CANARY, userId: "fictional-owner-test", email: "fictional-owner@example.invalid" };
    process.env.LAVORAI_RELEASE_CANARY_RECIPIENT = "wrong@example.invalid";
    assert.equal(canary.releaseCanaryOwner(), null);
    process.env.LAVORAI_RELEASE_CANARY_RECIPIENT = C.email;
    process.env.LAVORAI_RELEASE_CANARY_OWNER_ID = "wrong-owner";
    assert.equal(canary.releaseCanaryOwner(), null);
    process.env.LAVORAI_RELEASE_CANARY_OWNER_ID = C.userId;
    const fixture = () => ({
      id: C.applicationId, userId: C.userId, jobId: C.jobId, portal: "release_canary", status: "diagnostic",
      sessionId: null, cvDocxPath: null, cvPdfPath: null, coverLetterPath: null, coverLetterText: null,
      consentGrantedAt: null, startedAt: null, submittedAt: null, submittedVia: null,
      submitConfirmation: "RELEASE_DIAGNOSTIC", user: { id: C.userId, email: C.email },
      job: { id: C.jobId, source: "release_canary", externalId: C.jobId, title: C.title, company: C.company,
        description: C.description, url: C.url, recruiterEmail: C.email, closedAt: new Date() },
    });
    row = fixture();
    const input = { applicationId: C.applicationId, attemptKey: C.attemptKey, recipient: C.email,
      recipientProvenanceJson: canary.RELEASE_CANARY_PROVENANCE, payload: canary.releaseCanaryPayload(), releaseCanary: true };
    assert.equal(await canary.authorizeReleaseCanary(input), true);
    for (const key of ["applicationId", "attemptKey", "recipient", "recipientProvenanceJson"]) {
      assert.equal(await canary.authorizeReleaseCanary({ ...input, [key]: "not-approved" }), false);
    }
    for (const payload of [
      { ...input.payload, cc: C.email }, { ...input.payload, bcc: C.email },
      { ...input.payload, attachments: [] }, { ...input.payload, headers: { Bcc: "outside@example.invalid" } },
      { ...input.payload, to: [C.email] }, { ...input.payload, text: "private customer data" },
      { ...input.payload, replyTo: "outside@example.invalid" }, { ...input.payload, html: "extra" },
    ]) assert.equal(await canary.authorizeReleaseCanary({ ...input, payload }), false);
    for (const mutation of [
      { userId: "other-customer" }, { jobId: "real-job" }, { status: "queued" }, { portal: "email" },
      { cvDocxPath: "customer.docx" }, { cvPdfPath: "customer.pdf" }, { coverLetterText: "private" },
      { consentGrantedAt: new Date() }, { sessionId: "real-round" }, { startedAt: new Date() },
      { user: { id: C.userId, email: "other@example.invalid" } },
      { job: { ...fixture().job, recruiterEmail: "employer@example.invalid" } },
      { job: { ...fixture().job, source: "verified_employer" } },
    ]) { row = { ...fixture(), ...mutation }; assert.equal(await canary.authorizeReleaseCanary(input), false); }
    row = fixture();
    const sender = load("src/lib/recruiter-delivery.ts", {
      "@/lib/email-dispatch-policy": emailPolicy,
      "@/lib/application-pause": { applicationsPaused }, "@/lib/release-email-canary": canary,
    }).sendRecruiterEmailOnce;
    const events: string[] = [];
    const deps = {
      withinQuota: async (kind: string, to: string, fn: () => Promise<void>) => {
        assert.equal(kind, "release_canary"); assert.equal(to, C.email); await fn(); return { sent: true, reason: null };
      },
      createAttempt: async () => { events.push("persist"); return { id: "diagnostic-attempt" }; },
      send: async (payload: any, key: string) => {
        assert.deepEqual(events, ["persist"]); assert.equal(key, C.attemptKey);
        assert.equal(payload.to, C.email); assert.equal(payload.text, C.text); assert.equal(payload.replyTo, C.replyTo);
        for (const forbidden of ["cc", "bcc", "headers", "attachments", "html"]) assert(!(forbidden in payload));
        assert.deepEqual(payload.tags, [{ name: "app_id", value: C.applicationId }, { name: "attempt_id", value: "diagnostic-attempt" }]);
        events.push("send"); return { data: { id: "provider-id" }, error: null };
      },
      accepted: async () => { events.push("accepted"); },
      uncertain: async () => { events.push("not-sent"); },
    };
    assert.deepEqual(await sender({ ...input, releaseCanary: undefined }, deps), { kind: "not_sent", reason: "applications_paused" });
    assert.deepEqual(events, [], "All ordinary sends stay blocked, including the owner's real applications");
    reads = 0;
    assert.equal((await sender(input, deps)).kind, "accepted");
    assert.equal(reads, 2, "Recheck server identity immediately before transmission");
    assert.deepEqual(events, ["persist", "send", "accepted"]);
    events.length = 0; reads = 0; changeBeforeSend = true;
    assert.deepEqual(await sender(input, deps), { kind: "not_sent", reason: "current_gate_blocked" });
    assert.deepEqual(events, ["persist", "not-sent"]);
    changeBeforeSend = false; events.length = 0;
    assert.equal((await sender(input, { ...deps, createAttempt: async () => { throw new Error("unique attempt key"); } })).kind, "uncertain");
    assert.deepEqual(events, [], "Duplicate/unknown attempt must not send");
    process.env.LAVORAI_RELEASE_CANARY = "";
    assert.equal((await sender(input, deps)).kind, "not_sent");
    process.env.LAVORAI_RELEASE_CANARY = C.mode;
    process.env.APPLICATIONS_PAUSED = "false";
    assert.equal((await sender(input, deps)).kind, "not_sent", "Canary cannot run after customer work resumes");
    process.env.APPLICATIONS_PAUSED = "true";
    process.env.INBOUND_EMAIL_DOMAIN = "outside.example.invalid";
    assert.equal((await sender(input, deps)).kind, "not_sent");
    const evidence = load("src/lib/application-evidence.ts", {}).deliveryEvidence;
    assert.equal(evidence({ status: "diagnostic", submittedVia: null, emailAttempts: [{ status: "delivered", providerEmailId: "id" }] }), "excluded");
    let updates = 0;
    const applyReply = load("src/lib/apply-reply-to-application.ts", {}).applyReplyToApplication;
    assert.equal(await applyReply({ applicationId: C.applicationId, isHuman: true, kind: "risposta" }, {
      application: { findUnique: async () => ({ status: "diagnostic" }), update: async () => { updates++; } },
    }), true);
    assert.equal(updates, 0, "Test reply cannot inflate employer-interest aggregates");
    for (const file of ["src/lib/auto-apply-cron.ts", "src/app/api/applications/apply/route.ts", "src/app/api/applications/apply-batch/route.ts", "src/app/api/sidebar-stats/route.ts"]) {
      assert(!readFileSync(file, "utf8").includes('status: { not: "failed" }'), "Exclude diagnostic status from actual quotas");
    }
    const runner = readFileSync("src/ops/release-email-canary.ts", "utf8");
    assert(!runner.includes("completeApplicationSubmission"));
    assert(!runner.includes("processApplication"));
    assert(!runner.includes("cvProfile"));
    assert(!runner.includes("process.argv"), "No arbitrary fixture/destination/body arguments");
    assert.match(runner, /existing_attempt_no_resend/);
    assert.match(runner, /setInterval\(\(\) => \{\}, 60_000\)/);
    console.log("PASS owner canary: exact account/recipient/fixture/payload, CC/BCC/data rejection, durable-before-send, final recheck, duplicate fence, no profile/AI/round/consent mutation, diagnostic metrics exclusion.");
  } finally {
    for (const [key, value] of Object.entries({ APPLICATIONS_PAUSED: saved.pause, LAVORAI_RELEASE_CANARY: saved.mode, INBOUND_EMAIL_DOMAIN: saved.domain, LAVORAI_RELEASE_CANARY_OWNER_ID: saved.ownerId, LAVORAI_RELEASE_CANARY_RECIPIENT: saved.recipient })) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
