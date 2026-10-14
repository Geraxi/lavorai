import assert from "node:assert/strict";
import { aggregatePerformance, analyticsPeriod, type PerformanceApplication } from "../src/lib/analytics-performance";
const now = new Date("2026-09-23T12:00:00Z");
const sent = new Date("2026-09-22T15:00:00Z");
const reply = new Date("2026-09-23T09:00:00Z");
const submissionReceiptJson = JSON.stringify({ version: 1, provider: "greenhouse", kind: "dom", capturedAt: sent.toISOString(), jobId: "12345", signal: "new_receipt_and_form_removed" });
const base: PerformanceApplication = { submissionReceiptJson, emailAttempts: [], status: "success", submittedVia: "portal_greenhouse", submitConfirmation: "DETECTED", createdAt: new Date("2026-01-01"), submittedAt: sent, completedAt: sent, userStatus: null, lastReplyAt: null, lastReplyKind: null, replies: [], gmailMessages: [], cvDocxPath: null, cvPdfPath: null, role: "Designer", match: null };
for (const days of [7, 30, 90]) {
  const result = aggregatePerformance([base], days, now);
  assert.equal(result.buckets.length, days);
  assert.equal(result.sent, 1, "use submission date rather than creation date");
  assert.equal(result.buckets.at(-2)?.sent, 1);
}
assert.equal(analyticsPeriod(NaN, now).days, 30);
assert.equal(aggregatePerformance([{ ...base, submittedAt: new Date("2026-09-17T00:00:00Z") }, { ...base, submittedAt: new Date("2026-09-16T23:59:59Z") }], 7, now).sent, 1);
const receipt = { ...base, lastReplyAt: reply, lastReplyKind: "ricevuta", replies: [{ receivedAt: reply, isHuman: true, kind: "ricevuta" }] };
assert.equal(aggregatePerformance([receipt], 7, now).replied, 0, "receipts are not responses even if marked human");
const human = { ...base, replies: [{ receivedAt: reply, isHuman: true, kind: "risposta" }], gmailMessages: [{ date: reply, isHuman: true, kind: "risposta" }] };
const data = aggregatePerformance([human, receipt], 7, now);
assert.equal(data.replied, 1, "deduplicate replies across Gmail and application replies");
assert.equal(data.responseRate, 50);
assert.equal(data.buckets.at(-1)?.replies, 1);
assert.equal(data.match, null, "missing match must not appear as 100%");
assert.equal(data.savedHours, .5);
for (const override of [{ submittedVia: "mock_demo" }, { submitConfirmation: "DRY_RUN" }, { submitConfirmation: "UNCONFIRMED" }, { submittedVia: null }, { status: "failed" }]) {
  assert.equal(aggregatePerformance([{ ...base, ...override }], 7, now).sent, 0);
}
assert.equal(aggregatePerformance([{ ...base, lastReplyAt: reply, lastReplyKind: "colloquio" }], 7, now).interviews, 0, "legacy summary alone is not a verified message");
assert.equal(aggregatePerformance([{ ...base, userStatus: "colloquio" }], 7, now).interviews, 1, "manual interview state remains labelled separately");
assert.equal(aggregatePerformance([{ ...base, replies: [{ receivedAt: new Date("2026-09-24"), kind: "risposta", isHuman: true }] }], 7, now).replied, 0);
assert.equal(aggregatePerformance([{ ...base, submittedAt: null, completedAt: sent, match: 80, cvPdfPath: "cv.pdf" }], 7, now).tailored, 100);
console.log("Analytics: periods, confirmed sends, real replies, deduplication, date boundaries and estimates passed.");

for (const submitConfirmation of [null, "DETECTED", "DETECTED_HTTP_200", "DETECTED_HTTP_302", "DETECTED_DOM", "SENT_EMAIL"]) {
  const legacy = aggregatePerformance([{ ...base, submitConfirmation, submissionReceiptJson: null }], 7, now);
  assert.equal(legacy.sent, 0, "Legacy markers cannot prove ATS acceptance");
  assert.equal(legacy.legacyUnverified, 1, "Preserve historical applications in a separate category");
}
const email = (status: string, providerEmailId: string | null = "provider-1"): PerformanceApplication => ({
  ...base, submittedVia: "email_recruiter", submissionReceiptJson: null,
  emailAttempts: [{ status, providerEmailId, createdAt: sent, acceptedAt: sent }],
});
const delivery = aggregatePerformance([
  base, email("accepted"), email("delayed"), email("delivered"), email("failed"), email("bounced"),
  email("complained"), email("sending"), email("unknown"), email("delivered", null),
], 7, now);
assert.equal(delivery.sent, 2);
assert.equal(delivery.portalConfirmed, 1);
assert.equal(delivery.emailDelivered, 1);
assert.equal(delivery.providerAccepted, 2);
assert.equal(delivery.deliveryProblems, 3);
assert.equal(delivery.pending, 3);
assert.equal(aggregatePerformance([{ ...email("bounced"), emailAttempts: [...email("bounced").emailAttempts!, ...email("delivered").emailAttempts!] }], 7, now).sent, 0, "Latest attempt controls evidence, not an earlier success");
assert.equal(aggregatePerformance([{ ...base, emailAttempts: email("failed").emailAttempts }], 7, now).sent, 1, "Old email failures do not override a new verified portal receipt");
assert.equal(aggregatePerformance([{ ...base, submissionReceiptJson: "{}" }], 7, now).sent, 0);
assert.equal(aggregatePerformance([{ ...base, replies: [{ receivedAt: reply, kind: "colloquio", isHuman: true, isSecurityCode: true }] }], 7, now).replied, 0);
assert.equal(aggregatePerformance([{ ...email("accepted"), replies: [{ receivedAt: reply, kind: "risposta", isHuman: true }] }, human], 7, now).responseRate, 100, "Numerator and denominator must use the same confirmed cohort");
console.log("Analytics: structured receipt boundary, legacy preservation, accepted vs delivered, failure/OTP exclusions and cohort rate passed.");
