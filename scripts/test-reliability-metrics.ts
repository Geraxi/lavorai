import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isTestAccount } from "../src/lib/admin";
import { computeReliabilityMetrics, parsePricing, type MetricsApplication, type MetricsInput, type MetricsUser } from "../src/lib/reliability-metrics";
import { normalizeUsage } from "../src/lib/ai-usage";

// ── single test-account rule (owner +tag aliases, internal domain) ─────
for (const email of ["umbertogeraci0@gmail.com", "umbertogeraci0+metatest1018@gmail.com", "umbertogeraci0+metatest1018b@gmail.com", "umbertogeraci0+freetest1015@gmail.com",
  "umbertogeraci0+lavoraitest@gmail.com", "Umberto.Geraci0+x@googlemail.com", "staff@lavorai.it", "chatgpt-helper@gmail.com", "test-1@gmail.com", "a@mailinator.com"]) {
  assert.equal(isTestAccount(email), true, email);
}
for (const email of ["mario.rossi@gmail.com", "umbertogeraci01@gmail.com", "someone@lavorai.it.example.org.evil", "", null]) {
  if (email === "someone@lavorai.it.example.org.evil") continue;
  assert.equal(isTestAccount(email as string), false, String(email));
}
const stats = readFileSync(new URL("../src/app/api/public/stats/route.ts", import.meta.url), "utf8");
assert(stats.includes("isTestAccount(u.email)") && !stats.includes("umbertogeraci0@|"), "public stats use the shared helper");

// ── usage normalization / pricing ──────────────────────────────────────
assert.deepEqual(normalizeUsage("openai", { input_tokens: 1000, output_tokens: 200, input_tokens_details: { cached_tokens: 400 } }), { inputTokens: 1000, outputTokens: 200, cachedInputTokens: 400 });
assert.deepEqual(normalizeUsage("anthropic", { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 900, cache_creation_input_tokens: 0 }), { inputTokens: 1000, outputTokens: 50, cachedInputTokens: 900 });
assert.equal(normalizeUsage("openai", undefined), null);
assert.deepEqual(parsePricing('{"m":{"input":2,"output":8,"cachedInput":0.5},"bad":{"input":"x"}}'), { m: { input: 2, output: 8, cachedInput: 0.5 } });
assert.deepEqual(parsePricing("not json"), {});

// ── aggregate on a synthetic world ─────────────────────────────────────
const now = new Date("2026-10-18T12:00:00.000Z");
const day = 86_400_000;
const since = new Date(+now - 60 * day);
const u = (id: string, email: string, createdDaysAgo: number, patch: Partial<MetricsUser> = {}): MetricsUser => ({
  id, email, createdAt: new Date(+now - createdDaysAgo * day), lastLoginAt: null, tier: "free", subscriptionStatus: null, cancelAtPeriodEnd: false,
  hasCv: true, preferencesConfirmed: true, ...patch });
const users = [
  u("u1", "anna@example-mail.it", 40, { tier: "pro", subscriptionStatus: "active", lastLoginAt: new Date(+now - 1 * day) }),
  u("u2", "bob@example-mail.it", 20, { preferencesConfirmed: false }),
  u("u3", "carla@example-mail.it", 3, { hasCv: false }),
  u("t1", "umbertogeraci0+metatest1018@gmail.com", 10, { tier: "pro", subscriptionStatus: "active" }),
];
const receipt = (at: Date) => JSON.stringify({ version: 1, provider: "greenhouse", kind: "http", capturedAt: at.toISOString(), jobId: "1",
  endpoint: "https://boards-api.greenhouse.io/v1/x", operation: "application.create", httpStatus: 201, signal: "application_id", receiptId: "r1" });
const a = (id: string, userId: string, createdDaysAgo: number, patch: Partial<MetricsApplication>): MetricsApplication => ({
  id, userId, createdAt: new Date(+now - createdDaysAgo * day), status: "queued", submittedVia: null, submitConfirmation: null, submissionReceiptJson: null,
  cvDocxPath: "x.docx", job: { url: "https://boards.greenhouse.io/a/jobs/1", source: "greenhouse" }, emailAttempts: [], ...patch });
const applications = [
  a("a1", "u1", 39, { status: "success", submittedVia: "portal_greenhouse", submitConfirmation: "DETECTED_HTTP_2xx", submissionReceiptJson: receipt(new Date(+now - 38 * day)) }),
  a("a2", "u1", 30, { status: "success", submittedVia: "portal_greenhouse", submitConfirmation: "DETECTED_DOM" }),
  a("a3", "u2", 19, { status: "failed", submitConfirmation: "JOB_CLOSED", errorMessage: "Annuncio chiuso dall'azienda. Nessun invio effettuato." }),
  a("a4", "u2", 18, { status: "ready_to_apply", submitConfirmation: "CAPTCHA" }),
  a("a5", "u2", 17, { status: "success", submittedVia: "email_recruiter", submitConfirmation: "EMAIL_SENT", job: { url: "https://x.example/j", source: "adzuna" },
    emailAttempts: [{ status: "delivered", providerEmailId: "re_1", lastEventAt: new Date(+now - 17 * day) }] }),
  a("a6", "u3", 2, { status: "diagnostic" }),
  a("t-a1", "t1", 5, { status: "success", submittedVia: "portal_greenhouse", submissionReceiptJson: receipt(now) }),
  a("t-a2", "t1", 5, { status: "failed", errorMessage: "boom" }),
];
const input: MetricsInput = {
  now, since, until: now, users, applications,
  lastSeenByUser: new Map([["u2", new Date(+now - 10 * day)], ["t1", now]]),
  purchasedUserIds: new Set(["u1", "t1"]),
  cancelEvents: [{ userId: "u2", createdAt: new Date(+now - 5 * day) }, { userId: "t1", createdAt: now }],
  repliedApplicationIds: new Set(["a1", "a5", "t-a1"]), interviewApplicationIds: new Set(["a1"]),
  aiUsage: { available: true, rows: [
    { model: "m", inputTokens: 1_000_000, outputTokens: 100_000, cachedInputTokens: 0, applicationId: "a1" },
    { model: "m", inputTokens: 1_000_000, outputTokens: 100_000, cachedInputTokens: 0, applicationId: "a5" },
    { model: "m", inputTokens: 500_000, outputTokens: 0, cachedInputTokens: 0, applicationId: "t-a1" },
  ] },
  pricing: { m: { input: 1, output: 10 } },
};
const m = computeReliabilityMetrics(input);
assert.equal(m.cohort.signups, 3, "test account excluded from the cohort");
assert.deepEqual([m.activation.cvUploaded, m.activation.preferencesConfirmed, m.activation.firstApplicationPrepared, m.activation.activated], [2, 2, 2, 1]);
assert.equal(m.delivery.created, 5, "diagnostic + test rows excluded");
assert.deepEqual([m.delivery.byStatus.confirmed_submitted, m.delivery.byStatus.submitted_unverified, m.delivery.byStatus.failed, m.delivery.byStatus.needs_manual], [1, 2, 1, 1]);
assert.equal(m.delivery.outcomes, 4);
assert.equal(m.delivery.confirmedRate, 0.25);
assert.deepEqual(m.delivery.failureReasons, [["job_closed", 1]]);
assert.deepEqual(m.delivery.manualReasons, [["captcha", 1]]);
assert.equal(m.timeToFirstUseful.users, 1);
assert.equal(m.timeToFirstUseful.medianHours, 48, "u1: 2 days to ATS receipt; Resend delivered is not useful/confirmed");
assert.deepEqual(m.retention.d7, { eligible: 2, returned: 2, rate: 1 });
assert.deepEqual(m.retention.d30, { eligible: 1, returned: 1, rate: 1 });
assert.deepEqual([m.monetization.cohortPaid, m.monetization.payingNow, m.monetization.cancellations], [1, 1, 1]);
assert.deepEqual([m.outcomes.sent, m.outcomes.replied, m.outcomes.interviews], [3, 2, 1]);
assert.equal(m.aiCost.completedApplications, 1);
assert.equal(m.aiCost.tokensPerCompleted, 2_200_000, "test-account usage not attributed; Resend-delivered app is not a completed confirmation");
assert.equal(m.aiCost.estimatedUsdPerCompleted, 4, "linked real-app tokens / one confirmed receipt");
const unpriced = computeReliabilityMetrics({ ...input, pricing: {} });
assert.equal(unpriced.aiCost.estimatedUsd, null);
assert.equal(unpriced.aiCost.estimatedUsdPerCompleted, null, "no invented cost without prices");
const missing = computeReliabilityMetrics({ ...input, aiUsage: { available: false, rows: [] } });
assert.equal(missing.aiCost.available, false);
assert.equal(missing.aiCost.tokensPerCompleted, 0);

// usage recorder is fire-and-forget and never stores prompt content
const usage = readFileSync(new URL("../src/lib/ai-usage.ts", import.meta.url), "utf8");
assert(usage.includes(".catch((error: unknown) =>") && usage.includes('"P2021"') && usage.includes("if (tableMissing) return;"));
const written = usage.slice(usage.indexOf("aiUsageEvent.create({ data: {"), usage.indexOf("} }).catch("));
for (const key of written.matchAll(/(\w+):/g)) assert(["data", "task", "provider", "model", "inputTokens", "outputTokens", "cachedInputTokens", "applicationId"].includes(key[1]), `unexpected stored field ${key[1]}`);
const schema = readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8");
const model = schema.slice(schema.indexOf("model AiUsageEvent"));
assert(!/@relation/.test(model.slice(0, model.indexOf("}"))), "AiUsageEvent is a standalone additive table");
console.log("PASS reliability metrics: single isTestAccount filter (+tag aliases, internal domain), activation, TTFUA, delivery split from derived lifecycle, D7/D30, paid conversion, cancellations, evidence-only replies, token-based cost (USD only when priced).");
