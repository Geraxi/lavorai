/**
 * Real-Postgres proof that claimAtsTestAttempt is at-most-once.
 * Uses only a throwaway localhost fixture (CI service or embedded-postgres).
 * Never Neon, never production, never ambient DATABASE_URL.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import {
  ATS_TEST_CLAIMED,
  ATS_TEST_IN_PROGRESS,
  ATS_TEST_JOB_SOURCE,
  ATS_TEST_REFUSED_BEFORE_SUBMIT,
  atsTestApplicationId,
  atsTestJobExternalId,
  claimAtsTestAttempt,
  parseAtsTestDestinations,
  prepareAndRunAtsTest,
  type AtsTestDeps,
} from "../src/lib/ats-test-capability";

const TEST_USER = "ats-test-user-1";
const DEST = "produzioneweb.recruitee.com/o/trial-offer";
const DEST2 = "produzioneweb.recruitee.com/o/real-offer";
const DEST2_URL = "https://produzioneweb.recruitee.com/o/real-offer";
const CANDIDATE_EMAIL = "owner-mailbox@example.test";
const FIXTURE_DB = /^\/lavorai_ats_test_claim_test(?:_[a-z0-9]+)?$/;
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

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

async function seedRefusedRow(
  db: PrismaClient,
  destSlug: string,
  destUrl: string,
): Promise<{ applicationId: string; jobId: string }> {
  const dest = parseAtsTestDestinations({ ATS_TEST_DESTINATIONS: destSlug })[0];
  assert.ok(dest, `destination ${destSlug} must parse`);
  const applicationId = atsTestApplicationId(dest);
  const externalId = atsTestJobExternalId(dest);
  const now = new Date();
  await db.user.upsert({
    where: { id: TEST_USER },
    update: {},
    create: {
      id: TEST_USER,
      email: "ats-claim-postgres@example.invalid",
      tier: "pro",
      emailVerified: now,
      privacyConsentAt: now,
    },
  });
  const job = await db.job.upsert({
    where: { externalId_source: { externalId, source: ATS_TEST_JOB_SOURCE } },
    update: { url: destUrl, closedAt: null, cachedAt: now },
    create: {
      externalId,
      source: ATS_TEST_JOB_SOURCE,
      title: dest.slug,
      company: "ATS claim fixture",
      location: "ATS test",
      description: "Throwaway ATS-test claim fixture. Never a real offer.",
      url: destUrl,
      sourceSlug: dest.host.split(".")[0] ?? null,
    },
  });
  await db.application.deleteMany({ where: { id: applicationId } });
  await db.application.create({
    data: {
      id: applicationId,
      userId: TEST_USER,
      jobId: job.id,
      portal: "recruitee",
      status: "ready_to_apply",
      submitConfirmation: ATS_TEST_REFUSED_BEFORE_SUBMIT,
      submitStartedAt: null,
      submittedAt: null,
      submittedVia: null,
      consentGrantedAt: now,
      createdAt: now,
    },
  });
  return { applicationId, jobId: job.id };
}

async function resetRefused(db: PrismaClient, applicationId: string) {
  await db.application.update({
    where: { id: applicationId },
    data: {
      status: "ready_to_apply",
      submitConfirmation: ATS_TEST_REFUSED_BEFORE_SUBMIT,
      leaseToken: null,
      leaseExpiresAt: null,
      startedAt: null,
      errorMessage: null,
      completedAt: null,
      submitStartedAt: null,
      submittedAt: null,
      submittedVia: null,
    },
  });
}

async function assertClaimedOnce(db: PrismaClient, applicationId: string, concurrency: number, results: Array<{ ok: boolean; reason?: string }>) {
  const wins = results.filter((result) => result.ok);
  const losses = results.filter((result) => !result.ok);
  assert.equal(wins.length, 1, `${concurrency}-way: exactly one claim must succeed`);
  assert.equal(losses.length, concurrency - 1, `${concurrency}-way: remaining claims must lose`);
  for (const loss of losses) {
    assert.equal(loss.ok, false);
    assert.equal(loss.reason, ATS_TEST_IN_PROGRESS, `${concurrency}-way loser must be ats_test_in_progress`);
  }
  const row = await db.application.findUniqueOrThrow({ where: { id: applicationId } });
  assert.equal(row.status, "optimizing", `${concurrency}-way row must end optimizing`);
  assert.equal(row.submitConfirmation, ATS_TEST_CLAIMED, `${concurrency}-way row must be ATS_TEST_CLAIMED`);
  assert.ok(row.leaseToken, `${concurrency}-way row must have a leaseToken`);
  assert.equal(
    await db.application.count({ where: { id: applicationId, leaseToken: row.leaseToken } }),
    1,
    `${concurrency}-way: exactly one leaseToken on the claimed row`,
  );
}

function asDeps(client: PrismaClient, processApplication: AtsTestDeps["processApplication"], env: NodeJS.ProcessEnv): AtsTestDeps {
  return {
    env,
    prisma: client as unknown as AtsTestDeps["prisma"],
    processApplication,
    findPortalAdapter: (url) => (url.includes("recruitee.com") ? { id: "recruitee" } : null),
  };
}

async function main() {
  const port = 55456;
  const fixtureUrl = process.env.ATS_TEST_CLAIM_DATABASE_URL;
  if (fixtureUrl) {
    const target = refuseRemoteUrl(fixtureUrl, "ATS_TEST_CLAIM_DATABASE_URL");
    assert.match(target.pathname, FIXTURE_DB, "Test database must have a dedicated fixture name");
  }
  const databaseUrl = fixtureUrl ?? `postgresql://postgres:password@127.0.0.1:${port}/postgres?connection_limit=16`;
  refuseRemoteUrl(databaseUrl, "resolved test DATABASE_URL");
  process.env.DATABASE_URL = databaseUrl;
  process.env.DIRECT_URL = databaseUrl;
  (process.env as Record<string, string>).NODE_ENV = "test";
  process.env.ATS_TEST_USER_ID = TEST_USER;
  process.env.ATS_TEST_DESTINATIONS = `${DEST} ${DEST2}`;
  process.env.ATS_TEST_CANDIDATE_EMAIL = CANDIDATE_EMAIL;
  delete process.env.ATS_TEST_REAL_SUBMIT;
  process.env.APPLICATIONS_PAUSED = "true";

  const dir = await mkdtemp(join(tmpdir(), "lavorai-ats-test-claim-postgres-"));
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

  let db: PrismaClient | undefined;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    throw new Error("NETWORK_FORBIDDEN_IN_ATS_TEST_CLAIM_POSTGRES");
  }) as typeof fetch;

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
    const resolved = new URL(databaseUrl);
    console.log(`Using throwaway PostgreSQL ${resolved.hostname}${resolved.pathname} (prisma db push)`);

    const { applicationId } = await seedRefusedRow(db, DEST, `https://${DEST}`);

    await withClients(databaseUrl, 2, async (clients) => {
      const results = await Promise.all(clients.map((client) => claimAtsTestAttempt(client, applicationId)));
      await assertClaimedOnce(db!, applicationId, 2, results);
    });
    console.log("PASS PostgreSQL: two concurrent claimAtsTestAttempt calls on separate connections: exactly one ok, one ats_test_in_progress; row optimizing + ATS_TEST_CLAIMED with one leaseToken.");

    await resetRefused(db, applicationId);
    await withClients(databaseUrl, 10, async (clients) => {
      const results = await Promise.all(clients.map((client) => claimAtsTestAttempt(client, applicationId)));
      await assertClaimedOnce(db!, applicationId, 10, results);
    });
    console.log("PASS PostgreSQL: ten concurrent claimAtsTestAttempt calls on separate connections: exactly one ok, nine ats_test_in_progress; one leaseToken.");

    const realDest = await seedRefusedRow(db, DEST2, DEST2_URL);
    const posts: string[] = [];
    const processCalls = { count: 0 };
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const method = (init?.method ?? "GET").toUpperCase();
      if (method === "POST") {
        posts.push(String(input));
        return new Response(JSON.stringify({ candidate: { id: "synthetic-receipt" } }), {
          status: 201,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ offer: { status: "published", open_questions: [] } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;

    const runEnv = {
      ...process.env,
      ATS_TEST_USER_ID: TEST_USER,
      ATS_TEST_DESTINATIONS: `${DEST} ${DEST2}`,
      ATS_TEST_CANDIDATE_EMAIL: CANDIDATE_EMAIL,
      ATS_TEST_REAL_SUBMIT: "true",
    };
    process.env.ATS_TEST_REAL_SUBMIT = "true";

    const processApplication: AtsTestDeps["processApplication"] = async () => {
      processCalls.count++;
      await fetch("https://produzioneweb.recruitee.com/api/offers/real-offer/candidates", {
        method: "POST",
        body: JSON.stringify({ synthetic: true }),
      });
    };

    await withClients(databaseUrl, 2, async (clients) => {
      const [first, second] = await Promise.all([
        prepareAndRunAtsTest({ adminOk: true, realSubmit: true, jobUrl: DEST2_URL }, asDeps(clients[0], processApplication, runEnv)),
        prepareAndRunAtsTest({ adminOk: true, realSubmit: true, jobUrl: DEST2_URL }, asDeps(clients[1], processApplication, runEnv)),
      ]);
      const ok = [first, second].filter((run) => run.ok);
      const denied = [first, second].filter((run) => !run.ok);
      assert.equal(ok.length, 1, "real-submit: exactly one retry proceeds");
      assert.equal(denied.length, 1, "real-submit: loser is 409");
      if (!denied[0].ok) {
        assert.equal(denied[0].reason, ATS_TEST_IN_PROGRESS);
        assert.equal(denied[0].status, 409);
      }
      assert.equal(processCalls.count, 1, "real-submit: processApplication once");
      assert.equal(posts.length, 1, "real-submit retries POST exactly once");
    });

    const claimed = await db.application.findUniqueOrThrow({ where: { id: realDest.applicationId } });
    assert.equal(claimed.status, "optimizing");
    assert.equal(claimed.submitConfirmation, ATS_TEST_CLAIMED);
    assert.ok(claimed.leaseToken);
    console.log("PASS PostgreSQL: two concurrent prepareAndRunAtsTest real-submit retries: exactly one POST, loser 409.");
    console.log("ALL ATS TEST CLAIM POSTGRES CHECKS PASSED. Throwaway localhost PostgreSQL only; zero Neon/production access; zero real Recruitee POSTs.");
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.ATS_TEST_REAL_SUBMIT;
    if (db) await db.$disconnect();
    if (pg) await pg.stop();
    await rm(dir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
