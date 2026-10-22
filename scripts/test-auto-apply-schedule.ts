import assert from "node:assert/strict";
import { requiresPaymentMethodBeforeApp, isApplicationAccessPaused } from "../src/lib/billing";
import { createAutoApplyTick, parseAutoApplyHours } from "../src/lib/auto-apply-schedule";

async function main() {
  const trial = { email: "fixture@example.invalid", tier: "free", createdAt: new Date(), subscriptionStatus: "trialing" };
  assert.equal(requiresPaymentMethodBeforeApp(trial), false);
  assert.equal(requiresPaymentMethodBeforeApp({ ...trial, subscriptionStatus: undefined }), true, "omitting subscription status wrongly blocks a valid trial");
  assert.equal(isApplicationAccessPaused({ ...trial, createdAt: new Date("2026-10-01T00:00:00Z"), subscriptionStatus: "canceled" }), true);
  assert.deepEqual(parseAutoApplyHours(), [8, 12, 16]);
  assert.deepEqual(parseAutoApplyHours("16, 8,8"), [8, 16]);
  for (const bad of ["", "8,", "24", "8,no", "-1", "8.5"]) assert.deepEqual(parseAutoApplyHours(bad), []);
  let now = new Date("2026-10-22T08:37:00Z");
  let blocked = true, runs = 0;
  let release!: () => void;
  const tick = createAutoApplyTick({ hours: [8, 12, 16], now: () => now, blocked: () => blocked,
    run: async () => { runs++; await new Promise<void>(resolve => { release = resolve; }); } });
  await tick(); assert.equal(runs, 0, "paused/manual-only never starts work or consumes slot");
  blocked = false;
  const first = tick(); assert.equal(runs, 1, "late startup in scheduled hour works");
  await tick(); assert.equal(runs, 1, "overlapping tick cannot overlap run");
  release(); await first; await tick(); assert.equal(runs, 1, "same hour is not replayed");
  now = new Date("2026-10-22T11:00:00Z"); await tick(); assert.equal(runs, 1, "no catch-up outside scheduled hour");
  now = new Date("2026-10-22T12:59:00Z"); const next = tick(); assert.equal(runs, 2); release(); await next;
  now = new Date("2026-10-23T08:00:00Z"); const day = tick(); assert.equal(runs, 3); release(); await day;
  let failedRuns = 0;
  const failed = createAutoApplyTick({ hours: [8], now: () => now, blocked: () => false,
    run: async () => { failedRuns++; throw Error("uncertain outcome"); } });
  await assert.rejects(failed(), /uncertain/); await failed(); assert.equal(failedRuns, 1);
  console.log("PASS scheduler: late startup, UTC boundaries, pause, malformed hours, overlapping ticks, no uncertain replay");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
