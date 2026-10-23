import assert from "node:assert/strict";
import { applicationWindow, creationMetrics, cohortDeliveryMetrics } from "../src/lib/admin-application-metrics";
import { isTestAccount } from "../src/lib/admin";
const now = Date.parse("2026-10-22T20:31:00Z");
const day = 86400000;
const users = ["real@customer.it", "umberto.geraci0+tag@googlemail.com", "e2e-person@customer.it", "staff@lavorai.it", "a@mailinator.com"];
const excluded = users.filter(isTestAccount);
assert.equal(excluded.length, 4);
for (const days of [1/24, 1, 7, 14, 28, 30, 90]) {
  assert.deepEqual(applicationWindow(now, days, excluded), {
    userId: { notIn: excluded }, createdAt: { gte: new Date(now-days*day), lt: new Date(now) },
  });
}
const row = (time: number) => ({ createdAt: new Date(time) });
const metrics = creationMetrics([row(now-28*day-1),row(now-28*day),row(now-14*day-1),row(now-14*day),row(now-1),row(now),row(now+1)],now);
assert.equal(metrics.total,4);
assert.equal(metrics.current,2);
assert.equal(metrics.previous,2);
assert.equal(metrics.series.reduce((a,b)=>a+b,0),4);
assert.equal(metrics.delta,0);
assert.equal(creationMetrics([],now).delta,undefined);
assert.equal(creationMetrics([row(now-1)],now).delta,undefined);
assert.equal(creationMetrics([row(now-20*day)],now).delta,-100);
const diagnosed = creationMetrics([...Array.from({length:365},()=>row(now-20*day)),...Array.from({length:68},()=>row(now-1))],now);
assert.equal(diagnosed.total,433);
assert.ok(Math.abs(diagnosed.delta! - (68-365)/365*100)<1e-9);
const base = {status:"success",submittedVia:null};
const email = (status:string, providerEmailId:string|null="id") => ({...base,submittedVia:"email_recruiter",emailAttempts:[{status,providerEmailId}]});
const proof = cohortDeliveryMetrics([base,{...base,submittedVia:"portal_greenhouse",submitConfirmation:"DETECTED_HTTP_200"},email("accepted"),email("delivered"),email("delivered",null),email("bounced"),{...base,status:"failed"},{...base,submittedVia:"mock_demo"}]);
assert.deepEqual(proof,{verified:1,accepted:1,unverified:2,problems:2,other:2});
assert.equal(Object.values(proof).reduce((a,b)=>a+b,0),8, "Delivery categories must partition the entire cohort");
console.log("Admin metrics: canonical filter, query windows, boundaries, series, zero baseline, percentages and evidence separation passed.");
