import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

async function main() {
  // An explicit localhost sandbox: ambient production URLs are NEVER read.
  const port = 55454;
  process.env.DATABASE_URL = `postgresql://postgres:password@127.0.0.1:${port}/postgres?connection_limit=12`;
  process.env.DIRECT_URL = process.env.DATABASE_URL;
  const env: Record<string, string | undefined> = process.env;
  env.NODE_ENV = "test";
  const dependency = process.env.WORKER_TEST_EMBEDDED_POSTGRES ?? "embedded-postgres";
  const { default: EmbeddedPostgres } = await import(dependency);
  const dir = await mkdtemp(join(tmpdir(), "lavorai-worker-postgres-"));
  const pg = new EmbeddedPostgres({ databaseDir: join(dir, "data"), port, persistent: false,
    postgresFlags: ["-h", "127.0.0.1", "-c", "unix_socket_directories="], onLog: () => {}, onError: () => {} });
  let db: import("@prisma/client").PrismaClient | undefined;
  try {
    await pg.initialise(); await pg.start();
    const { prisma } = await import("../src/lib/db"); db = prisma;
    const { reserveApplicationWork: reserve, beginApplicationSubmission: begin, completeApplicationSubmission: complete, recheckApplicationSubmission: recheck, SUBMISSION_STARTED } = await import("../src/lib/application-worker-gates");
    const { recoverStuckApplications } = await import("../src/lib/application-claim");
    const schema = execFileSync(process.execPath, [resolve("node_modules/prisma/build/index.js"), "migrate", "diff", "--from-empty", "--to-schema-datamodel", "prisma/schema.prisma", "--script"], { encoding: "utf8", env: process.env });
    for (const statement of schema.split(/;\s*(?:\n|$)/).filter((s) => s.trim())) await db.$executeRawUnsafe(statement);
    const now = new Date();
    const user = await db.user.create({ data: { id: "worker-user", email: "worker@example.invalid", tier: "pro", emailVerified: now, privacyConsentAt: now,
      subscriptionStatus: "active", currentPeriodEnd: new Date(+now + 86400000), preferences: { create: { autoApplyMode: "auto", locationsJson: '["Milano"]', rolesJson: '["Synthetic"]', employmentType: "both", salaryMin: 0, matchMin: 50 } },
      cvProfile: { create: { title: "Synthetic" } } } });
    const round = await db.applicationSession.create({ data: { id: "worker-round", userId: user.id, key: "synthetic", label: "Synthetic", sentCount: 27, targetCount: 30 } });
    const ids = Array.from({ length: 21 }, (_, i) => `worker-app-${i}`);
    for (const id of ids) {
      const job = await db.job.create({ data: { externalId: id, source: "synthetic", title: "Synthetic", description: "Synthetic fixture", url: "https://boards.greenhouse.io/acme/jobs/123", company: "Acme", location: "Milano" } });
      await db.application.create({ data: { id, userId: user.id, jobId: job.id, sessionId: round.id, portal: "synthetic" } });
    }
    const reset = async (sentCount = 27, targetCount = 30) => {
      await db!.application.updateMany({ data: { status: "queued", startedAt: null, completedAt: null, submittedAt: null, submittedVia: null,
        consentGrantedAt: null, submissionReceiptJson: null, submitConfirmation: null, canaryLog: null, answersUsedJson: null, viewedAt: null, lastReplyAt: null, replyCount: 0, userStatus: null } });
      await db!.applicationSession.update({ where: { id: round.id }, data: { status: "active", sentCount, targetCount, completedAt: null } });
    };
    const reservations = await Promise.all(ids.map((id) => reserve(id)));
    const admitted = ids.flatMap((id, i) => reservations[i] ? [{ id, token: reservations[i]! }] : []);
    assert.equal(admitted.length, 3, "21 competing jobs must reserve exactly three remaining slots");
    assert.equal(await db.application.count({ where: { status: "queued" } }), 18);
    assert((await Promise.all(admitted.map(({ id, token }) => begin(id, token)))).every(Boolean));
    const final = () => ({ submittedVia: "portal_greenhouse", submitConfirmation: "DETECTED_TEST", submittedAt: new Date(), completedAt: new Date(),
      submissionReceiptJson: JSON.stringify({ version: 1, provider: "greenhouse", kind: "http", jobId: "123", capturedAt: new Date().toISOString(),
        endpoint: "https://boards.greenhouse.io/acme/jobs/123", operation: "application.create", httpStatus: 201, signal: "application_id", receiptId: "synthetic-receipt" }) });
    assert((await Promise.all(admitted.map(({ id, token }) => complete(id, token, final())))).every(Boolean));
    assert.equal((await db.applicationSession.findUniqueOrThrow({ where: { id: round.id } })).sentCount, 30);
    assert.equal((await db.applicationSession.findUniqueOrThrow({ where: { id: round.id } })).status, "completed");
    assert.equal(await complete(admitted[0].id, admitted[0].token, final()), false);
    assert.equal(await reserve(ids.find((id) => !admitted.some((a) => a.id === id))!), null);
    assert.equal(await db.application.count({ where: { status: "queued" } }), 18, "Blocked backlog is preserved");
    console.log("PASS PostgreSQL: 21 concurrent admissions at 27/30 admit exactly 3; atomic success, idempotence, completed-round block, 18 queued preserved.");

    await reset(29);
    const duplicated = await Promise.all(Array.from({ length: 16 }, () => reserve(ids[0])));
    assert.equal(duplicated.filter(Boolean).length, 1, "Even direct duplicate invocations get one owner");
    const token = duplicated.find(Boolean)!;
    await db.applicationSession.update({ where: { id: round.id }, data: { status: "paused" } });
    assert.equal(await begin(ids[0], token), false);
    assert.equal((await db.application.findUniqueOrThrow({ where: { id: ids[0] } })).status, "queued");
    console.log("PASS PostgreSQL: duplicate same-ID workers have one owner; pause after optimization blocks delivery without cancelling data.");

    for (const status of ["paused", "completed", "cancelled"]) {
      await reset(); await db.applicationSession.update({ where: { id: round.id }, data: { status } });
      assert.equal(await reserve(ids[0]), null);
    }
    await reset(); let t = (await reserve(ids[0]))!;
    await db.user.update({ where: { id: user.id }, data: { suspendedAt: new Date() } });
    assert.equal(await begin(ids[0], t), false);
    await db.user.update({ where: { id: user.id }, data: { suspendedAt: null } });
    await reset(); t = (await reserve(ids[0]))!;
    await db.userPreferences.update({ where: { userId: user.id }, data: { autoApplyMode: "off" } });
    assert.equal(await begin(ids[0], t), false);
    await db.userPreferences.update({ where: { userId: user.id }, data: { autoApplyMode: "auto" } });
    console.log("PASS PostgreSQL: inactive rounds and freshly suspended/auto-off accounts cannot cross the delivery boundary.");

    for (const preferences of [{ locationsJson: '["Berlin"]' }, { salaryMin: 200 }, { matchMin: 100 }]) {
      await reset();
      await db.job.updateMany({ data: { salaryMin: 50000, salaryMax: 60000 } });
      t = (await reserve(ids[0]))!; assert(t);
      await db.userPreferences.update({ where: { userId: user.id }, data: preferences });
      assert.equal(await begin(ids[0], t), false, "Preference changes while queued/preparing must block current delivery");
      await db.userPreferences.update({ where: { userId: user.id }, data: { locationsJson: '["Milano"]', salaryMin: 0, matchMin: 50 } });
    }
    await reset(); t = (await reserve(ids[0]))!;
    await db.user.update({ where: { id: user.id }, data: { avoidCompanies: "Acme" } });
    assert.equal(await begin(ids[0], t), false);
    await db.user.update({ where: { id: user.id }, data: { avoidCompanies: null } });
    console.log("PASS PostgreSQL: fresh location/salary/match/avoided-company edits block before submission.");

    await reset(29); t = (await reserve(ids[0]))!; assert.equal(await begin(ids[0], t), true);
    await db.applicationSession.update({ where: { id: round.id }, data: { status: "paused" } });
    assert.equal(await recheck(ids[0], t), false);
    const stopped = await db.application.findUniqueOrThrow({ where: { id: ids[0] } });
    assert.equal(stopped.status, "ready_to_apply"); assert.equal(stopped.submitConfirmation, "UNCONFIRMED");
    await db.applicationSession.update({ where: { id: round.id }, data: { status: "active" } });
    assert.equal(await reserve(ids[1]), null, "Final-submit stop retains earlier upload uncertainty and capacity");
    console.log("PASS PostgreSQL: pause during form fill blocks final submit without permitting replay.");

    await reset(29); t = (await reserve(ids[0]))!; assert.equal(await begin(ids[0], t), true);
    assert.equal(await complete(ids[0], t, { submittedVia: "portal_greenhouse", submitConfirmation: "DETECTED_HTTP_200" }), false);
    assert.equal(await complete(ids[0], t, { ...final(), submittedVia: "portal_lever" }), false);
    assert.equal(await complete(ids[0], t, { ...final(), submissionReceiptJson: JSON.stringify({ ...JSON.parse(final().submissionReceiptJson), jobId: "999" }) }), false);
    assert.equal(await complete(ids[0], t, { submittedVia: "email_recruiter", submitConfirmation: "EMAIL_SENT" }), false);
    const emailAttempt = await db.applicationEmailAttempt.create({ data: { applicationId: ids[0], attemptKey: `application-${ids[0]}-${t.getTime()}`, recipient: "careers@acme.test" } });
    assert.equal(await complete(ids[0], t, { submittedVia: "email_recruiter", submitConfirmation: "EMAIL_SENT" }), false);
    await db.applicationEmailAttempt.update({ where: { id: emailAttempt.id }, data: { providerEmailId: "synthetic-provider-id", acceptedAt: new Date(), status: "accepted" } });
    assert.equal(await complete(ids[0], t, { submittedVia: "email_recruiter", submitConfirmation: "EMAIL_SENT", submittedAt: new Date() }), true);
    console.log("PASS PostgreSQL: raw labels, wrong-job receipts and unaccepted email attempts cannot count success.");

    await reset(29); t = (await reserve(ids[0]))!;
    assert.equal(await begin(ids[0], t), true);
    const stale = new Date(Date.now() - 25 * 60000);
    await db.application.update({ where: { id: ids[0] }, data: { startedAt: stale } });
    await recoverStuckApplications();
    let uncertain = await db.application.findUniqueOrThrow({ where: { id: ids[0] } });
    assert.equal(uncertain.status, "ready_to_apply"); assert.equal(uncertain.submitConfirmation, "UNCONFIRMED");
    assert.equal(await reserve(ids[1]), null, "Unknown delivery retains the last round slot");
    await db.application.update({ where: { id: ids[0] }, data: { status: "queued" } });
    assert.equal(await reserve(ids[0]), null, "Even incorrect requeue cannot replay an unknown send");
    assert.equal(await reserve(ids[1]), null);
    console.log("PASS PostgreSQL: crashed/unknown send retains its slot and cannot be replayed even if another path requeues it.");

    // A slow original attempt may still return its real receipt after recovery.
    await db.application.update({ where: { id: ids[0] }, data: { status: "ready_to_apply" } });
    assert.equal(await complete(ids[0], stale, final()), true);
    assert.equal(await complete(ids[0], stale, final()), false);
    assert.equal((await db.applicationSession.findUniqueOrThrow({ where: { id: round.id } })).sentCount, 30);
    console.log("PASS PostgreSQL: same-owner late confirmed receipt after recovery counts once without replay.");

    await reset(); t = (await reserve(ids[0]))!;
    await db.application.update({ where: { id: ids[0] }, data: { startedAt: stale } });
    await recoverStuckApplications();
    const newToken = (await reserve(ids[0]))!; assert(newToken);
    assert.equal(await begin(ids[0], t), false, "Recovered worker's old ownership token is fenced");
    assert.equal(await begin(ids[0], newToken), true);
    assert.equal((await db.application.findUniqueOrThrow({ where: { id: ids[0] } })).submitConfirmation, SUBMISSION_STARTED);
    console.log("PASS PostgreSQL: only safe preparation is recoverable; old owners cannot send after recovery.");

    await reset(29);
    await db.application.update({ where: { id: ids[0] }, data: { status: "submitting", startedAt: stale } });
    assert.equal(await reserve(ids[1]), null, "Legacy submitting reserves capacity even before recovery");
    await recoverStuckApplications();
    assert.equal((await db.application.findUniqueOrThrow({ where: { id: ids[0] } })).submitConfirmation, "UNCONFIRMED");
    await reset(29);
    await db.application.update({ where: { id: ids[0] }, data: { cvDocxPath: "synthetic-existing.docx" } });
    assert.equal(await reserve(ids[0]), null, "Uninstrumented prepared legacy jobs are review-only");
    assert.equal((await db.application.findUniqueOrThrow({ where: { id: ids[0] } })).status, "ready_to_apply");
    await db.application.update({ where: { id: ids[0] }, data: { cvDocxPath: null } });
    console.log("PASS PostgreSQL: legacy submitting and prepared uninstrumented requeues cannot bypass review.");

    await reset(29);
    await db.application.update({ where: { id: ids[0] }, data: { status: "ready_to_apply" } });
    assert.equal(await reserve(ids[1]), null, "Historical pending work still reserves round capacity");
    assert.equal(await db.application.count({ where: { status: "ready_to_apply" } }), 1);
    console.log("PASS PostgreSQL: historical manual/unknown pending work is preserved and blocks further capacity.");

    await reset(0, 1); t = (await reserve(ids[0]))!; assert.equal(await begin(ids[0], t), true);
    assert.equal(await complete(ids[0], t, { submitConfirmation: "DRY_RUN", submittedVia: "mock_demo" }), false);
    const failFinalize = {
      application: db.application,
      $transaction: (operation: any) => db!.$transaction(async (tx) => operation({
        ...tx, applicationSession: { ...tx.applicationSession, update: async () => { throw new Error("synthetic counter failure"); } },
      })),
    };
    await assert.rejects(complete(ids[0], t, final(), failFinalize as any), /synthetic counter failure/);
    assert.equal((await db.application.findUniqueOrThrow({ where: { id: ids[0] } })).submitConfirmation, SUBMISSION_STARTED);
    assert.equal((await db.applicationSession.findUniqueOrThrow({ where: { id: round.id } })).sentCount, 0);
    assert.equal(await reserve(ids[1]), null, "Rollback retains the durable send reservation");
    console.log("PASS PostgreSQL: completion rollback preserves both count and durable reservation.");
    // Simultaneous completion and next reservation cannot observe a free gap.
    const [saved, next] = await Promise.all([complete(ids[0], t, final()), reserve(ids[1])]);
    assert.equal(saved, true); assert.equal(next, null);
    console.log("PASS PostgreSQL: concurrent completion/admission has no counter-release gap.");
    console.log("ALL WORKER POSTGRES CHECKS PASSED. Local synthetic DB only; no external applications or emails sent.");
  } finally { if (db) await db.$disconnect(); await pg.stop(); await rm(dir, { recursive: true, force: true }); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
