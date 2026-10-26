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

function trapReleaseBudgetDb() {
  const hits: string[] = [];
  const trap = (label: string) => new Proxy({}, {
    get(_target, prop) {
      hits.push(`${label}.${String(prop)}`);
      throw new Error(`release-budget query ran: ${label}.${String(prop)}`);
    },
  });
  return {
    hits,
    db: {
      applicationReleaseGrant: trap("applicationReleaseGrant"),
      applicationReleaseBatch: trap("applicationReleaseBatch"),
    },
  };
}

async function testGateUnsetNeverQueriesBudgetTables() {
  const { hits, db } = trapReleaseBudgetDb();
  assert.equal(await tryConsumeRecoveryRelease("any", { db, env: {} }), false);
  assert.equal(await tryConsumeRecoveryRelease("any", { db, env: { APPLICATION_RECOVERY_RELEASE: "off" } }), false);
  assert.equal(await tryConsumeRecoveryRelease("any", { db, env: { APPLICATION_RECOVERY_RELEASE: "on" } }), false);
  assert.equal(await tryConsumeRecoveryRelease("listed", { db, env: { APPLICATION_RECOVERY_RELEASE: "other-id" } }), false);
  assert.deepEqual(hits, [], "unset/off/on-without-ids must not query ApplicationReleaseGrant/Batch");
}

async function testSourceFences() {
  const recovery = readFileSync("src/lib/application-recovery-release.ts", "utf8");
  assert.match(recovery, /ApplicationReleaseGrant/);
  assert.match(recovery, /usedCount < maxCount|usedCount: \{ lt:/);
  assert.doesNotMatch(recovery, /class RecoveryReleaseBudget/);
  assert.match(recovery, /APPLICATION_RECOVERY_RELEASE_CAP` is not a global cap/);
  assert.match(recovery, /gate unset\) never queries those unapplied tables/);
  const gateReturn = recovery.indexOf("if (!cfg.enabled || !cfg.allowIds.has(applicationId)) return false;");
  const grantQuery = recovery.indexOf("tx.applicationReleaseGrant.create");
  assert.ok(gateReturn >= 0 && grantQuery > gateReturn, "table access must be after the allowlist return");
  const migration = readFileSync("prisma/migrations/20261025020000_application_release_budget/migration.sql", "utf8");
  assert.match(migration, /Not applied by this change/);
  assert.match(migration, /ApplicationReleaseBatch/);
  assert.match(migration, /ApplicationReleaseGrant/);
  assert.match(migration, /activation-1/);
  assert.doesNotMatch(migration, /DROP /);
  assert.doesNotMatch(migration, /ALTER TABLE "Application"/);

  const { readdirSync } = await import("node:fs");
  const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = `${dir}/${entry.name}`;
    return entry.isDirectory() ? walk(path) : [path];
  });
  const srcFiles = walk("src").filter((path) => path.endsWith(".ts") || path.endsWith(".tsx"));
  const tableFiles = srcFiles.filter((path) => {
    const text = readFileSync(path, "utf8");
    return /applicationReleaseGrant|applicationReleaseBatch|ApplicationReleaseGrant|ApplicationReleaseBatch/.test(text);
  });
  assert.deepEqual(tableFiles, ["src/app/api/admin/customer-rollout/route.ts", "src/lib/application-recovery-release.ts", "src/lib/customer-rollout-readiness.ts", "src/lib/customer-rollout.ts"], "only gated release helpers and read-only admin status may name release tables");

  const callSites = [
    ["src/lib/queue-drain.ts", 1],
    ["src/lib/application-claim.ts", 2],
    ["src/lib/application-worker-gates.ts", 1],
    ["src/lib/held-application-release.ts", 1],
  ] as const;
  for (const [file, count] of callSites) {
    const text = readFileSync(file, "utf8");
    assert.equal((text.match(/await tryConsumeRecoveryRelease\(/g) ?? []).length, count, `${file} must retain every awaited release gate`);
    assert.doesNotMatch(text, /applicationReleaseGrant|applicationReleaseBatch/);
  }

  for (const file of [
    "src/lib/email-test-capability.ts",
    "src/app/api/admin/email-test-send/route.ts",
    "src/app/api/cron/nudges/route.ts",
    "src/app/api/cron/mailbox-delivery/route.ts",
    "src/app/api/cron/mailbox-digest/route.ts",
    "src/app/api/cron/mailbox-retention/route.ts",
    "worker.ts",
    "vercel.json",
  ]) {
    const text = readFileSync(file, "utf8");
    assert.doesNotMatch(text, /applicationReleaseGrant|applicationReleaseBatch|ApplicationReleaseGrant|ApplicationReleaseBatch/);
  }
  assert.match(readFileSync("vercel.json", "utf8"), /prisma generate && next build/);
  assert.doesNotMatch(readFileSync("vercel.json", "utf8"), /migrate/);
}

async function main() {
  await testUniqueGrantNeverTwice();
  await testConcurrentSameId();
  await testConcurrentDrainsHonorBudget();
  await testTwoFakeDrainProcessesShareBudget();
  await testGateUnsetNeverQueriesBudgetTables();
  await testSourceFences();
  console.log("PASS application release budget: unique per-id grant, atomic global cap of 5, gate unset never queries tables");
}

main().catch((error) => { console.error(error); process.exit(1); });
