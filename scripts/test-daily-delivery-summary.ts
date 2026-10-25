import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { deliveryEvidence } from "../src/lib/application-evidence";

// Exercise production querying and both notification renderers with isolated
// database/quota/Resend boundaries. No network or real notification is possible.
const receipt = JSON.stringify({ version: 1, provider: "greenhouse", kind: "dom", capturedAt: new Date().toISOString(), jobId: "123", signal: "new_receipt_and_form_removed" });
const base = { status: "success", submittedVia: "portal_greenhouse", submitConfirmation: "DETECTED_HTTP_200", submissionReceiptJson: null, emailAttempts: [] };
const job = (title: string) => ({ title, company: "Company <private>", url: "https://careers.example.test/job" });
const portal = { ...base, submissionReceiptJson: receipt, job: job("Verified portal") };
const email = (status: string, overrides: Record<string, unknown> = {}) => ({
  ...base, submittedVia: "email_recruiter", submitConfirmation: "EMAIL_SENT",
  emailAttempts: [{ status, providerEmailId: "provider-private-id" }], job: job(status), ...overrides,
});
const applications = [
  portal, email("delivered"), email("accepted"), email("delayed"), email("bounced"), email("failed"), email("complained"), email("sending"),
  { ...base, job: job("Legacy DETECTED") },
  { ...base, submittedVia: "email_recruiter", submitConfirmation: "EMAIL_SENT", job: job("Legacy EMAIL_SENT") },
  { ...base, submittedVia: null, job: job("Legacy success only") },
  { ...base, status: "ready_to_apply", submitConfirmation: "UNCONFIRMED", job: job("Unconfirmed submit") },
  { ...base, status: "ready_to_apply", submittedVia: null, submitConfirmation: "NOT_SUBMITTED", job: job("Ready to review") },
  { ...base, status: "failed", submittedVia: null, submitConfirmation: null, job: job("Failed preparation") },
  { ...portal, submitConfirmation: "DRY_RUN", job: job("Dry run excluded") },
  { ...portal, submittedVia: "mock_demo", job: job("Mock excluded") },
];
interface HarnessOptions {
  rows?: any[]; locale?: string; quota?: boolean; cooldown?: boolean; key?: boolean;
  provider?: "accepted" | "error" | "missing-id" | "throw";
  testAccount?: boolean;
}
function harness(options: HarnessOptions = {}) {
  const queries: Record<string, any> = {};
  const sent: Array<{ subject: string; html: string; text: string }> = [];
  let quotaCalls = 0;
  let successfulQuotaLogs = 0;
  class Resend {
    emails = { send: async (payload: { subject: string; html: string; text: string }) => {
      sent.push(payload);
      if (options.provider === "throw") throw Error("Synthetic network error");
      if (options.provider === "error") return { data: null, error: { message: "Rejected" } };
      if (options.provider === "missing-id") return { data: {}, error: null };
      return { data: { id: "notification-provider-id" }, error: null };
    } };
  }
  const dependencies: Record<string, unknown> = {
    resend: { Resend },
    "@/lib/application-evidence": { deliveryEvidence },
    "@/lib/admin": { isTestAccount: () => options.testAccount === true },
    "@/lib/db": { prisma: {
      application: {
        groupBy: async (query: unknown) => { queries.active = query; return [{ userId: "owner" }]; },
        findMany: async (query: unknown) => { queries.apps = query; return options.rows ?? applications; },
      },
      user: { findUnique: async () => ({ id: "owner", email: "owner@example.test", name: "<img> Owner", locale: options.locale ?? "en" }) },
      emailLog: { count: async (query: unknown) => { queries.cooldown = query; return options.cooldown ? 1 : 0; } },
    } },
    "@/lib/resend-keys": { redactEmailAddress: (value: string) => value[0] + "***@redacted.test", scrubResendSecretText: (value: string) => value },
    "@/lib/email-quota": { EMAIL_LOG_SUCCESS_WHERE: { outcome: { in: ["accepted", "delivered"] } }, sendWithinQuota: async (kind: string, to: string, callback: () => Promise<unknown>) => {
      quotaCalls++; assert.equal(kind, "daily_summary"); assert.equal(to, "owner@example.test");
      if (options.quota === false) return { sent: false, reason: "daily quota" };
      const raw = await callback() as { data?: { id?: string }; error?: unknown } | void;
      if (raw && (raw.error || !raw.data?.id)) {
        return { sent: false, reason: raw.error ? "provider_rejected" : "provider_acceptance_unknown", outcome: raw.error ? "failed" : "unknown" };
      }
      successfulQuotaLogs++; return { sent: true, reason: null, outcome: "accepted" };
    } },
  };
  const source = ts.transpileModule(readFileSync("src/lib/daily-summary.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const module = { exports: {} as any };
  vm.runInNewContext(source, {
    module, exports: module.exports, Date, URL,
    process: { env: { ...(options.key === false ? {} : { RESEND_API_KEY: "isolated-test-only" }), NEXT_PUBLIC_SITE_URL: "https://lavorai.example.test" } },
    require: (id: string) => { assert.ok(id in dependencies, `Unexpected live dependency: ${id}`); return dependencies[id]; },
  });
  return { run: module.exports.runDailySummary, queries, sent, quotaCalls: () => quotaCalls, logs: () => successfulQuotaLogs };
}
async function main() {
  for (const locale of ["en", "it"]) {
    const h = harness({ locale });
    const result = await h.run({ onlyEmail: "owner@example.test" });
    assert.equal(result.sent, 1); assert.equal(result.errors, 0); assert.equal(h.logs(), 1);
    assert.equal(result.details[0].status, "accepted");
    assert.equal(result.details[0].counts, "portal=1,delivered=1,accepted=2,no_bounce=0,unknown=0,pending=1,problems=4,unverified=4,prepared=1");
    const payload = h.sent[0];
    assert.ok(payload.subject.includes("14"), "Every application contributes to exactly one bucket; dry/mock excluded");
    assert.ok(!/delivered|consegnat|success|inviate/.test(payload.subject), "The subject cannot imply all activity is delivery");
    for (const rendered of [payload.text, payload.html]) {
      assert.ok(rendered.includes(locale === "en" ? "Portal submissions with a verified application receipt" : "Candidature su portale con ricevuta verificata"));
      assert.ok(rendered.includes(locale === "en" ? "Email delivery confirmed by the provider; no proof of reading" : "Email con consegna confermata dal provider; lettura non verificata"));
      assert.ok(rendered.includes(locale === "en" ? "Emails accepted by the provider; delivery still pending" : "Email accettate dal provider; consegna ancora in attesa"));
      assert.ok(rendered.includes(locale === "en" ? "historical records without delivery proof" : "storico senza prova di consegna"));
      assert.ok(!rendered.includes("SMTP 250"));
      assert.ok(!/auto-retry|retry automatico|1-click/.test(rendered));
      assert.ok(!rendered.includes("provider-private-id"));
      assert.ok(!rendered.includes("Dry run excluded")); assert.ok(!rendered.includes("Mock excluded"));
    }
    assert.ok(!payload.html.includes("<img>"), "Names must be escaped in HTML");
    assert.ok(payload.html.includes("&lt;img&gt;"));
    assert.equal(h.queries.active.where.user.email, "owner@example.test");
    assert.ok(h.queries.active.where.OR[1].emailAttempts.some.updatedAt.gte instanceof Date);
    assert.ok(h.queries.apps.where.OR[1].emailAttempts.some.updatedAt.gte instanceof Date, "Late bounce/delivery updates must be included");
    assert.equal(h.queries.apps.where.userId, "owner");
    assert.equal(h.queries.apps.select.submissionReceiptJson, true);
    assert.equal(h.queries.apps.select.emailAttempts.take, 1);
    assert.equal(h.queries.apps.select.emailAttempts.orderBy.createdAt, "desc");
    assert.equal(h.queries.apps.select.emailAttempts.select.providerEmailId, true);
  }
  // A legacy success alone never emits a confirmed-delivery section.
  const legacy = harness({ rows: [applications[8], applications[9], applications[10]] });
  await legacy.run();
  assert.ok(!legacy.sent[0].text.includes("Portal submissions with a verified"));
  assert.ok(!legacy.sent[0].text.includes("Email delivery confirmed"));
  assert.ok(legacy.sent[0].text.includes("3: Applications with unverified"));
  for (const provider of ["error", "missing-id", "throw"] as const) {
    const h = harness({ provider }); const result = await h.run();
    assert.equal(result.sent, 0, provider); assert.equal(result.errors, 1, provider); assert.equal(h.logs(), 0, provider);
    assert.notEqual(result.details[0].status, "accepted");
  }
  const quota = harness({ quota: false }); const quotaResult = await quota.run();
  assert.equal(quotaResult.sent, 0); assert.equal(quotaResult.skipped, 1); assert.equal(quota.sent.length, 0); assert.equal(quotaResult.details[0].status, "quota_blocked");
  for (const options of [{ cooldown: true }, { key: false }, { testAccount: true }, { rows: [applications[14], applications[15]] }]) {
    const h = harness(options); const result = await h.run(); assert.equal(result.sent, 0); assert.equal(h.sent.length, 0); assert.equal(result.skipped, 1);
  }
  const dry = harness(); const dryResult = await dry.run({ dryRun: true });
  assert.equal(dryResult.sent, 0); assert.equal(dry.quotaCalls(), 0); assert.equal(dry.sent.length, 0); assert.equal(dryResult.details[0].status, "dry_run");
  console.log("Daily delivery summary: production query and EN/IT rendering evidence buckets, late provider updates, legacy ambiguity, quota and provider rejection paths passed without network/email.");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
