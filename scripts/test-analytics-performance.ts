import assert from "node:assert/strict";
import { aggregatePerformance, analyticsPeriod, type PerformanceApplication } from "../src/lib/analytics-performance";
const now = new Date("2026-09-23T12:00:00Z");
const sent = new Date("2026-09-22T15:00:00Z");
const reply = new Date("2026-09-23T09:00:00Z");
const base: PerformanceApplication = { status: "success", submittedVia: "portal_greenhouse", submitConfirmation: "DETECTED", createdAt: new Date("2026-01-01"), submittedAt: sent, completedAt: sent, userStatus: null, lastReplyAt: null, lastReplyKind: null, replies: [], gmailMessages: [], cvDocxPath: null, cvPdfPath: null, role: "Designer", match: null };
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
assert.equal(aggregatePerformance([{ ...base, lastReplyAt: reply, lastReplyKind: "colloquio" }], 7, now).interviews, 1);
assert.equal(aggregatePerformance([{ ...base, replies: [{ receivedAt: new Date("2026-09-24"), kind: "risposta", isHuman: true }] }], 7, now).replied, 0);
assert.equal(aggregatePerformance([{ ...base, submittedAt: null, completedAt: sent, match: 80, cvPdfPath: "cv.pdf" }], 7, now).tailored, 100);
console.log("Analytics: periods, confirmed sends, real replies, deduplication, date boundaries and estimates passed.");
