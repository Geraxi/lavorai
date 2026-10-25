/**
 * The reviewed 24/10 `_prisma_migrations` insert script must carry Prisma's
 * SHA-256 checksum of each migration.sql (UTF-8) and must not apply schema.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

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

const script = readFileSync("scripts/reconcile-20261024-prisma-migrations.sql", "utf8");
assert.match(script, /REVIEWED, NOT APPLIED/);
assert.match(script, /prisma migrate deploy` must NOT be run/);
assert.doesNotMatch(script, /^\s*(CREATE|ALTER|DROP)\s/im);
assert.match(script, /INSERT INTO "_prisma_migrations"/);

for (const name of RECONCILE_20261024_MIGRATIONS) {
  const sql = readFileSync(`prisma/migrations/${name}/migration.sql`, "utf8");
  const checksum = prismaMigrationChecksum(sql);
  const id = prismaHistoryRowId(name);
  assert.match(script, new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(script, new RegExp(checksum));
  assert.match(script, new RegExp(id));
}

assert.equal(RECONCILE_20261024_MIGRATIONS.length, 7);
console.log("PASS prisma migration history: 7 reviewed checksums match migration.sql UTF-8 SHA-256; script inserts history only");
