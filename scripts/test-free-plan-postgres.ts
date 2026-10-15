import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

async function main() {
  const url = process.env.FREE_PLAN_TEST_DATABASE_URL;
  assert(url, "Set FREE_PLAN_TEST_DATABASE_URL to a dedicated localhost lavorai_free_plan_test database");
  const target = new URL(url);
  assert(["127.0.0.1", "localhost"].includes(target.hostname));
  assert.equal(target.pathname, "/lavorai_free_plan_test");
  process.env.DATABASE_URL = url;
  process.env.DIRECT_URL = url;
  process.env.APPLICATIONS_PAUSED = "false";
  process.env.APPLICATION_ROLLOUT_MODE = "manual_only";
  process.env.APPLICATION_ROLLOUT_START_AT = new Date(Date.now() - 60000).toISOString();
  process.env.APPLICATION_ROLLOUT_DAILY_CAP = "10";
  const { prisma: db } = await import("../src/lib/db");
  const { reserveApplicationWork: reserve, beginApplicationSubmission: begin, completeApplicationSubmission: complete } = await import("../src/lib/application-worker-gates");
  // Exercise the exact additive SQL against a populated pre-change shape in
  // a transaction-local schema. Public test tables remain untouched.
  await db.$transaction(async tx => {
    await tx.$executeRawUnsafe('CREATE SCHEMA free_plan_migration_fixture');
    await tx.$executeRawUnsafe('SET LOCAL search_path TO free_plan_migration_fixture');
    for (const sql of [
      `CREATE TABLE "User" (id TEXT PRIMARY KEY, tier TEXT DEFAULT 'free', "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, "trialEndsAt" TIMESTAMP, "trialDurationDays" INT NOT NULL DEFAULT 7, "stripeSubscriptionId" TEXT)`,
      `CREATE TABLE "Job" (id TEXT PRIMARY KEY)`,
      `CREATE TABLE "Application" (id TEXT PRIMARY KEY, "userId" TEXT, status TEXT, "submittedAt" TIMESTAMP, "submittedVia" TEXT)`,
      `INSERT INTO "User" (id, "trialEndsAt", "stripeSubscriptionId") VALUES ('stored', '2099-01-01', 'sub_existing')`,
      `INSERT INTO "User" (id) VALUES ('implicit')`,
      `INSERT INTO "Application" (id,"userId",status,"submittedAt","submittedVia") VALUES
        ('sent','stored','success',CURRENT_TIMESTAMP,'email_recruiter'),
        ('failed','stored','failed',NULL,NULL), ('queued','stored','queued',NULL,NULL),
        ('manual','stored','success',CURRENT_TIMESTAMP,'manual'), ('mock','stored','success',CURRENT_TIMESTAMP,'mock_demo')`,
    ]) await tx.$executeRawUnsafe(sql);
    const migration = readFileSync("prisma/migrations/20261015170000_card_required_free_plan/migration.sql", "utf8");
    for (const sql of migration.split(/;\s*(?:\n|$)/).filter(s => s.trim())) await tx.$executeRawUnsafe(sql);
    const stored = await tx.$queryRawUnsafe<any[]>(`SELECT * FROM "User" WHERE id='stored'`);
    assert.equal(stored[0].freeApplicationsUsed, 1, "Migration counts only submitted historical applications");
    assert.equal(stored[0].trialEndsAt.toISOString(), "2099-01-01T00:00:00.000Z");
    assert.equal(stored[0].stripeSubscriptionId, "sub_existing");
    const implicit = await tx.$queryRawUnsafe<any[]>(`SELECT EXTRACT(EPOCH FROM ("trialEndsAt" - "createdAt"))::int AS duration FROM "User" WHERE id='implicit'`);
    assert.equal(implicit[0].duration, 604800, "Pre-rollout implicit trial is frozen, never discarded");
    await tx.$executeRawUnsafe(`INSERT INTO "User" (id) VALUES ('new-free')`);
    const fresh = await tx.$queryRawUnsafe<any[]>(`SELECT * FROM "User" WHERE id='new-free'`);
    assert.equal(fresh[0].trialEndsAt, null); assert.equal(fresh[0].trialDurationDays, 0);
    await tx.$executeRawUnsafe('DROP SCHEMA free_plan_migration_fixture CASCADE');
  });
  console.log("PASS additive migration: real historical usage backfill, existing subscriptions/deadlines and implicit trials preserved; new accounts have no trial");
  const prefix = `free-test-${Date.now()}`;
  let userId: string | undefined;
  const applicationIds: string[] = [];
  try {
    const now = new Date();
    const user = await db.user.create({ data: { email: `${prefix}@example.invalid`, cardSetupAt: now,
      emailVerified: now, privacyConsentAt: now, preferences: { create: { autoApplyMode: "manual" } } } });
    userId = user.id;
    const apps: import("@prisma/client").Application[] = [];
    for (let i = 0; i < 10; i++) {
      const job = await db.job.create({ data: { externalId: `${prefix}-${i}`, source: "synthetic-free-test", title: "Synthetic", description: "Synthetic", url: `https://boards.greenhouse.io/acme/jobs/${i}` } });
      apps.push(await db.application.create({ data: { userId: user.id, jobId: job.id, portal: "other", status: "queued", consentGrantedAt: now,
        previewApprovedAt: now, previewResultJson: "{}" } }));
    }
    applicationIds.push(...apps.map(app => app.id));
    const tokens = await Promise.all(apps.map(app => reserve(app.id)));
    assert(tokens.every(Boolean));
    // Mixed channels share exactly five lifetime slots, even across a batch.
    const channels = apps.map((_, i) => i % 2 ? "portal_greenhouse" : "email_recruiter");
    const began = await Promise.all(apps.map((app, i) => begin(app.id, tokens[i]!, undefined, channels[i])));
    assert.equal(began.filter(Boolean).length, 5);
    assert.equal((await db.user.findUniqueOrThrow({ where: { id: user.id } })).freeApplicationsUsed, 0, "Preparation/in-flight attempts never consume lifetime credits");
    const winners = began.flatMap((ok, i) => ok ? [i] : []);
    const failed = winners.shift()!;
    await db.application.update({ where: { id: apps[failed].id }, data: { status: "failed", submitConfirmation: "NOT_SUBMITTED" } });
    const replacement = began.indexOf(false);
    const row = await db.application.findUniqueOrThrow({ where: { id: apps[replacement].id } });
    // A quota hold preserves ready material; simulate a fresh explicit approval.
    await db.application.update({ where: { id: row.id }, data: { status: "ready_to_apply", startedAt: tokens[replacement]!, submitConfirmation: null } });
    assert(await begin(row.id, tokens[replacement]!, undefined, channels[replacement]), "Proved failed sends release capacity");
    winners.push(replacement);
    for (const i of winners) {
      const app: import("@prisma/client").Application = apps[i];
      const token = tokens[i]!;
      // Use a recorded email acceptance proof for deterministic local completion.
      if (channels[i] !== "email_recruiter") {
        await db.applicationSubmissionReservation.updateMany({ where: { applicationId: app.id }, data: { channel: "email_recruiter" } });
      }
      await db.applicationEmailAttempt.create({ data: { applicationId: app.id, attemptKey: `application-${app.id}-${token.getTime()}`,
        recipient: "synthetic@example.invalid", providerEmailId: `${prefix}-${i}`, acceptedAt: new Date(), status: "accepted" } });
      const result = { submittedVia: "email_recruiter", submittedAt: new Date(), submitConfirmation: "EMAIL_SENT", completedAt: new Date() };
      const completions: boolean[] = await Promise.all([complete(app.id, token, result), complete(app.id, token, result)]);
      assert.equal(completions.filter(Boolean).length, 1, "Duplicate completions consume once");
    }
    assert.equal((await db.user.findUniqueOrThrow({ where: { id: user.id } })).freeApplicationsUsed, 5);
    const remaining = apps.find((_, i) => !began[i] && i !== replacement)!;
    await db.application.update({ where: { id: remaining.id }, data: { status: "ready_to_apply", startedAt: now, submitConfirmation: null } });
    assert.equal(await begin(remaining.id, now, undefined, "email_recruiter"), false, "Sixth send blocked");
    await db.application.delete({ where: { id: apps[winners[0]].id } });
    await db.user.update({ where: { id: user.id }, data: { quotaResetAt: new Date() } });
    assert.equal(await begin(remaining.id, now, undefined, "email_recruiter"), false, "Deletion/monthly reset never refunds lifetime usage");
    // A stored historical trial retains Pro access and does not spend Free usage.
    await db.user.update({ where: { id: user.id }, data: { trialEndsAt: new Date(Date.now() + 86400000), subscriptionStatus: "trialing" } });
    await db.application.update({ where: { id: remaining.id }, data: { status: "ready_to_apply", startedAt: now, submitConfirmation: null } });
    assert(await begin(remaining.id, now, undefined, "email_recruiter"));
    console.log("PASS PostgreSQL Free lifetime quota: concurrent mixed channels, failed sends, idempotent completion, sixth-send wall, deletion/reset resistance and preserved existing trials");
  } finally {
    if (userId) await db.user.delete({ where: { id: userId } });
    await db.job.deleteMany({ where: { externalId: { startsWith: prefix } } });
    // The existing global safety ledger intentionally survives deletion. Clean
    // only this dedicated database's synthetic scope for repeatable local tests.
    await db.applicationSubmissionReservation.deleteMany({ where: { applicationId: { in: applicationIds } } });
    await db.$disconnect();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
