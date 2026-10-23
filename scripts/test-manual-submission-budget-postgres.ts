import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { Prisma } from "@prisma/client";

async function main() {
  // Never use an ambient production URL or provider. This creates and destroys
  // only its own disposable localhost database, containing synthetic fixtures.
  const port = 55455;
  const fixtureUrl = process.env.MANUAL_ROLLOUT_TEST_DATABASE_URL;
  if (fixtureUrl) {
    const target = new URL(fixtureUrl);
    assert.ok(["postgres:", "postgresql:"].includes(target.protocol));
    assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(target.hostname), "Fixture database must be localhost");
    assert.match(target.pathname, /^\/lavorai_manual_rollout_test(?:_[a-z0-9]+)?$/, "A dedicated fixture database name is required");
  }
  process.env.DATABASE_URL = fixtureUrl ?? `postgresql://postgres:password@127.0.0.1:${port}/postgres?connection_limit=24`;
  process.env.DIRECT_URL = process.env.DATABASE_URL;
  process.env.APPLICATIONS_PAUSED = "false";
  process.env.APPLICATION_SENDING_MODE = "manual_only";
  process.env.APPLICATION_ROLLOUT_START_AT = new Date(Date.now() - 86400000).toISOString();
  process.env.APPLY_GLOBAL_DAILY_CAP = "10";
  const dir = await mkdtemp(join(tmpdir(), "lavorai-rollout-postgres-"));
  let pg: { initialise(): Promise<void>; start(): Promise<void>; stop(): Promise<void> } | undefined;
  if (!fixtureUrl) {
    const { default: EmbeddedPostgres } = await import(process.env.WORKER_TEST_EMBEDDED_POSTGRES ?? "embedded-postgres");
    pg = new EmbeddedPostgres({ databaseDir: join(dir, "data"), port, persistent: false,
      postgresFlags: ["-h", "127.0.0.1", "-c", "unix_socket_directories="], onLog: () => {}, onError: () => {} });
  }
  let db: import("@prisma/client").PrismaClient | undefined;
  try {
    if (pg) { await pg.initialise(); await pg.start(); }
    const { prisma } = await import("../src/lib/db"); db = prisma;
    const { reserveApplicationWork: reserve, beginApplicationSubmission: begin, recheckApplicationSubmission: recheck } = await import("../src/lib/application-worker-gates");
    const { reserveSubmissionBudget: budget, submissionSubjectKey } = await import("../src/lib/application-submission-budget");
    const existing = await db.$queryRaw<{ count: bigint }[]>`SELECT count(*) FROM pg_tables WHERE schemaname = 'public'`;
    assert.equal(Number(existing[0].count), 0, "Refuse any fixture database that is not empty");
    const baseline = (await readFile("prisma/schema.prisma", "utf8")).replace(/model ApplicationSubmissionReservation \{[\s\S]*?\n\}/, "");
    const baselinePath = join(dir, "baseline.prisma"); await writeFile(baselinePath, baseline);
    const schema = execFileSync(process.execPath, [resolve("node_modules/prisma/build/index.js"), "migrate", "diff", "--from-empty", "--to-schema-datamodel", baselinePath, "--script"], { encoding: "utf8", env: process.env });
    for (const statement of schema.split(/;\s*(?:\n|$)/).filter(s => s.trim())) await db.$executeRawUnsafe(statement);
    await db.user.create({ data: { id: "unchanged-legacy", email: "unchanged@example.invalid" } });
    const untouched = await db.user.findUniqueOrThrow({ where: { id: "unchanged-legacy" } });
    const migration = await readFile("prisma/migrations/20261014113000_manual_submission_budget/migration.sql", "utf8");
    const statements = migration.split(/;\s*(?:\n|$)/).filter(s => s.trim());
    assert.equal(statements.length, 4);
    await db.$transaction(async tx => { for (const statement of statements) await tx.$executeRawUnsafe(statement); });
    assert.deepEqual(await db.user.findUniqueOrThrow({ where: { id: "unchanged-legacy" } }), untouched);
    assert.equal(await db.applicationSubmissionReservation.count(), 0);
    console.log("PASS PostgreSQL: exact additive migration applies atomically to a populated baseline, preserving existing data.");
    const make = async (id: string, overrides: Record<string, unknown> = {}) => {
      const now = new Date();
      const user = await db!.user.create({ data: { id: `${id}-user`, email: `${id}@example.invalid`, tier: "pro", emailVerified: now, privacyConsentAt: now,
        subscriptionStatus: "active", currentPeriodEnd: new Date(+now + 86400000), preferences: { create: { autoApplyMode: "auto" } } } });
      const job = await db!.job.create({ data: { externalId: id, source: "synthetic", title: "Synthetic", description: "Synthetic", url: "https://boards.greenhouse.io/acme/jobs/123", company: "Acme" } });
      return db!.application.create({ data: { id, userId: user.id, jobId: job.id, portal: "synthetic", createdAt: now, consentGrantedAt: now, ...overrides } });
    };
    const apps = await Promise.all(Array.from({ length: 18 }, (_, i) => make(`budget-${i}`)));
    const tokens = await Promise.all(apps.map(app => reserve(app.id)));
    assert(tokens.every(Boolean), "Different users may prepare concurrently; preparation is not the submission budget");
    const channels = apps.map((_, i) => i % 2 ? "email_recruiter" : "portal_greenhouse");
    const began = await Promise.all(apps.map((app, i) => begin(app.id, tokens[i]!, undefined, channels[i])));
    assert.equal(began.filter(Boolean).length, 10, "18 different users/channels must reserve exactly ten, not ten per user");
    assert.equal(await db.applicationSubmissionReservation.count(), 10);
    for (const [i, wasAdmitted] of began.entries()) if (!wasAdmitted) {
      const held: import("@prisma/client").Application = await db.application.findUniqueOrThrow({ where: { id: apps[i].id } });
      assert.equal(held.status, "ready_to_apply"); assert.equal(held.submitConfirmation, "NOT_SUBMITTED");
      assert.equal(held.submittedAt, null); assert.match(held.errorMessage!, /Limite temporaneo giornaliero/);
      assert.equal(await reserve(held.id), null, "Budget-held material is preserved without an automatic replay");
    }
    const chosen = began.indexOf(true), app = apps[chosen], token = tokens[chosen]!, channel = channels[chosen];
    assert.equal(await begin(app.id, token, undefined, channel), false, "Duplicate begin never authorizes another transmission");
    assert.equal(await recheck(app.id, token, undefined, channel), true);
    process.env.APPLY_GLOBAL_DAILY_CAP = "9";
    assert.equal(await recheck(app.id, token, undefined, channel), false, "Lowering cap blocks even a reserved final submission when consumed count is above cap");
    assert.equal(await db.applicationSubmissionReservation.count(), 10, "No refund on final gate failure");
    process.env.APPLY_GLOBAL_DAILY_CAP = "10";
    await db.application.update({ where: { id: app.id }, data: { status: "queued", submitConfirmation: "NOT_SUBMITTED", startedAt: null } });
    assert.equal(await reserve(app.id), null, "Even a proved no-send/reset does not recycle a rollout attempt");
    await db.application.delete({ where: { id: app.id } });
    assert.equal(await db.applicationSubmissionReservation.count(), 10, "Deletion never refunds consumed budget");
    const replacement = await db.application.create({ data: { id: "replacement", userId: app.userId, jobId: app.jobId, portal: "synthetic", consentGrantedAt: new Date() } });
    assert.equal(await reserve(replacement.id), null, "Deleting and recreating the same user/job cannot replay an attempt");
    console.log("PASS PostgreSQL: cross-user/channel global ten cap, duplicate begin, lower cap, immutable unknown/no-send/deletion fences.");

    const historical = await make("historical", { createdAt: new Date(0) });
    assert.equal(await reserve(historical.id), null, "Fresh consent on old row does not revive it");
    assert.equal((await db.application.findUniqueOrThrow({ where: { id: historical.id } })).startedAt, null, "Historical rows are not rewritten");
    const noConsent = await make("no-consent", { consentGrantedAt: null });
    assert.equal(await reserve(noConsent.id), null);
    const retry = await make("retry", { retryCount: 1 }); assert.equal(await reserve(retry.id), null);
    const invalid = await make("invalid");
    process.env.APPLY_GLOBAL_DAILY_CAP = "0"; assert.equal(await reserve(invalid.id), null);
    process.env.APPLY_GLOBAL_DAILY_CAP = "10";
    process.env.APPLICATIONS_PAUSED = "true"; assert.equal(await reserve(invalid.id), null);
    process.env.APPLICATIONS_PAUSED = "false";
    console.log("PASS PostgreSQL: old applications, no consent, retries, missing config and global pause are held without history rewrites.");

    // Direct ledger tests use a simulated clock only in this disposable DB,
    // while preserving the real advisory lock and all real SQL reservations.
    const actualDay = new Date().toISOString().slice(0, 10);
    const tomorrow = new Date(`${actualDay}T12:00:00.000Z`); tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    const at = (when: Date, attempt: Parameters<typeof budget>[1], phase: "begin" | "recheck") => db!.$transaction(tx => {
      const wrapped = new Proxy(tx, { get(target, prop) {
        if (prop === "$queryRaw") return (strings: TemplateStringsArray, ...values: unknown[]) => strings.join("").includes("clock_timestamp")
          ? Promise.resolve([{ now: when }]) : target.$queryRaw(strings, ...values);
        return Reflect.get(target, prop);
      } });
      return budget(wrapped, attempt, phase);
    });
    const prior = await db.applicationSubmissionReservation.findFirstOrThrow({ where: { applicationId: app.id } });
    const attempt = { applicationId: prior.applicationId, subjectKey: prior.subjectKey, attemptStartedAt: prior.attemptStartedAt, channel: prior.channel };
    assert.equal(await at(tomorrow, attempt, "recheck"), null, "Same in-flight attempt crossing midnight reserves the new UTC day too");
    assert.equal(await db.applicationSubmissionReservation.count({ where: { applicationId: app.id } }), 2);
    assert.equal(await at(tomorrow, attempt, "begin"), "rollout_attempt_already_reserved", "Rollover never reopens an unknown attempt");
    assert.equal(await at(tomorrow, { ...attempt, channel: channel === "email_recruiter" ? "portal_greenhouse" : "email_recruiter" }, "recheck"), "rollout_attempt_mismatch");
    assert.equal(await at(tomorrow, { ...attempt, attemptStartedAt: new Date(+token + 1) }, "recheck"), "rollout_attempt_mismatch");
    const savedStart = process.env.APPLICATION_ROLLOUT_START_AT!;
    process.env.APPLICATION_ROLLOUT_START_AT = new Date(Date.parse(savedStart) - 1000).toISOString();
    assert.equal(await at(tomorrow, attempt, "recheck"), "rollout_attempt_mismatch", "Changing cutoff cannot reauthorize an old attempt");
    process.env.APPLICATION_ROLLOUT_START_AT = savedStart;
    const rest = Array.from({ length: 15 }, (_, i) => ({ applicationId: `tomorrow-${i}`, subjectKey: submissionSubjectKey(`u-${i}`, `j-${i}`), attemptStartedAt: token, channel: i % 2 ? "portal_lever" : "email_recruiter" }));
    assert.equal((await Promise.all(rest.map(a => at(tomorrow, a, "begin")))).filter(r => r === null).length, 9);
    const another = await db.applicationSubmissionReservation.findFirstOrThrow({ where: { applicationId: { not: app.id }, budgetDay: new Date(`${actualDay}T00:00:00Z`) } });
    assert.equal(await at(tomorrow, { applicationId: another.applicationId, subjectKey: another.subjectKey, attemptStartedAt: another.attemptStartedAt, channel: another.channel }, "recheck"), "rollout_daily_budget_reached");
    console.log("PASS PostgreSQL: UTC rollover, full next-day budget, wrong channel/token/cutoff and restart cannot replay or refund uncertainty.");

    const failureDay = new Date(+tomorrow + 86400000);
    const failedAttempt = { applicationId: "failure", subjectKey: submissionSubjectKey("failure", "job"), attemptStartedAt: token, channel: "email_recruiter" };
    let externalCalls = 0;
    await assert.rejects(db.$transaction(async tx => {
      const wrapped = new Proxy(tx, { get(target, prop) {
        if (prop === "$queryRaw") return (strings: TemplateStringsArray, ...values: unknown[]) => strings.join("").includes("clock_timestamp")
          ? Promise.resolve([{ now: failureDay }]) : target.$queryRaw(strings, ...values);
        if (prop === "applicationSubmissionReservation") return { ...target.applicationSubmissionReservation, create: async () => { throw new Error("synthetic reservation persistence failure"); } };
        return Reflect.get(target, prop);
      } });
      if (!await budget(wrapped as Prisma.TransactionClient, failedAttempt, "begin")) externalCalls++;
    }), /synthetic reservation persistence failure/);
    assert.equal(externalCalls, 0);
    assert.equal(await db.applicationSubmissionReservation.count({ where: { applicationId: "failure" } }), 0);
    // Transaction rollback after reservation also rolls back the delivery fence.
    await assert.rejects(db.$transaction(async tx => {
      await tx.applicationSubmissionReservation.create({ data: { ...failedAttempt, rolloutStartedAt: new Date(savedStart), budgetDay: failureDay } });
      throw new Error("synthetic fence failure");
    }), /synthetic fence failure/);
    assert.equal(await db.applicationSubmissionReservation.count({ where: { applicationId: "failure" } }), 0);
    console.log("PASS PostgreSQL: reservation/fence persistence failures cannot authorize external calls; transaction rollback is atomic.");

    let releaseLock!: () => void, announceLock!: () => void, announceWait!: () => void;
    const held = new Promise<void>(resolve => { announceLock = resolve; });
    const release = new Promise<void>(resolve => { releaseLock = resolve; });
    const waiting = new Promise<void>(resolve => { announceWait = resolve; });
    const blocker = db.$transaction(async tx => {
      await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(1735274851, 20261014)`;
      announceLock(); await release;
    });
    await held;
    let clockReads = 0;
    let simulatedNow = new Date(+failureDay + 86400000);
    const waiter = db.$transaction(tx => budget(new Proxy(tx, { get(target, prop) {
      if (prop === "$queryRaw") return async (strings: TemplateStringsArray, ...values: unknown[]) => {
        if (strings.join("").includes("clock_timestamp")) { clockReads++; return [{ now: simulatedNow }]; }
        announceWait(); return target.$queryRaw(strings, ...values);
      };
      return Reflect.get(target, prop);
    } }), { ...failedAttempt, applicationId: "waiter", subjectKey: submissionSubjectKey("waiter", "job") }, "begin"));
    await waiting; await new Promise(resolve => setTimeout(resolve, 30));
    assert.equal(clockReads, 0, "The waiting transaction must not read yesterday's clock before acquiring the lock");
    simulatedNow = new Date(+simulatedNow + 86400000);
    releaseLock(); await blocker; assert.equal(await waiter, null);
    const waited = await db.applicationSubmissionReservation.findFirstOrThrow({ where: { applicationId: "waiter" } });
    assert.equal(waited.budgetDay.toISOString().slice(0, 10), simulatedNow.toISOString().slice(0, 10));
    assert.equal(clockReads, 1);
    console.log("PASS PostgreSQL: a transaction waiting across simulated midnight reads the clock only after the real global lock is released.");
    const { createFreshApplication } = await import("../src/lib/application-create");
    const legacy = await make("creation-legacy", { createdAt: new Date(0), status: "failed" });
    await assert.rejects(createFreshApplication({ data: { userId: legacy.userId, jobId: legacy.jobId, portal: "synthetic" } }, db), /prior_application_exists/);
    assert.deepEqual(await db.application.findUniqueOrThrow({ where: { id: legacy.id } }), legacy, "Existing history remains byte-for-byte unchanged");
    const freshJob = await db.job.create({ data: { externalId: "creation-race", source: "synthetic", title: "Synthetic", description: "Synthetic", url: "https://boards.greenhouse.io/acme/jobs/456" } });
    const data = { userId: legacy.userId, jobId: freshJob.id, portal: "synthetic", consentGrantedAt: new Date() };
    const races = await Promise.allSettled(Array.from({ length: 12 }, () => createFreshApplication({ data }, db!)));
    const winners = races.filter((r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof createFreshApplication>>> => r.status === "fulfilled");
    assert.equal(winners.length, 1);
    for (const result of races) if (result.status === "rejected") assert.match(String(result.reason), /prior_application_exists/);
    assert.equal(await db.application.count({ where: { userId: data.userId, jobId: data.jobId } }), 1);
    const winning = winners[0].value;
    const work = await reserve(winning.id); assert.ok(work);
    process.env.APPLY_GLOBAL_DAILY_CAP = "100";
    let simulatedTransmissions = 0;
    const submissions = await Promise.all(Array.from({ length: 12 }, async () => {
      const allowed = await begin(winning.id, work, undefined, "portal_greenhouse");
      if (allowed) simulatedTransmissions++;
      return allowed;
    }));
    assert.equal(submissions.filter(Boolean).length, 1); assert.equal(simulatedTransmissions, 1);
    assert.equal(await db.applicationSubmissionReservation.count({ where: { applicationId: winning.id } }), 1);
    assert.equal(await begin(winning.id, work, undefined, "email_recruiter"), false, "Another channel cannot replay uncertain transmission");
    console.log("PASS PostgreSQL: 12 concurrent creators yield one untouched new row; legacy preserved; 12 concurrent begin calls authorize exactly one simulated transmission and one durable reservation, cross-channel replay denied.");
    // Historical/imported sibling rows can predate the fresh-creation lock.
    const siblingToken = new Date();
    const siblingA = await make("sibling-race", { status: "optimizing", startedAt: siblingToken });
    await db.job.update({ where: { id: siblingA.jobId }, data: { url: "https://jobs.ashbyhq.com/fixture/11111111-1111-4111-8111-111111111111" } });
    const siblingB = await db.application.create({ data: { userId: siblingA.userId, jobId: siblingA.jobId, portal: "synthetic", status: "optimizing", startedAt: siblingToken, consentGrantedAt: new Date() } });
    const siblingResults = await Promise.all([begin(siblingA.id, siblingToken, undefined, "portal_ashby"), begin(siblingB.id, siblingToken, undefined, "email_recruiter")]);
    assert.equal(siblingResults.filter(Boolean).length, 1, "Concurrent sibling/cross-channel fences authorize one transmission");
    assert.equal(await db.applicationSubmissionReservation.count({ where: { subjectKey: submissionSubjectKey(siblingA.userId, siblingA.jobId) } }), 1);
    console.log("PASS PostgreSQL: pre-existing sibling rows race across portal/email channels, exactly one begin and durable subject reservation wins.");
    for (const quota of ["daily", "monthly"] as const) {
      const seed = await make(`quota-${quota}`);
      await db.userPreferences.update({ where: { userId: seed.userId }, data: { dailyCap: quota === "daily" ? 2 : 100 } });
      if (quota === "monthly") await db.application.createMany({ data: Array.from({ length: 48 }, (_, i) => ({
        id: `monthly-history-${i}`, userId: seed.userId, jobId: seed.jobId, portal: "synthetic", status: "queued",
      })) });
      // Failed/diagnostic rows retain the existing non-consuming semantics.
      await db.application.createMany({ data: ["failed", "diagnostic"].map(status => ({
        userId: seed.userId, jobId: seed.jobId, portal: "synthetic", status,
      })) });
      const prior = await db.application.findMany({ where: { userId: seed.userId }, orderBy: { id: "asc" } });
      const destinations = await Promise.all(["manual", "auto"].map(mode => db!.job.create({ data: {
        externalId: `quota-${quota}-${mode}`, source: "synthetic", title: "Synthetic", description: "Synthetic", url: `https://example.invalid/${quota}/${mode}`,
      } })));
      const explicitConsent = new Date();
      const attempts = await Promise.allSettled(destinations.map((job, i) => createFreshApplication({ data: {
        userId: seed.userId, jobId: job.id, portal: "synthetic", consentGrantedAt: i === 0 ? explicitConsent : null,
      } }, db!)));
      assert.equal(attempts.filter(r => r.status === "fulfilled").length, 1, `${quota}: exactly one remaining slot`);
      for (const result of attempts) if (result.status === "rejected") assert.match(String(result.reason), quota === "daily" ? /daily_limit/ : /paywall/);
      const created = await db.application.findMany({ where: { userId: seed.userId, jobId: { in: destinations.map(job => job.id) } } });
      assert.equal(created.length, 1);
      assert.equal(created[0].consentGrantedAt?.getTime() ?? null, created[0].jobId === destinations[0].id ? +explicitConsent : null);
      assert.deepEqual(await db.application.findMany({ where: { id: { in: prior.map(row => row.id) } }, orderBy: { id: "asc" } }), prior);
      console.log(`PASS PostgreSQL: ${quota} residual one, manual/auto different jobs race, one creation only, consent/history preserved, failed/diagnostic excluded.`);
    }
    for (const version of [1, null]) {
      const user = await db.user.create({ data: { email: `trial-cap-${version}@example.invalid`, tier: "pro", subscriptionStatus: "trialing", trialActivationVersion: version,
        currentPeriodEnd: new Date(Date.now()+86400000), preferences: { create: { dailyCap: 10 } } } });
      const beforeUser = await db.user.findUniqueOrThrow({ where: { id: user.id } });
      const jobs = await Promise.all(Array.from({ length: 12 }, (_, i) => db!.job.create({ data: {
        externalId: `trial-cap-${version}-${i}`, source: "synthetic", title: "Synthetic", description: "Synthetic", url: `https://example.invalid/trial/${version}/${i}`,
      } })));
      const outcomes = await Promise.allSettled(jobs.map((job, i) => createFreshApplication({ data: {
        userId: user.id, jobId: job.id, portal: "synthetic", consentGrantedAt: i % 2 ? null : new Date(),
      } }, db!)));
      assert.equal(outcomes.filter(r => r.status === "fulfilled").length, version === 1 ? 5 : 10);
      for (const outcome of outcomes) if (outcome.status === "rejected") assert.match(String(outcome.reason), /daily_limit/);
      assert.deepEqual(await db.user.findUniqueOrThrow({ where: { id: user.id } }), beforeUser, "Admission never resets quota, trial, billing or consent");
    }
    console.log("PASS PostgreSQL: mixed manual/automatic creators admit five new-trial applications and preserve ten for legacy trials; user state unchanged.");
    console.log("ALL MANUAL SUBMISSION BUDGET POSTGRES CHECKS PASSED. No external sends or production access.");
  } finally { if (db) await db.$disconnect(); if (pg) await pg.stop(); await rm(dir, { recursive: true, force: true }); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
