import assert from "node:assert/strict";
import { DEFAULT_FREE_WEEKLY_APPLY_QUOTA, FREE_QUOTA_NON_CONSUMING_STATUSES, FREE_QUOTA_WORKER_INFLIGHT_STATUSES, freeQuotaWindowStart,
  freeWeeklyApplyQuota, hasPaidOrTrialApplicationAccess, usesFreeWeeklyQuota } from "../src/lib/billing";
import { freeQuotaAvailable } from "../src/lib/application-worker-gates";
import { paidPriorityRank, PAID_PRIORITY_RANK as R } from "../src/lib/paid-priority";

delete process.env.FREE_WEEKLY_APPLY_QUOTA;
const now = new Date();
const old = new Date("2025-01-01T00:00:00Z");
const fresh = new Date(+now - 86400_000);
const future = new Date(+now + 30 * 86400_000);

// Config
assert.equal(DEFAULT_FREE_WEEKLY_APPLY_QUOTA, 5);
assert.equal(freeWeeklyApplyQuota({}), 5);
assert.equal(freeWeeklyApplyQuota({ FREE_WEEKLY_APPLY_QUOTA: "3" }), 3);
assert.equal(freeWeeklyApplyQuota({ FREE_WEEKLY_APPLY_QUOTA: "0" }), 0);
for (const bad of ["-1", "2.5", "abc", " "]) assert.equal(freeWeeklyApplyQuota({ FREE_WEEKLY_APPLY_QUOTA: bad }), 5);
assert.equal(+now - +freeQuotaWindowStart(now), 7 * 86400_000);

// Who is on the free quota
const paid = { tier: "pro", subscriptionStatus: "active", createdAt: old, currentPeriodEnd: future };
assert.equal(hasPaidOrTrialApplicationAccess(paid, now), true);
assert.equal(usesFreeWeeklyQuota(paid, now), false);
const cardTrial = { tier: "free", subscriptionStatus: "trialing", createdAt: fresh, currentPeriodEnd: future };
assert.equal(usesFreeWeeklyQuota(cardTrial, now), false, "trial with card keeps its daily limit");
assert.equal(usesFreeWeeklyQuota({ tier: "free", email: "antonella.lasalandra07@gmail.com", createdAt: old }, now), false, "lifetime Pro+");
const freeCases = [
  { tier: "free", subscriptionStatus: null, createdAt: old, currentPeriodEnd: null }, // trial expired
  { tier: "free", subscriptionStatus: null, createdAt: fresh, currentPeriodEnd: null }, // trial without card
  { tier: "pro", subscriptionStatus: "past_due", createdAt: old, currentPeriodEnd: future },
  { tier: "pro", subscriptionStatus: "canceled", createdAt: old, currentPeriodEnd: null },
  { tier: "pro", subscriptionStatus: "active", createdAt: old, currentPeriodEnd: new Date(0) },
];
for (const u of freeCases) assert.equal(usesFreeWeeklyQuota(u, now), true, JSON.stringify(u));
process.env.FREE_WEEKLY_APPLY_QUOTA = "0";
for (const u of freeCases) assert.equal(usesFreeWeeklyQuota(u, now), false);
delete process.env.FREE_WEEKLY_APPLY_QUOTA;

// Counting rules
assert.deepEqual([...FREE_QUOTA_NON_CONSUMING_STATUSES].sort(), ["canceled", "cancelled", "diagnostic", "failed"]);
for (const s of ["success", "queued", "optimizing", "applying", "submitting", "awaiting_consent", "needs_answers", "ready_to_apply"]) {
  assert.ok(!FREE_QUOTA_NON_CONSUMING_STATUSES.includes(s), `${s} consumes quota at creation`);
}
assert.ok(!FREE_QUOTA_WORKER_INFLIGHT_STATUSES.includes("queued"), "queued backlog does not block sends");
assert.ok(!FREE_QUOTA_WORKER_INFLIGHT_STATUSES.includes("failed"));

// Worker admission with a fake tx
async function avail(used: number, user: object) {
  let where: unknown;
  const tx = { application: { count: async (args: { where: unknown }) => { where = args.where; return used; } } };
  const ok = await freeQuotaAvailable(tx as never, { id: "a", userId: "u", user: user as never }, now);
  return { ok, where };
}
(async () => {
const freeUser = freeCases[0];
assert.equal((await avail(4, freeUser)).ok, true);
assert.equal((await avail(5, freeUser)).ok, false);
const { where } = await avail(0, freeUser);
assert.equal((where as { id: { not: string } }).id.not, "a", "excludes the row being admitted");
assert.equal((await avail(999, paid)).ok, true, "paid users never hit the free count");

})().then(() => console.log("free weekly quota worker admission: ok"), (e) => { console.error(e); process.exitCode = 1; });
// Free users stay lowest priority
for (const u of freeCases) assert.equal(paidPriorityRank(u), R.none);
console.log("free weekly quota: ok");
