/** Env caps for the daily onboarding/upgrade nudges. No DB, no email. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { lifecycleNudgeCaps } from "../src/lib/lifecycle-nudge-caps";

assert.deepEqual(lifecycleNudgeCaps({}), { onboarding: undefined, upgrade: undefined }, "unset keeps the existing defaults");
assert.deepEqual(lifecycleNudgeCaps({ ONBOARDING_NUDGE_DAILY_CAP: "20", UPGRADE_NUDGE_DAILY_CAP: " 20 " }), { onboarding: 20, upgrade: 20 });
assert.deepEqual(lifecycleNudgeCaps({ ONBOARDING_NUDGE_DAILY_CAP: "0", UPGRADE_NUDGE_DAILY_CAP: "" }), { onboarding: 0, upgrade: undefined }, "0 disables, empty = default");
for (const bad of ["-5", "abc", "1.5", "20x", "1e3"]) {
  assert.deepEqual(lifecycleNudgeCaps({ ONBOARDING_NUDGE_DAILY_CAP: bad }).onboarding, undefined, `invalid ${bad} keeps the default`);
}
const route = readFileSync("src/app/api/cron/nudges/route.ts", "utf8");
assert.match(route, /runOnboardingNudges\(\{ cap: caps\.onboarding \}\)/, "daily cron passes the onboarding cap");
assert.match(route, /runUpgradeNudges\(\{ cap: caps\.upgrade \}\)/, "daily cron passes the upgrade cap");
console.log("PASS lifecycle nudge caps: env-configurable, defaults unchanged when unset, invalid values ignored");
