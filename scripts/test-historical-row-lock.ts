/**
 * Pre-cutoff historical rows (including unproven sends) are user-action
 * states. Nothing automatically restarts document generation or sending.
 * historicalRetriesBlocked stays true. Fakes only.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  DEFAULT_HISTORICAL_CUTOFF,
  historicalRetriesBlocked,
  rolloutApplicationIneligibility,
} from "../src/lib/application-rollout";
import { blocksUncertainAutoRetry } from "../src/lib/uncertain-submission";

assert.equal(historicalRetriesBlocked(), true, "historical replay stays disabled");

const cutoff = new Date(DEFAULT_HISTORICAL_CUTOFF);
const historical = {
  createdAt: new Date(+cutoff - 60_000),
  consentGrantedAt: new Date(+cutoff + 60_000),
  retryCount: 0,
};
const now = new Date(+cutoff + 3_600_000);
assert.equal(rolloutApplicationIneligibility(historical, now), "rollout_historical_application");

const unproven = {
  createdAt: new Date(+cutoff - 86_400_000),
  consentGrantedAt: null,
  submitConfirmation: "UNCONFIRMED",
  submissionReceiptJson: null,
  submittedAt: null,
};
assert.equal(rolloutApplicationIneligibility(unproven, now), "rollout_historical_application");
assert.equal(blocksUncertainAutoRetry(unproven), true);

const PATHS: Array<{ file: string; needle: RegExp; note: string }> = [
  { file: "src/lib/application-claim.ts", needle: /historicalRetriesBlocked|rolloutApplicationIneligibility/, note: "claim/recovery" },
  { file: "src/lib/application-worker-gates.ts", needle: /rolloutApplicationIneligibility/, note: "reserve / begin / recheck" },
  { file: "src/lib/application-worker.ts", needle: /reserveApplicationWork\(applicationId\)/, note: "worker documents only after reserve" },
  { file: "src/lib/queue-drain.ts", needle: /claimApplication|findClaimableQueued|processApplication/, note: "drain uses claim+worker" },
  { file: "src/lib/auto-apply-cron.ts", needle: /automaticApplicationsBlocked/, note: "auto-apply producer creates only new rows" },
  { file: "src/lib/cron-self-heal.ts", needle: /recoverStuckApplications|historicalRetriesBlocked/, note: "self-heal recovery" },
  { file: "src/lib/auto-apply-self-heal.ts", needle: /historicalRetriesBlocked/, note: "transient/credit retries" },
  { file: "src/lib/credit-failure-retry.ts", needle: /historicalRetriesBlocked/, note: "credit retry" },
  { file: "src/lib/held-application-release.ts", needle: /createdAt: \{ gt: cutoff/, note: "held release excludes pre-cutoff" },
  { file: "src/lib/trial-quota.ts", needle: /historicalRetriesBlocked/, note: "trial quota replay" },
  { file: "src/app/api/admin/retry-captcha/route.ts", needle: /historicalRetriesBlocked/, note: "admin captcha retry" },
  { file: "src/app/api/admin/requeue-stuck/route.ts", needle: /historicalRetriesBlocked/, note: "admin requeue" },
  { file: "src/app/api/admin/retry-credit-failures/route.ts", needle: /historicalRetriesBlocked/, note: "admin credit retry" },
];

for (const path of PATHS) {
  const source = readFileSync(path.file, "utf8");
  assert.match(source, path.needle, `${path.file} must fence historical rows (${path.note})`);
}

const worker = readFileSync("src/lib/application-worker.ts", "utf8");
assert.ok(
  worker.indexOf("reserveApplicationWork(applicationId)") < worker.indexOf("await optimizeCV("),
  "Document generation cannot run before admission, which rejects historical rows",
);
assert.ok(
  worker.indexOf("reserveApplicationWork(applicationId)") < worker.indexOf("generateOptimizedCVDocx({"),
  "CV DOCX generation cannot run for a row admission refused",
);
assert.doesNotMatch(
  readFileSync("src/lib/held-application-release.ts", "utf8"),
  /optimizeCV|generateOptimizedCVDocx|deliverApplicationToRecruiter/,
);

const claim = readFileSync("src/lib/application-claim.ts", "utf8");
assert.match(claim, /if \(!historicalRetriesBlocked\(\)\) recovered \+= await recoverStuckInFlight/);
assert.match(claim, /createdAt: \{ gt: config\.startedAt/);

console.log("PASS historical row lock: pre-cutoff / unproven rows are never auto-sent or regenerated");
