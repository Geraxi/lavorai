import assert from "node:assert/strict";
import { paidPriorityRank, sortByPaidPriority, claimScanWindow, PAID_PRIORITY_RANK as R } from "../src/lib/paid-priority";
import { orderClaimable } from "../src/lib/application-claim";

const old = new Date("2025-01-01T00:00:00Z"); // registration trial long expired
const fresh = new Date(Date.now() - 86400_000); // within 7-day registration trial

assert.equal(paidPriorityRank({ tier: "pro_plus", subscriptionStatus: "active", createdAt: old }), R.proPlusPaid);
assert.equal(paidPriorityRank({ tier: "pro", subscriptionStatus: "active", createdAt: old }), R.proPaid);
assert.equal(paidPriorityRank({ tier: "pro", subscriptionStatus: null, createdAt: old }), R.proPaid);
assert.equal(paidPriorityRank({ tier: "pro_plus", subscriptionStatus: "trialing", createdAt: old }), R.proPlusTrial);
assert.equal(paidPriorityRank({ tier: "pro", subscriptionStatus: "trialing", createdAt: old }), R.proTrial);
assert.equal(paidPriorityRank({ tier: "free", subscriptionStatus: "trialing", createdAt: fresh }), R.proTrial);
assert.equal(paidPriorityRank({ tier: "free", subscriptionStatus: null, createdAt: fresh }), R.none, "trial without card = free quota, lowest");
assert.equal(paidPriorityRank({ tier: "free", subscriptionStatus: null, createdAt: old }), R.none);
for (const s of ["past_due", "paused", "canceled"]) assert.equal(paidPriorityRank({ tier: "pro", subscriptionStatus: s, createdAt: old }), R.none);
assert.equal(paidPriorityRank({ tier: "free", email: "antonella.lasalandra07@gmail.com", createdAt: old }), R.proPlusPaid);
assert.equal(paidPriorityRank(null), R.none);
assert.ok(R.proPaid > R.proPlusTrial, "paid outranks trial");

// Cron user loop: paid first, then trial, then free; ties by createdAt asc.
const users = [
  { id: "free1", tier: "free", createdAt: new Date("2025-01-01") },
  { id: "trial", tier: "pro", subscriptionStatus: "trialing", createdAt: new Date("2025-03-01") },
  { id: "pro2", tier: "pro", subscriptionStatus: "active", createdAt: new Date("2025-02-02") },
  { id: "pro1", tier: "pro", subscriptionStatus: "active", createdAt: new Date("2025-02-01") },
  { id: "plus", tier: "pro_plus", subscriptionStatus: "active", createdAt: new Date("2025-06-01") },
  { id: "free0", tier: "free", createdAt: new Date("2024-12-01") },
];
const snapshot = users.map(u => u.id);
assert.deepEqual(sortByPaidPriority(users, u => u, u => u.createdAt).map(u => u.id), ["plus", "pro1", "pro2", "trial", "free0", "free1"]);
assert.deepEqual(users.map(u => u.id), snapshot, "input not mutated");

// Worker dequeue: paid rows behind a free backlog are taken first, then createdAt.
const paid = { tier: "pro", subscriptionStatus: "active", createdAt: old };
const free = { tier: "free", subscriptionStatus: null, createdAt: old };
const t = (m: number) => new Date(Date.UTC(2026, 9, 22, 8, m));
const rows = [
  { id: "f1", createdAt: t(0), user: free }, { id: "f2", createdAt: t(1), user: free }, { id: "f3", createdAt: t(2), user: free },
  { id: "p2", createdAt: t(9), user: paid }, { id: "p1", createdAt: t(5), user: paid }, { id: "p1", createdAt: t(5), user: paid },
];
assert.deepEqual(orderClaimable(rows, 3), ["p1", "p2", "f1"]);
assert.deepEqual(orderClaimable(rows, 10), ["p1", "p2", "f1", "f2", "f3"], "dedup");
assert.deepEqual(orderClaimable([], 3), []);
assert.ok(claimScanWindow(2) >= 100 && claimScanWindow(1000) <= 500);
console.log("paid-priority tests passed");
