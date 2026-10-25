/**
 * First-activation budget lives in the shared grant + batch tables, not
 * process memory. Concurrent drains cannot exceed the allowlist or the
 * global usedCount, and a released id is never granted twice.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  ACTIVATION_RELEASE_MAX,
  attachMemoryRelease,
  createMemoryReleaseDb,
  recoveryReleaseAllowlist,
  tryConsumeRecoveryRelease,
} from "../src/lib/application-recovery-release";

const env = { APPLICATION_RECOVERY_RELEASE: "a,b,c,d,e" };

assert.equal(ACTIVATION_RELEASE_MAX, 5);
assert.equal(recoveryReleaseAllowlist({ APPLICATION_RECOVERY_RELEASE: "on" }).enabled, false);
assert.equal(recoveryReleaseAllowlist({ APPLICATION_RECOVERY_RELEASE: "a,b,c,d,e,f" }).enabled, false);
assert.equal(recoveryReleaseAllowlist(env).enabled, true);
assert.equal(recoveryReleaseAllowlist(env).allowIds.size, 5);

async function testUniqueGrantNeverTwice() {
  const db = createMemoryReleaseDb();
  assert.equal(await tryConsumeRecoveryRelease("a", { db, env }), true);
  assert.equal(await tryConsumeRecoveryRelease("a", { db, env }), false);
  assert.equal(db.usedCount, 1);
  assert.deepEqual([...db.grants], ["a"]);
}

async function testConcurrentSameId() {
  const db = createMemoryReleaseDb();
  const results = await Promise.all([
    tryConsumeRecoveryRelease("a", { db, env }),
    tryConsumeRecoveryRelease("a", { db, env }),
    tryConsumeRecoveryRelease("a", { db, env }),
  ]);
  assert.equal(results.filter(Boolean).length, 1);
  assert.equal(db.usedCount, 1);
  assert.equal(db.grants.size, 1);
}

async function testConcurrentDrainsHonorBudget() {
  const db = createMemoryReleaseDb();
  const ids = ["a", "b", "c", "d", "e", "extra-1", "extra-2"];
  const results = await Promise.all(ids.map((id) => tryConsumeRecoveryRelease(id, { db, env })));
  assert.equal(results.filter(Boolean).length, 5, "allowlist/budget is 5");
  assert.equal(db.usedCount, 5);
  assert.equal(db.grants.size, 5);
  assert.equal(await tryConsumeRecoveryRelease("a", { db, env }), false);
  assert.equal(await tryConsumeRecoveryRelease("b", { db, env }), false);
}

async function testTwoFakeDrainProcessesShareBudget() {
  const shared = createMemoryReleaseDb();
  const drainA = attachMemoryRelease({ application: {} }, 5);
  const drainB = attachMemoryRelease({ application: {} }, 5);
  // Two process-local tables would each allow 5. The test stand-in for
  // concurrent Vercel + GitHub Actions is one shared memory DB.
  const vercel = await Promise.all(["a", "b", "c"].map((id) => tryConsumeRecoveryRelease(id, { db: shared, env })));
  const actions = await Promise.all(["c", "d", "e", "a"].map((id) => tryConsumeRecoveryRelease(id, { db: shared, env })));
  assert.equal(vercel.filter(Boolean).length + actions.filter(Boolean).length, 5);
  assert.equal(shared.usedCount, 5);
  assert.equal(shared.grants.size, 5);
  assert.equal(drainA.usedCount, 0, "unshared process memory is not the budget");
  assert.equal(drainB.usedCount, 0);
}

async function testSourceFences() {
  const recovery = readFileSync("src/lib/application-recovery-release.ts", "utf8");
  assert.match(recovery, /ApplicationReleaseGrant/);
  assert.match(recovery, /usedCount < maxCount|usedCount: \{ lt:/);
  assert.doesNotMatch(recovery, /class RecoveryReleaseBudget/);
  assert.match(recovery, /APPLICATION_RECOVERY_RELEASE_CAP` is not a global cap/);
  const migration = readFileSync("prisma/migrations/20261025020000_application_release_budget/migration.sql", "utf8");
  assert.match(migration, /Not applied by this change/);
  assert.match(migration, /ApplicationReleaseBatch/);
  assert.match(migration, /ApplicationReleaseGrant/);
  assert.match(migration, /activation-1/);
  assert.doesNotMatch(migration, /DROP /);
  assert.doesNotMatch(migration, /ALTER TABLE "Application"/);
}

async function main() {
  await testUniqueGrantNeverTwice();
  await testConcurrentSameId();
  await testConcurrentDrainsHonorBudget();
  await testTwoFakeDrainProcessesShareBudget();
  await testSourceFences();
  console.log("PASS application release budget: unique per-id grant, atomic global cap of 5, no in-memory RecoveryReleaseBudget");
}

main().catch((error) => { console.error(error); process.exit(1); });
