import assert from "node:assert/strict";
import { isCheckoutRecoveryWindow, trialLifecycleStage } from "../src/lib/lifecycle-cadence";

const day = 86_400_000;
const start = new Date("2026-01-01T09:00:00.000Z");
const end = new Date(start.getTime() + 7 * day);

assert.equal(trialLifecycleStage({ now: start.getTime() + 2 * day, createdAt: start, trialEndsAt: end }), null);
assert.equal(trialLifecycleStage({ now: start.getTime() + 3 * day, createdAt: start, trialEndsAt: end }), "day_3");
assert.equal(trialLifecycleStage({ now: start.getTime() + 5 * day + 2 * 3_600_000, createdAt: start, trialEndsAt: end }), "day_6");
assert.equal(trialLifecycleStage({ now: end.getTime() + 1, createdAt: start, trialEndsAt: end }), "ended");
assert.equal(trialLifecycleStage({ now: end.getTime() + 4 * day, createdAt: start, trialEndsAt: end }), null);

const now = Date.parse("2026-01-10T12:00:00.000Z");
assert.equal(isCheckoutRecoveryWindow(new Date(now - 90 * 60_000), now), false);
assert.equal(isCheckoutRecoveryWindow(new Date(now - 3 * 3_600_000), now), true);
assert.equal(isCheckoutRecoveryWindow(new Date(now - 73 * 3_600_000), now), false);

console.log("Growth lifecycle cadence checks passed.");
