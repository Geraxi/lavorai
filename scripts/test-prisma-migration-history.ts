/**
 * 24/10 `_prisma_migrations` history is per-migration on EU:
 * verify objects, then `prisma migrate resolve --applied <name>`.
 * No blanket SQL. No migrate deploy until all seven are resolved.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";

export const RECONCILE_20261024_MIGRATIONS = [
  "20261024160000_recruiter_email_source_url",
  "20261024180000_employer_hiring_inbox",
  "20261024190000_greenhouse_job_form",
  "20261024190000_recruiter_email_recheck",
  "20261024200000_application_mailbox",
  "20261024210000_job_description_full",
  "20261024220000_job_description_fetch_backoff",
] as const;

export function prismaMigrationChecksum(sql: string): string {
  return createHash("sha256").update(sql, "utf8").digest("hex");
}

assert.equal(existsSync("scripts/reconcile-20261024-prisma-migrations.sql"), false, "blanket reconcile SQL must be removed");

const readme = readFileSync("scripts/prisma-history/README.md", "utf8");
assert.match(readme, /docs\/ops\/migration-history-resolution-20261024\.md/);
assert.match(readme, /prisma migrate resolve --applied/);
assert.match(readme, /Never run `prisma migrate deploy`/);
assert.match(readme, /20261024190000_greenhouse_job_form` before/);

const doc = readFileSync("docs/ops/migration-history-resolution-20261024.md", "utf8");
assert.match(doc, /25\/10 14:08 CET/);
assert.match(doc, /ep-gentle-butterfly-aljrsiuw\.c-3\.eu-central-1\.aws\.neon\.tech/);
assert.match(doc, /read -rs DIRECT_URL/);
assert.match(doc, /read -rs DATABASE_URL/);
assert.match(doc, /US host is never used/);
assert.match(doc, /prisma migrate resolve --applied/);
assert.match(doc, /prisma migrate status/);
assert.match(doc, /prisma migrate diff --exit-code/);
assert.match(doc, /pending approval/);
assert.match(doc, /migrate deploy` stays prohibited/);
assert.ok(
  doc.indexOf("20261024190000_greenhouse_job_form") < doc.indexOf("npx prisma migrate resolve --applied 20261024190000_recruiter_email_recheck"),
  "Prisma sort order: greenhouse_job_form before recruiter_email_recheck",
);

for (const name of RECONCILE_20261024_MIGRATIONS) {
  const verifyPath = `scripts/prisma-history/${name}.verify.sql`;
  assert.equal(existsSync(verifyPath), true, verifyPath);
  const verify = readFileSync(verifyPath, "utf8");
  assert.match(verify, /information_schema\.columns/);
  assert.match(verify, /objects_match/);
  assert.match(verify, /mismatch_count/);
  assert.doesNotMatch(verify, /INSERT INTO/);
  assert.doesNotMatch(verify, /^\s*(CREATE|ALTER|DROP)\s/im);
  const sql = readFileSync(`prisma/migrations/${name}/migration.sql`, "utf8");
  const checksum = prismaMigrationChecksum(sql);
  assert.match(doc, new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(doc, new RegExp(`npx prisma migrate resolve --applied ${name}`));
  assert.match(doc, new RegExp(checksum));
}

assert.equal(RECONCILE_20261024_MIGRATIONS.length, 7);
assert.equal(RECONCILE_20261024_MIGRATIONS[2], "20261024190000_greenhouse_job_form");
assert.equal(RECONCILE_20261024_MIGRATIONS[3], "20261024190000_recruiter_email_recheck");
console.log("PASS prisma migration history: resolve-after-verify doc; Prisma sort order; no blanket SQL");
