/**
 * 24/10 `_prisma_migrations` history is per-migration: verify objects on EU,
 * then insert that one history row. No blanket insert. No migrate deploy.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";

export const RECONCILE_20261024_MIGRATIONS = [
  "20261024160000_recruiter_email_source_url",
  "20261024180000_employer_hiring_inbox",
  "20261024190000_recruiter_email_recheck",
  "20261024190000_greenhouse_job_form",
  "20261024200000_application_mailbox",
  "20261024210000_job_description_full",
  "20261024220000_job_description_fetch_backoff",
] as const;

export function prismaMigrationChecksum(sql: string): string {
  return createHash("sha256").update(sql, "utf8").digest("hex");
}

export function prismaHistoryRowId(migrationName: string): string {
  const hex = createHash("sha256").update(`prisma_history:${migrationName}`, "utf8").digest("hex").slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const superseded = readFileSync("scripts/reconcile-20261024-prisma-migrations.sql", "utf8");
assert.match(superseded, /SUPERSEDED/);
assert.match(superseded, /per-migration procedure/);
assert.doesNotMatch(superseded, /INSERT INTO "_prisma_migrations"/);
assert.doesNotMatch(superseded, /^\s*(CREATE|ALTER|DROP)\s/im);
assert.match(superseded, /prisma migrate deploy` must NOT be run/);

const readme = readFileSync("scripts/prisma-history/README.md", "utf8");
assert.match(readme, /per-migration procedure/i);
assert.match(readme, /objects_match = true/);
assert.match(readme, /Do not batch-insert/);
assert.match(readme, /Never run `prisma migrate deploy`/);

for (const name of RECONCILE_20261024_MIGRATIONS) {
  const verifyPath = `scripts/prisma-history/${name}.verify.sql`;
  const insertPath = `scripts/prisma-history/${name}.insert.sql`;
  assert.equal(existsSync(verifyPath), true, verifyPath);
  assert.equal(existsSync(insertPath), true, insertPath);
  const verify = readFileSync(verifyPath, "utf8");
  const insert = readFileSync(insertPath, "utf8");
  assert.match(verify, /information_schema\.columns/);
  assert.match(verify, /objects_match/);
  assert.match(verify, /mismatch_count/);
  assert.match(verify, /is_nullable|data_type/);
  assert.doesNotMatch(verify, /INSERT INTO/);
  assert.doesNotMatch(verify, /^\s*(CREATE|ALTER|DROP)\s/im);
  assert.match(insert, /REVIEWED, NOT APPLIED/);
  assert.match(insert, /INSERT INTO "_prisma_migrations"/);
  assert.doesNotMatch(insert, /^\s*(CREATE|ALTER|DROP)\s/im);
  const sql = readFileSync(`prisma/migrations/${name}/migration.sql`, "utf8");
  const checksum = prismaMigrationChecksum(sql);
  const id = prismaHistoryRowId(name);
  assert.match(insert, new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(insert, new RegExp(checksum));
  assert.match(insert, new RegExp(id));
  assert.equal((insert.match(/INSERT INTO "_prisma_migrations"/g) ?? []).length, 1, `${name} insert is one row only`);
}

assert.equal(RECONCILE_20261024_MIGRATIONS.length, 7);
console.log("PASS prisma migration history: per-migration verify-then-insert; checksums match; no blanket insert");
