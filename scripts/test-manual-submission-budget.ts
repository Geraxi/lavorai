import assert from "node:assert/strict";
import {
  applicationRolloutConfig, automaticApplicationsBlocked, historicalRetriesBlocked, rolloutApplicationIneligibility,
  ROLLOUT_BUDGET_HELD_MESSAGE, DEFAULT_GLOBAL_DAILY_CAP, DEFAULT_HISTORICAL_CUTOFF,
} from "../src/lib/application-rollout";
import { applicationDeliveryView } from "../src/lib/application-delivery-view";

const now = new Date(Date.UTC(2026, 9, 14, 12, 0, 0));
const start = new Date(Date.UTC(2026, 9, 14, 10, 0, 0)).toISOString();
const KEYS = ["APPLICATION_SENDING_MODE", "APPLICATION_ROLLOUT_START_AT", "APPLY_GLOBAL_DAILY_CAP",
  "APPLICATION_ROLLOUT_MODE", "APPLICATION_ROLLOUT_DAILY_CAP"];
const reset = (env: Record<string, string> = {}) => { for (const key of KEYS) delete process.env[key]; Object.assign(process.env, env); };
const manual = () => reset({ APPLICATION_SENDING_MODE: "manual_only", APPLICATION_ROLLOUT_START_AT: start, APPLY_GLOBAL_DAILY_CAP: "10" });
const automatic = () => reset({ APPLICATION_ROLLOUT_START_AT: start });

// Defaults: no env at all => automatic sending, default cap, Oct 14 cutoff.
reset();
const later = new Date(Date.UTC(2026, 9, 20));
const defaults = applicationRolloutConfig(later);
assert.equal(defaults.enabled, true); assert.equal(defaults.mode, "automatic");
assert.equal(defaults.dailyCap, DEFAULT_GLOBAL_DAILY_CAP); assert.equal(DEFAULT_GLOBAL_DAILY_CAP, 300);
assert.equal(defaults.startedAt!.toISOString(), DEFAULT_HISTORICAL_CUTOFF);
assert.equal(automaticApplicationsBlocked(), false, "automatic producers run without new env vars");
assert.equal(historicalRetriesBlocked(), true, "historical replay/retry paths stay suspended");

// The production env of the manual-only release no longer holds sending.
reset({ APPLICATION_ROLLOUT_MODE: "manual_only", APPLICATION_ROLLOUT_START_AT: start, APPLICATION_ROLLOUT_DAILY_CAP: "10" });
const legacy = applicationRolloutConfig(now);
assert.equal(legacy.enabled, true); assert.equal(legacy.mode, "automatic");
assert.equal(legacy.dailyCap, 300, "legacy 10/day cap is not applied");
assert.equal(legacy.startedAt!.toISOString(), start, "legacy start timestamp stays the historical cutoff");

// Configurable global cap.
automatic(); process.env.APPLY_GLOBAL_DAILY_CAP = "500"; assert.equal(applicationRolloutConfig(now).dailyCap, 500);
automatic(); process.env.APPLY_GLOBAL_DAILY_CAP = "1"; assert.equal(applicationRolloutConfig(now).dailyCap, 1);
automatic(); process.env.APPLY_GLOBAL_DAILY_CAP = ""; assert.equal(applicationRolloutConfig(now).dailyCap, 300);
for (const cap of ["0", "-1", "1.5", "NaN", "Infinity", " 10", "10 ", "01", "5001", "100000", "abc"]) {
  automatic(); process.env.APPLY_GLOBAL_DAILY_CAP = cap;
  assert.equal(applicationRolloutConfig(now).enabled, false, cap); assert.equal(applicationRolloutConfig(now).reason, "global_cap_invalid");
}
// Invalid mode / cutoff values fail closed; a future cutoff is not started.
for (const mode of ["auto", "manual", "off", "MANUAL_ONLY"]) {
  automatic(); process.env.APPLICATION_SENDING_MODE = mode;
  assert.equal(applicationRolloutConfig(now).enabled, false, mode);
}
for (const date of ["2026-10-14", "2026-02-30T10:00:00Z", "bad", now.toISOString(), new Date(+now + 3_600_000).toISOString()]) {
  automatic(); process.env.APPLICATION_ROLLOUT_START_AT = date; assert.equal(applicationRolloutConfig(now).enabled, false, date);
}

// Manual-only kill switch keeps the Oct 14 semantics.
manual();
const manualConfig = applicationRolloutConfig(now);
assert.equal(manualConfig.enabled, true); assert.equal(manualConfig.mode, "manual_only"); assert.equal(manualConfig.dailyCap, 10);
const row = { createdAt: new Date(Date.UTC(2026, 9, 14, 11, 0)), consentGrantedAt: new Date(Date.UTC(2026, 9, 14, 11, 1)), retryCount: 0 };
assert.equal(rolloutApplicationIneligibility(row, now), null);
assert.equal(rolloutApplicationIneligibility({ ...row, createdAt: new Date(start) }, now), "rollout_historical_application");
assert.equal(rolloutApplicationIneligibility({ ...row, createdAt: new Date("2026-01-01T00:00:00Z") }, now), "rollout_historical_application", "Fresh consent cannot revive old applications");
assert.equal(rolloutApplicationIneligibility({ ...row, consentGrantedAt: null }, now), "rollout_explicit_consent_required");
assert.equal(rolloutApplicationIneligibility({ ...row, consentGrantedAt: new Date(start) }, now), "rollout_explicit_consent_required");
assert.equal(rolloutApplicationIneligibility({ ...row, consentGrantedAt: new Date(+now + 1) }, now), "rollout_explicit_consent_required");
assert.equal(rolloutApplicationIneligibility({ ...row, retryCount: 1 }, now), null, "fresh rows may retry under the drain attempt cap");
assert.equal(rolloutApplicationIneligibility({ ...row, retryCount: 3 }, now), "rollout_retry_blocked");

// Automatic mode: auto rows without per-application consent are admitted
// (the worker gate still requires the user's saved mode to be "auto");
// historical rows, stale consents and retries stay blocked.
automatic();
assert.equal(rolloutApplicationIneligibility(row, now), null);
assert.equal(rolloutApplicationIneligibility({ ...row, consentGrantedAt: null }, now), null);
assert.equal(rolloutApplicationIneligibility({ ...row, consentGrantedAt: new Date(start) }, now), "rollout_explicit_consent_required");
assert.equal(rolloutApplicationIneligibility({ ...row, createdAt: new Date("2026-01-01T00:00:00Z"), consentGrantedAt: null }, now), "rollout_historical_application");
assert.equal(rolloutApplicationIneligibility({ ...row, consentGrantedAt: null, retryCount: 1 }, now), null);
assert.equal(rolloutApplicationIneligibility({ ...row, consentGrantedAt: null, retryCount: 3 }, now), "rollout_retry_blocked");
assert.equal(rolloutApplicationIneligibility({ ...row, createdAt: new Date(+now + 1), consentGrantedAt: null }, now), "rollout_historical_application");

const held = applicationDeliveryView({ status: "ready_to_apply", submittedVia: null, submitConfirmation: "NOT_SUBMITTED", errorMessage: ROLLOUT_BUDGET_HELD_MESSAGE });
assert.equal(held.phase, "pending"); assert.equal(held.label, "In attesa: limite giornaliero");
assert.match(held.detail, /non inviata/); assert.match(held.detail, /Nessun nuovo tentativo automatico/);
reset();
console.log("PASS sending policy: automatic by default with env-configurable global cap (default 300), legacy manual-only env ignored, manual_only kill switch, historical cutoff, consent/retry rules, fail-closed invalid inputs.");
