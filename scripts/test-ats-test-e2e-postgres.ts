/**
 * End-to-end ATS test path against a local fake Recruitee HTTPS server
 * and CI's throwaway Postgres. Never Neon, never production, never a
 * real Recruitee or email provider.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import {
  ATS_TEST_IN_PROGRESS,
  ATS_TEST_JOB_SOURCE,
  ATS_TEST_PLACEHOLDER_EMAIL,
  atsTestApplicationId,
  parseAtsTestDestinations,
  prepareAndRunAtsTest,
  type AtsTestDeps,
} from "../src/lib/ats-test-capability";
import {
  REAL_RECRUITEE_OFFER_OPTIONS,
  installFakeRecruiteeFetch,
  startFakeRecruiteeServer,
} from "./fake-recruitee-server";

const TEST_USER = "ats-test-e2e-user";
const HOST = "fake-lavorai.recruitee.com";
const CANDIDATE_EMAIL = "owner-mailbox@example.test";
const SLUGS = ["dry-optional", "real-optional", "race-two", "race-ten", "cv-required", "server-500", "needs-answers", "force-captcha", "no-form", "missing-cv"] as const;
const DESTINATIONS = SLUGS.map((slug) => `${HOST}/o/${slug}`).join(" ");
const FIXTURE_DB = /^\/lavorai_ats_test_e2e_test(?:_[a-z0-9]+)?$/;
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

function destUrl(slug: string) {
  return `https://${HOST}/o/${slug}`;
}

function refuseRemoteUrl(raw: string, label: string): URL {
  const target = new URL(raw);
  assert.ok(["postgres:", "postgresql:"].includes(target.protocol), `${label} must be postgres`);
  assert.ok(LOCAL_HOSTS.has(target.hostname), `${label} must be localhost`);
  assert.ok(!target.hostname.includes("neon.tech") && !target.href.includes("neon.tech"), `${label} must never be Neon`);
  return target;
}

function isolatedUrl(base: string): string {
  const url = new URL(base);
  url.searchParams.set("connection_limit", "1");
  return url.toString();
}

function openClient(url: string): PrismaClient {
  return new PrismaClient({ datasources: { db: { url: isolatedUrl(url) } } });
}

async function withClients<T>(url: string, n: number, fn: (clients: PrismaClient[]) => Promise<T>): Promise<T> {
  const clients = Array.from({ length: n }, () => openClient(url));
  try {
    await Promise.all(clients.map((client) => client.$connect()));
    return await fn(clients);
  } finally {
    await Promise.all(clients.map((client) => client.$disconnect().catch(() => undefined)));
  }
}

function postsOf(requests: Array<{ method: string; path: string }>) {
  return requests.filter((row) => row.method === "POST" && /\/candidates\/?$/.test(row.path));
}

function getsOf(requests: Array<{ method: string; path: string }>) {
  return requests.filter((row) => row.method === "GET" && /\/api\/offers\/[^/]+$/.test(row.path));
}

async function main() {
  const fixtureUrl = process.env.ATS_TEST_E2E_DATABASE_URL;
  if (fixtureUrl) {
    const target = refuseRemoteUrl(fixtureUrl, "ATS_TEST_E2E_DATABASE_URL");
    assert.match(target.pathname, FIXTURE_DB, "Test database must have a dedicated fixture name");
  }
  const port = 55457;
  const databaseUrl = fixtureUrl ?? `postgresql://postgres:password@127.0.0.1:${port}/postgres?connection_limit=16`;
  refuseRemoteUrl(databaseUrl, "resolved test DATABASE_URL");
  process.env.DATABASE_URL = databaseUrl;
  process.env.DIRECT_URL = databaseUrl;
  (process.env as Record<string, string>).NODE_ENV = "test";
  process.env.APPLICATIONS_PAUSED = "true";
  process.env.ATS_TEST_USER_ID = TEST_USER;
  process.env.ATS_TEST_DESTINATIONS = DESTINATIONS;
  process.env.ATS_TEST_CANDIDATE_EMAIL = CANDIDATE_EMAIL;
  delete process.env.ATS_TEST_REAL_SUBMIT;
  delete process.env.RESEND_API_KEY;
  delete process.env.BLOB_READ_WRITE_TOKEN;
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;

  const dir = await mkdtemp(join(tmpdir(), "lavorai-ats-test-e2e-"));
  let pg: { initialise(): Promise<void>; start(): Promise<void>; stop(): Promise<void> } | undefined;
  if (!fixtureUrl) {
    const dependency = process.env.WORKER_TEST_EMBEDDED_POSTGRES ?? "embedded-postgres";
    const { default: EmbeddedPostgres } = await import(dependency);
    pg = new EmbeddedPostgres({
      databaseDir: join(dir, "data"),
      port,
      persistent: false,
      postgresFlags: ["-h", "127.0.0.1", "-c", "unix_socket_directories="],
      onLog() {},
      onError() {},
    });
  }

  const fake = await startFakeRecruiteeServer();
  const forbidden: string[] = [];
  const restoreFetch = installFakeRecruiteeFetch({ port: fake.port, ca: fake.ca, onForbidden: (url) => forbidden.push(url) });

  const env = {
    ATS_TEST_USER_ID: TEST_USER,
    ATS_TEST_DESTINATIONS: DESTINATIONS,
    ATS_TEST_CANDIDATE_EMAIL: CANDIDATE_EMAIL,
  };
  const realEnv = { ...env, ATS_TEST_REAL_SUBMIT: "true" };

  let db: PrismaClient | undefined;
  const results: Array<{ name: string; ok: boolean; posts: number }> = [];
  const record = (name: string, posts: number) => {
    results.push({ name, ok: true, posts });
    console.log(`PASS ${name} (fake Recruitee POSTs this case: ${posts})`);
  };

  try {
    if (pg) {
      await pg.initialise();
      await pg.start();
    }
    db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await db.$connect();
    const existing = await db.$queryRaw<{ count: bigint }[]>`SELECT count(*) FROM pg_tables WHERE schemaname = 'public'`;
    assert.equal(Number(existing[0].count), 0, "Refuse any fixture database that is not empty");
    execFileSync(
      process.execPath,
      [resolve("node_modules/prisma/build/index.js"), "db", "push", "--skip-generate", "--accept-data-loss"],
      { encoding: "utf8", env: process.env, stdio: "inherit" },
    );
    console.log(`Using throwaway PostgreSQL ${new URL(databaseUrl).hostname}${new URL(databaseUrl).pathname} + fake Recruitee HTTPS 127.0.0.1:${fake.port}`);

    const { prisma } = await import("../src/lib/db");
    const { processApplication } = await import("../src/lib/application-worker");
    const { findPortalAdapter } = await import("../src/lib/portal-adapters");
    const { recruiteeAdapter } = await import("../src/lib/portal-adapters/recruitee");
    const { drainQueuedApplications } = await import("../src/lib/queue-drain");

    assert.equal(findPortalAdapter(destUrl("dry-optional"))?.id, "recruitee", "host *.recruitee.com matches the Recruitee adapter");
    assert.equal(findPortalAdapter("https://careers.example.invalid/o/custom-slug"), null, "unverified custom origins must not select the adapter");
    assert.equal(recruiteeAdapter.requiresBrowser, false);

    const now = new Date();
    await prisma.user.create({
      data: {
        id: TEST_USER,
        email: "ats-e2e@example.invalid",
        name: "LavorAI Test",
        tier: "pro",
        emailVerified: now,
        privacyConsentAt: now,
        subscriptionStatus: "active",
        currentPeriodEnd: new Date(+now + 86400000),
      },
    });
    const emailBaseline = new Date();

    const asDeps = (client: PrismaClient, runEnv: NodeJS.ProcessEnv): AtsTestDeps => ({
      env: runEnv,
      prisma: client as unknown as AtsTestDeps["prisma"],
      processApplication,
      findPortalAdapter,
    });

    // a. Dry run
    fake.requests.length = 0;
    const dry = await prepareAndRunAtsTest(
      { adminOk: true, jobUrl: destUrl("dry-optional") },
      asDeps(prisma, env),
    );
    assert.equal(dry.ok, true);
    if (dry.ok) {
      assert.equal(dry.mode, "dry_run");
      assert.equal(dry.result?.submitConfirmation, "DRY_RUN");
      assert.equal(dry.result?.status, "ready_to_apply");
      assert.match(dry.result?.errorMessage ?? "", /Required:/);
      assert.match(dry.result?.errorMessage ?? "", /ATS test mode=dry_run/);
      assert.doesNotMatch(dry.result?.errorMessage ?? "", /PORTAL_SUBMIT_DRY_RUN/);
      const dryRow = await prisma.application.findUnique({
        where: { id: dry.applicationId },
        select: { leaseToken: true, leaseExpiresAt: true, errorMessage: true },
      });
      assert.equal(dryRow?.leaseToken, null, "DRY_RUN must clear leaseToken");
      assert.equal(dryRow?.leaseExpiresAt, null, "DRY_RUN must clear leaseExpiresAt");
      assert.match(dryRow?.errorMessage ?? "", /ATS test mode=dry_run; no careers API POST/);
    }
    const dryCandidatePosts = fake.requests.filter((row) => row.method === "POST" && /\/api\/offers\/[^/]+\/candidates\/?$/.test(row.path));
    const dryPosts = dryCandidatePosts.length;
    assert.ok(getsOf(fake.requests).length >= 1, "dry run must GET the offer");
    assert.equal(dryPosts, 0, "dry run against the fake server records zero POSTs to /candidates");
    assert.equal(dryCandidatePosts.length, 0, "dry-run /candidates POST count must be exactly 0");
    console.log("dry-run fake Recruitee /candidates POST count: 0");
    const dryGet = getsOf(fake.requests).find((row) => row.path.includes("dry-optional"));
    assert.ok(dryGet, "dry run GETs /api/offers/dry-optional");
    const fixtureOffer = await (await fetch(destUrl("dry-optional").replace("/o/", "/api/offers/"))).json() as { offer: Record<string, unknown> };
    assert.equal(fixtureOffer.offer.options_phone, REAL_RECRUITEE_OFFER_OPTIONS.options_phone);
    assert.equal(fixtureOffer.offer.options_cv, REAL_RECRUITEE_OFFER_OPTIONS.options_cv);
    assert.equal(fixtureOffer.offer.options_cover_letter, REAL_RECRUITEE_OFFER_OPTIONS.options_cover_letter);
    assert.equal(fixtureOffer.offer.options_photo, REAL_RECRUITEE_OFFER_OPTIONS.options_photo);
    assert.deepEqual(fixtureOffer.offer.open_questions, []);
    const dryAgain = await prepareAndRunAtsTest(
      { adminOk: true, jobUrl: destUrl("dry-optional") },
      asDeps(prisma, env),
    );
    assert.equal(dryAgain.ok, false);
    if (!dryAgain.ok) assert.equal(dryAgain.reason, "ats_test_already_attempted");
    assert.equal(postsOf(fake.requests).length, 0, "consumed dry dest stays at zero POSTs");
    record("a. dry-run GET / zero POST / DRY_RUN / dest consumed", dryPosts);

    // b. Real submit
    process.env.ATS_TEST_REAL_SUBMIT = "true";
    fake.requests.length = 0;
    const real = await prepareAndRunAtsTest(
      { adminOk: true, realSubmit: true, jobUrl: destUrl("real-optional") },
      asDeps(prisma, realEnv),
    );
    assert.equal(real.ok, true);
    const realPosts = postsOf(fake.requests);
    assert.equal(realPosts.length, 1, "real submit POSTs exactly once");
    assert.equal(realPosts[0].fields["candidate[email]"], CANDIDATE_EMAIL);
    assert.notEqual(realPosts[0].fields["candidate[email]"], ATS_TEST_PLACEHOLDER_EMAIL);
    assert.match(realPosts[0].fields["candidate[name]"] ?? "", /LavorAI/);
    assert.ok(realPosts[0].files.some((file) => file.field === "candidate[cv]" && file.size > 0), "synthetic CV is attached");
    if (real.ok) {
      assert.equal(real.result?.status, "success");
      assert.match(real.result?.submitConfirmation ?? "", /^DETECTED_HTTP_/);
      assert.ok(real.result?.submissionReceiptJson, "submission evidence stored");
      const receipt = JSON.parse(real.result!.submissionReceiptJson!);
      assert.equal(receipt.provider, "recruitee");
      assert.ok(receipt.receiptId);
    }
    record("b. real-submit one POST / success / evidence", realPosts.length);

    // c. Concurrent real-submit retries
    for (const [slug, n] of [["race-two", 2], ["race-ten", 10]] as const) {
      fake.requests.length = 0;
      await withClients(databaseUrl, n, async (clients) => {
        const runs = await Promise.all(clients.map((client) =>
          prepareAndRunAtsTest({ adminOk: true, realSubmit: true, jobUrl: destUrl(slug) }, asDeps(client, realEnv)),
        ));
        const ok = runs.filter((run) => run.ok);
        const denied = runs.filter((run) => !run.ok);
        assert.equal(ok.length, 1, `${n}-way: exactly one winner`);
        assert.equal(denied.length, n - 1);
        for (const loss of denied) {
          assert.equal(loss.ok, false);
          if (!loss.ok) {
            assert.equal(loss.status, 409);
            // Losers that still see ATS_TEST_CLAIMED get in_progress. Losers
            // that start after the winner finished get already_attempted.
            assert.ok(
              loss.reason === ATS_TEST_IN_PROGRESS || loss.reason === "ats_test_already_attempted",
              `${n}-way loser 409 reason: ${loss.reason}`,
            );
          }
        }
      });
      const count = postsOf(fake.requests).length;
      assert.equal(count, 1, `${n}-way: exactly one POST`);
      record(`c. concurrent real-submit ${n}-way: one POST, losers 409`, count);
    }

    // d. Non-allowlisted / wrong user / non-diagnostic
    fake.requests.length = 0;
    const foreign = await prepareAndRunAtsTest(
      { adminOk: true, realSubmit: true, jobUrl: "https://other.recruitee.com/o/not-listed" },
      asDeps(prisma, realEnv),
    );
    assert.equal(foreign.ok, false);
    if (!foreign.ok) assert.equal(foreign.reason, "ats_test_destination_not_allowlisted");

    const missingUser = await prepareAndRunAtsTest(
      { adminOk: true, realSubmit: true, jobUrl: destUrl("cv-required") },
      asDeps(prisma, { ...realEnv, ATS_TEST_USER_ID: "wrong-user" }),
    );
    assert.equal(missingUser.ok, false);
    if (!missingUser.ok) assert.equal(missingUser.reason, "ats_test_user_missing");

    const other = await prisma.user.create({ data: { id: "ordinary-user", email: "ordinary@example.invalid" } });
    const ordinaryJob = await prisma.job.create({
      data: {
        externalId: "ordinary-job",
        source: "recruitee",
        title: "Ordinary",
        description: "Not an ATS test job",
        url: destUrl("cv-required"),
      },
    });
    const ordinaryApp = await prisma.application.create({
      data: { userId: other.id, jobId: ordinaryJob.id, portal: "recruitee", status: "queued" },
    });
    await processApplication(ordinaryApp.id);
    await processApplication(ordinaryApp.id, { atsTestAuth: { userId: TEST_USER, applicationId: ordinaryApp.id } as never });
    assert.equal(postsOf(fake.requests).length, 0);
    record("d. non-allowlisted / wrong user / non-diagnostic: zero POSTs", 0);

    // e. Required CV missing — adapter path on the same fake HTTPS server
    fake.requests.length = 0;
    const { syntheticAtsTestProfile } = await import("../src/lib/ats-test-capability");
    const missingCv = await recruiteeAdapter.apply({} as never, {
      profile: syntheticAtsTestProfile(),
      userEmail: "user@example.test",
      cvLocalPath: join(dir, "does-not-exist.docx"),
      clLocalPath: join(dir, "does-not-exist.docx"),
      coverLetterText: "synthetic",
      jobUrl: destUrl("cv-required"),
      dryRun: false,
      applicationId: "not-a-diagnostic-id",
    });
    assert.equal(missingCv.ok, false);
    if (!missingCv.ok) {
      assert.equal(missingCv.status, "missing_field");
      assert.equal(missingCv.refusedBeforeSubmit, true);
    }
    assert.ok(getsOf(fake.requests).some((row) => row.path.includes("cv-required")));
    assert.equal(postsOf(fake.requests).length, 0);
    record("e. required CV missing: refused before POST", 0);

    // f. POST then 500 → UNCONFIRMED; retry makes no second POST
    fake.requests.length = 0;
    fake.postBehavior.set("server-500", "error500");
    const failed = await prepareAndRunAtsTest(
      { adminOk: true, realSubmit: true, jobUrl: destUrl("server-500") },
      asDeps(prisma, realEnv),
    );
    assert.equal(failed.ok, true, "prepareAndRun reports the process finished");
    if (failed.ok) {
      assert.equal(failed.result?.submitConfirmation, "UNCONFIRMED");
      assert.notEqual(failed.result?.status, "success");
    }
    assert.equal(postsOf(fake.requests).length, 1);
    const retry = await prepareAndRunAtsTest(
      { adminOk: true, realSubmit: true, jobUrl: destUrl("server-500") },
      asDeps(prisma, realEnv),
    );
    assert.equal(retry.ok, false);
    if (!retry.ok) assert.equal(retry.reason, "uncertain_submission");
    assert.equal(postsOf(fake.requests).length, 1, "uncertain result is non-retryable: no second POST");
    record("f. POST 500 → UNCONFIRMED, retry does not POST again", 1);

    // g. No tailoring / recruiter-lookup HTTP
    assert.equal(forbidden.filter((url) => /openai|anthropic|linkedin|careers\.|httpbin/i.test(url)).length, 0);
    assert.equal(await prisma.cVProfile.count({ where: { userId: TEST_USER } }), 0, "ATS path must not write a CVProfile");
    const testJobs = await prisma.job.findMany({ where: { source: ATS_TEST_JOB_SOURCE } });
    assert.ok(testJobs.every((job) => !job.recruiterEmail), "ATS path must not write recruiterEmail");
    record("g. no tailoring or recruiter-lookup calls", 0);

    // h. No EmailLog / email-provider
    const logs = await prisma.emailLog.count({ where: { createdAt: { gte: emailBaseline } } });
    assert.equal(logs, 0, "ATS e2e must not create EmailLog rows");
    assert.equal(forbidden.filter((url) => /resend\.com|api\.resend/i.test(url)).length, 0);
    record("h. no EmailLog rows or email-provider calls", 0);

    // j. Forced needs_user_input / captcha / form_not_found: no notices
    const originalApply = recruiteeAdapter.apply.bind(recruiteeAdapter);
    recruiteeAdapter.apply = async (page, input) => {
      const slug = new URL(input.jobUrl).pathname.match(/\/o\/([^/?#]+)/)?.[1] ?? "";
      if (slug === "needs-answers") {
        return {
          ok: false,
          status: "needs_user_input",
          error: "forced needs_user_input",
          pendingQuestions: [{ label: "Work authorization declaration only the candidate can answer", kind: "text" }],
        };
      }
      if (slug === "force-captcha") {
        return { ok: false, status: "captcha", error: "forced captcha" };
      }
      if (slug === "no-form") {
        return { ok: false, status: "form_not_found", error: "forced form_not_found" };
      }
      if (slug === "missing-cv") {
        return { ok: false, status: "missing_field", error: "synthetic unreadable attachment", refusedBeforeSubmit: true };
      }
      return originalApply(page, input);
    };
    const previousPaused = process.env.APPLICATIONS_PAUSED;
    const previousResend = process.env.RESEND_API_KEY;
    process.env.RESEND_API_KEY = "re_test_forced_notify";
    process.env.APPLICATIONS_PAUSED = "false";
    const noticeCases = [
      { slug: "missing-cv", name: "j. unreadable CV: truthful refusal and zero notices", expect: (row: { status: string | null; submitConfirmation: string | null }) => {
        assert.equal(row.status, "ready_to_apply");
        assert.equal(row.submitConfirmation, "REFUSED_BEFORE_SUBMIT");
      } },
      { slug: "needs-answers", name: "j. needs_user_input: zero notices", expect: (row: { status: string | null; submitConfirmation: string | null }) => {
        assert.equal(row.status, "needs_answers");
      } },
      { slug: "force-captcha", name: "j. captcha: zero notices", expect: (row: { status: string | null; submitConfirmation: string | null }) => {
        assert.equal(row.submitConfirmation, "CAPTCHA");
      } },
      { slug: "no-form", name: "j. form_not_found/no-recruiter: zero notices", expect: (row: { status: string | null; submitConfirmation: string | null }) => {
        assert.notEqual(row.status, "success");
        assert.notEqual(row.submitConfirmation, "EMAIL_SENT");
      } },
    ] as const;
    try {
      for (const item of noticeCases) {
        fake.requests.length = 0;
        const noticeBaseline = new Date();
        const run = await prepareAndRunAtsTest(
          { adminOk: true, realSubmit: true, jobUrl: destUrl(item.slug) },
          asDeps(prisma, realEnv),
        );
        assert.equal(run.ok, true, `${item.slug} must finish the token path`);
        if (run.ok) item.expect(run.result ?? { status: null, submitConfirmation: null });
        if (item.slug === "missing-cv") {
          const id = atsTestApplicationId(parseAtsTestDestinations(env).find((d) => d.slug === item.slug)!);
          const row = await prisma.application.findUniqueOrThrow({ where: { id } });
          assert.equal(row.leaseToken, null);
          assert.equal(row.leaseExpiresAt, null);
          assert.equal(row.completedAt, null);
        }
        assert.equal(postsOf(fake.requests).length, 0, `${item.slug}: zero Recruitee POSTs`);
        assert.equal(await prisma.emailLog.count({ where: { createdAt: { gte: noticeBaseline } } }), 0, `${item.slug}: EmailLog`);
        assert.equal(await prisma.conversionEvent.count({ where: { createdAt: { gte: noticeBaseline } } }), 0, `${item.slug}: ConversionEvent`);
        assert.equal(forbidden.filter((url) => /resend\.com|api\.resend/i.test(url)).length, 0, `${item.slug}: no email-provider calls`);
        record(item.name, 0);
      }
    } finally {
      recruiteeAdapter.apply = originalApply;
      if (previousPaused === undefined) delete process.env.APPLICATIONS_PAUSED;
      else process.env.APPLICATIONS_PAUSED = previousPaused;
      if (previousResend === undefined) delete process.env.RESEND_API_KEY;
      else process.env.RESEND_API_KEY = previousResend;
    }

    // i. Cron/worker without branded token cannot use the exemption
    fake.requests.length = 0;
    const diagnosticId = atsTestApplicationId(parseAtsTestDestinations(env).find((d) => d.slug === "real-optional")!);
    const postsBefore = postsOf(fake.requests).length;
    await processApplication(diagnosticId);
    await processApplication(ordinaryApp.id);
    let drainCalls = 0;
    const drain = await drainQueuedApplications({
      processApplication: async () => { drainCalls += 1; },
      findClaimableQueued: async () => [diagnosticId, ordinaryApp.id],
      claimApplication: async () => true,
    });
    assert.equal(drain.attempted, 0);
    assert.equal(drainCalls, 0, "paused drain must not call processApplication");
    assert.equal(postsOf(fake.requests).length, postsBefore);
    record("i. cron/worker without test token cannot use the exemption", 0);

    console.log("HOST DETECTION: matches()/apply() require a provider-owned HTTPS tenant origin and offer path. Tests keep recruitee.com URLs and rewrite fetch in-process to 127.0.0.1 with a test CA.");
    console.log("ALL ATS TEST E2E CHECKS PASSED. Fake Recruitee HTTPS + throwaway Postgres only.");
    console.log("CASE POST COUNTS:", results.map((row) => `${row.name}=${row.posts}`).join(" | "));
  } finally {
    restoreFetch();
    delete process.env.ATS_TEST_REAL_SUBMIT;
    if (db) await db.$disconnect();
    await fake.close();
    if (pg) await pg.stop();
    await rm(dir, { recursive: true, force: true });
    await rm(join(process.cwd(), "storage", "users", TEST_USER), { recursive: true, force: true }).catch(() => undefined);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
