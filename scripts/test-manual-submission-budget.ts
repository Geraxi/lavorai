import assert from "node:assert/strict";
import { applicationRolloutConfig, rolloutApplicationIneligibility, ROLLOUT_BUDGET_HELD_MESSAGE } from "../src/lib/application-rollout";
import { applicationDeliveryView } from "../src/lib/application-delivery-view";

const now = new Date("2026-10-14T12:00:00.000Z");
const start = "2026-10-14T10:00:00.000Z";
const valid = () => Object.assign(process.env, { APPLICATION_ROLLOUT_MODE: "manual_only", APPLICATION_ROLLOUT_START_AT: start, APPLICATION_ROLLOUT_DAILY_CAP: "10" });
valid(); assert.equal(applicationRolloutConfig(now).enabled, true);
for (const key of ["APPLICATION_ROLLOUT_MODE", "APPLICATION_ROLLOUT_START_AT", "APPLICATION_ROLLOUT_DAILY_CAP"]) {
  valid(); delete process.env[key]; assert.equal(applicationRolloutConfig(now).enabled, false);
}
for (const cap of ["0", "-1", "11", "100", "1.5", "NaN", "Infinity", " 10", "10 ", "01", ""]) {
  valid(); process.env.APPLICATION_ROLLOUT_DAILY_CAP = cap; assert.equal(applicationRolloutConfig(now).enabled, false, cap);
}
for (const date of ["2026-10-14", "2026-10-14T10:00:00+00:00", "2026-02-30T10:00:00Z", "bad", "2026-10-14T12:00:00Z", "2026-10-15T00:00:00Z"]) {
  valid(); process.env.APPLICATION_ROLLOUT_START_AT = date; assert.equal(applicationRolloutConfig(now).enabled, false, date);
}
valid();
const row = { createdAt: new Date("2026-10-14T11:00:00Z"), consentGrantedAt: new Date("2026-10-14T11:01:00Z"), retryCount: 0 };
assert.equal(rolloutApplicationIneligibility(row, now), null);
assert.equal(rolloutApplicationIneligibility({ ...row, createdAt: new Date(start) }, now), "rollout_historical_application");
assert.equal(rolloutApplicationIneligibility({ ...row, createdAt: new Date("2026-01-01Z") }, now), "rollout_historical_application", "Fresh consent cannot revive old applications");
assert.equal(rolloutApplicationIneligibility({ ...row, consentGrantedAt: null }, now), "rollout_explicit_consent_required");
assert.equal(rolloutApplicationIneligibility({ ...row, consentGrantedAt: new Date(start) }, now), "rollout_explicit_consent_required");
assert.equal(rolloutApplicationIneligibility({ ...row, consentGrantedAt: new Date(+now + 1) }, now), "rollout_explicit_consent_required");
assert.equal(rolloutApplicationIneligibility({ ...row, retryCount: 1 }, now), "rollout_retry_blocked");
const held = applicationDeliveryView({ status: "ready_to_apply", submittedVia: null, submitConfirmation: "NOT_SUBMITTED", errorMessage: ROLLOUT_BUDGET_HELD_MESSAGE });
assert.equal(held.phase, "pending"); assert.equal(held.label, "In attesa: limite giornaliero");
assert.match(held.detail, /non inviata/); assert.match(held.detail, /Nessun nuovo tentativo automatico/);
console.log("PASS manual rollout: explicit configuration, approved maximum, strict new-created and consent cutoff, future/invalid inputs and retry rejection.");
