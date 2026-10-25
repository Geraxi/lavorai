/**
 * Fail-closed EU guard: wrong host, wrong database, wrong schema, or a
 * missing fingerprint must abort. Tests inject the live query. They never
 * connect to a real database and never print URLs or passwords.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync, constants as fsConstants, accessSync } from "node:fs";
import {
  EU_HOST,
  US_HOST_MARKER,
  EXPECTED_DATABASE,
  EXPECTED_SCHEMA,
  FINGERPRINT_MIGRATION,
  EuTargetError,
  assertEuTarget,
  parsePostgresTarget,
  type EuQuery,
  type FingerprintRow,
  type IdentityRow,
} from "./ops/assert-eu-target";

const SECRET = "super-secret-password-do-not-print";
const EU_URL = `postgresql://lavorai:${SECRET}@${EU_HOST}/${EXPECTED_DATABASE}?sslmode=require`;
const US_URL = `postgresql://lavorai:${SECRET}@${US_HOST_MARKER}.c-3.us-east-1.aws.neon.tech/${EXPECTED_DATABASE}`;
const OTHER_HOST_URL = `postgresql://lavorai:${SECRET}@ep-other-host.c-3.eu-central-1.aws.neon.tech/${EXPECTED_DATABASE}`;
const WRONG_DB_URL = `postgresql://lavorai:${SECRET}@${EU_HOST}/otherdb`;

function okIdentity(overrides: Partial<IdentityRow> = {}): IdentityRow {
  return {
    current_database: EXPECTED_DATABASE,
    current_schema: EXPECTED_SCHEMA,
    inet_server_addr: "10.0.0.1",
    ...overrides,
  };
}

function okFingerprint(overrides: Partial<FingerprintRow> = {}): FingerprintRow {
  return { evidence_exists: true, application_count: 4, ...overrides };
}

function queryOf(identity: IdentityRow, fingerprint: FingerprintRow, calls?: { identity: number; fingerprint: number }): EuQuery {
  return {
    identity: async () => {
      if (calls) calls.identity += 1;
      return identity;
    },
    fingerprint: async () => {
      if (calls) calls.fingerprint += 1;
      return fingerprint;
    },
  };
}

function envOf(direct = EU_URL, database = EU_URL): NodeJS.ProcessEnv {
  return { DIRECT_URL: direct, DATABASE_URL: database };
}

async function expectAbort(env: NodeJS.ProcessEnv, query: EuQuery, message: RegExp | string, calls?: { identity: number; fingerprint: number }) {
  const lines: string[] = [];
  await assert.rejects(
    () => assertEuTarget(env, query, (line) => lines.push(line)),
    (error: unknown) => {
      assert.ok(error instanceof EuTargetError, "must throw EuTargetError");
      if (typeof message === "string") assert.equal(error.message, message);
      else assert.match(error.message, message);
      assert.doesNotMatch(error.message, /postgresql:\/\//);
      assert.doesNotMatch(error.message, new RegExp(SECRET));
      return true;
    },
  );
  for (const line of lines) {
    assert.doesNotMatch(line, /postgresql:\/\//);
    assert.doesNotMatch(line, new RegExp(SECRET));
  }
  return lines;
}

async function testHappyPath() {
  const lines: string[] = [];
  const calls = { identity: 0, fingerprint: 0 };
  await assertEuTarget(envOf(), queryOf(okIdentity(), okFingerprint(), calls), (line) => lines.push(line));
  assert.equal(calls.identity, 1);
  assert.equal(calls.fingerprint, 1);
  assert.deepEqual(lines, [
    `DIRECT_URL host: ${EU_HOST}`,
    `DATABASE_URL host: ${EU_HOST}`,
    "EU target confirmed",
  ]);
  for (const line of lines) {
    assert.doesNotMatch(line, /postgresql:\/\//);
    assert.doesNotMatch(line, new RegExp(SECRET));
  }
}

async function testWrongHost() {
  const calls = { identity: 0, fingerprint: 0 };
  const q = queryOf(okIdentity(), okFingerprint(), calls);
  await expectAbort(envOf(OTHER_HOST_URL, OTHER_HOST_URL), q, "ABORT: host is not EU", calls);
  await expectAbort(envOf(OTHER_HOST_URL, EU_URL), q, "ABORT: host is not EU", calls);
  await expectAbort(envOf(EU_URL, OTHER_HOST_URL), q, "ABORT: host is not EU", calls);
  assert.equal(calls.identity, 0, "wrong host must not query");
  assert.equal(calls.fingerprint, 0);
}

async function testUsHostNowhere() {
  const calls = { identity: 0, fingerprint: 0 };
  const q = queryOf(okIdentity(), okFingerprint(), calls);
  await expectAbort(envOf(US_URL, EU_URL), q, "ABORT: US host marker present", calls);
  await expectAbort(envOf(EU_URL, US_URL), q, "ABORT: US host marker present", calls);
  await expectAbort(
    envOf(`postgresql://lavorai:${US_HOST_MARKER}@${EU_HOST}/${EXPECTED_DATABASE}`, EU_URL),
    q,
    "ABORT: US host marker present",
    calls,
  );
  assert.equal(calls.identity, 0);
  assert.equal(calls.fingerprint, 0);
}

async function testWrongDatabaseName() {
  const calls = { identity: 0, fingerprint: 0 };
  const q = queryOf(okIdentity(), okFingerprint(), calls);
  await expectAbort(envOf(WRONG_DB_URL, WRONG_DB_URL), q, "ABORT: database name mismatch", calls);
  await expectAbort(envOf(EU_URL, WRONG_DB_URL), q, "ABORT: DIRECT_URL and DATABASE_URL databases differ", calls);
  const liveWrong = queryOf(okIdentity({ current_database: "otherdb" }), okFingerprint(), calls);
  await expectAbort(envOf(), liveWrong, "ABORT: live database name mismatch");
  assert.equal(calls.identity, 1, "live database mismatch is after connect");
  assert.equal(calls.fingerprint, 0);
}

async function testWrongSchema() {
  const calls = { identity: 0, fingerprint: 0 };
  await expectAbort(
    envOf(),
    queryOf(okIdentity({ current_schema: "other" }), okFingerprint(), calls),
    "ABORT: schema mismatch",
  );
  assert.equal(calls.identity, 1);
  assert.equal(calls.fingerprint, 0, "wrong schema must not run fingerprint");
}

async function testMissingFingerprint() {
  const missingRow = { identity: 0, fingerprint: 0 };
  await expectAbort(
    envOf(),
    queryOf(okIdentity(), okFingerprint({ evidence_exists: false }), missingRow),
    "ABORT: fingerprint migration missing",
  );
  assert.equal(missingRow.fingerprint, 1);
  const zeroApps = { identity: 0, fingerprint: 0 };
  await expectAbort(
    envOf(),
    queryOf(okIdentity(), okFingerprint({ application_count: 0 }), zeroApps),
    "ABORT: fingerprint application count is zero",
  );
  assert.equal(zeroApps.fingerprint, 1);
}

async function testMissingEnvAndParse() {
  const q = queryOf(okIdentity(), okFingerprint());
  await expectAbort({}, q, "ABORT: missing DIRECT_URL or DATABASE_URL");
  await expectAbort({ DIRECT_URL: EU_URL }, q, "ABORT: missing DIRECT_URL or DATABASE_URL");
  await expectAbort(envOf("not-a-url", EU_URL), q, "ABORT: unparseable database URL");
  assert.deepEqual(parsePostgresTarget(EU_URL), { host: EU_HOST, database: EXPECTED_DATABASE });
}

function testShellAndDocs() {
  assert.equal(existsSync("scripts/ops/assert-eu-target.sh"), true);
  assert.equal(existsSync("scripts/ops/assert-eu-target.ts"), true);
  accessSync("scripts/ops/assert-eu-target.sh", fsConstants.X_OK);
  const sh = readFileSync("scripts/ops/assert-eu-target.sh", "utf8");
  assert.match(sh, /^set -euo pipefail/m);
  assert.match(sh, /assert-eu-target\.ts/);
  assert.doesNotMatch(sh, /echo .*DIRECT_URL|echo .*DATABASE_URL|printf '%s' "\$DIRECT_URL"/);

  const history = readFileSync("docs/ops/migration-history-resolution-20261024.md", "utf8");
  assert.match(history, /\(A\)/);
  assert.match(history, /docs\/ops\/new-schema-migrations\.md/);
  assert.match(history, /assert-eu-target\.sh/);
  assert.match(history, /set -euo pipefail/);
  assert.doesNotMatch(history, /20261025140000_email_test_attempt/);
  assert.doesNotMatch(history, /20261025020000_application_release_budget/);
  assert.doesNotMatch(history, /20261025150000_email_log_outcome/);

  const schemaDoc = readFileSync("docs/ops/new-schema-migrations.md", "utf8");
  assert.match(schemaDoc, /\(B\)/);
  assert.match(schemaDoc, /20261025140000_email_test_attempt/);
  assert.match(schemaDoc, /required for the one owned-destination email test/i);
  assert.match(schemaDoc, /not required/i);
  assert.match(schemaDoc, /20261025020000_application_release_budget/);
  assert.match(schemaDoc, /20261025150000_email_log_outcome/);
  assert.match(schemaDoc, /prisma generate && next build/);
  assert.match(schemaDoc, /\(A\) is not required/i);
  assert.match(schemaDoc, /assert-eu-target\.sh/);
  assert.doesNotMatch(schemaDoc, /npx prisma migrate deploy/);

  const capability = readFileSync("src/lib/email-test-capability.ts", "utf8");
  assert.doesNotMatch(capability, /application-recovery-release|ApplicationReleaseBatch|ApplicationReleaseGrant/);
  assert.doesNotMatch(capability, /email_log_outcome|EmailLog/);

  assert.match(readFileSync("vercel.json", "utf8"), /prisma generate && next build/);
  assert.equal(FINGERPRINT_MIGRATION, "20261025003000_submission_attempt_evidence");
}

async function main() {
  testShellAndDocs();
  await testHappyPath();
  await testWrongHost();
  await testUsHostNowhere();
  await testWrongDatabaseName();
  await testWrongSchema();
  await testMissingFingerprint();
  await testMissingEnvAndParse();
  console.log("PASS assert-eu-target: wrong host/db/schema/fingerprint fail closed; hostnames only");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
