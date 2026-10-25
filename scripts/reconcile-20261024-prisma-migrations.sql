-- REVIEWED, NOT APPLIED.
--
-- The seven 24/10 migrations (20261024160000 through 20261024220000) already
-- have their objects in the EU database, but `_prisma_migrations` has no rows
-- for them. `prisma migrate deploy` must NOT be run until these history rows
-- are inserted. This script only records checksums; it does not create, alter,
-- or drop schema objects.
--
-- Checksums are SHA-256 (hex) of each migration.sql file as UTF-8, matching
-- Prisma's migrate checksum. Ids are deterministic UUIDs derived from
-- sha256("prisma_history:" || migration_name) so the insert is idempotent
-- under WHERE NOT EXISTS on migration_name.
--
-- Do not run this against production from the follow-up PR. Reconcile history
-- in a reviewed operator session, then `prisma migrate deploy` can apply later
-- additive migrations (including 20261025020000_application_release_budget).

BEGIN;

INSERT INTO "_prisma_migrations" (
  "id", "checksum", "finished_at", "migration_name", "logs", "rolled_back_at", "started_at", "applied_steps_count"
)
SELECT
  'd6c26709-9015-19ce-93a1-f47e4cbb2c13',
  'ca5eadc68e3f0b87239a8fce87121d15316f9c1dbd1996e9c06cabb6ed2afc81',
  NOW(),
  '20261024160000_recruiter_email_source_url',
  NULL, NULL, NOW(), 1
WHERE NOT EXISTS (
  SELECT 1 FROM "_prisma_migrations" WHERE "migration_name" = '20261024160000_recruiter_email_source_url'
);

INSERT INTO "_prisma_migrations" (
  "id", "checksum", "finished_at", "migration_name", "logs", "rolled_back_at", "started_at", "applied_steps_count"
)
SELECT
  'ae8acff7-37a1-6f09-097b-aa4719bdd3ec',
  '493db68e0b52b7182b3951c0a7f3a498fd5cc14d7b4d635e8eb317af1a9bb6b7',
  NOW(),
  '20261024180000_employer_hiring_inbox',
  NULL, NULL, NOW(), 1
WHERE NOT EXISTS (
  SELECT 1 FROM "_prisma_migrations" WHERE "migration_name" = '20261024180000_employer_hiring_inbox'
);

INSERT INTO "_prisma_migrations" (
  "id", "checksum", "finished_at", "migration_name", "logs", "rolled_back_at", "started_at", "applied_steps_count"
)
SELECT
  'a1d0bfc1-1114-d3b1-b7f6-0bdd919a9d14',
  'c2a70492c4abc91d55c0819fff937eeac0acbab5f9abcdbf4dd4ce964e5c2926',
  NOW(),
  '20261024190000_recruiter_email_recheck',
  NULL, NULL, NOW(), 1
WHERE NOT EXISTS (
  SELECT 1 FROM "_prisma_migrations" WHERE "migration_name" = '20261024190000_recruiter_email_recheck'
);

INSERT INTO "_prisma_migrations" (
  "id", "checksum", "finished_at", "migration_name", "logs", "rolled_back_at", "started_at", "applied_steps_count"
)
SELECT
  'c91a01f6-faab-ac64-6ba3-e2f30c2485d6',
  '560c6d615df43813ac476eb84286e09e369cb11cdf18b19396f03396d6c523e1',
  NOW(),
  '20261024190000_greenhouse_job_form',
  NULL, NULL, NOW(), 1
WHERE NOT EXISTS (
  SELECT 1 FROM "_prisma_migrations" WHERE "migration_name" = '20261024190000_greenhouse_job_form'
);

INSERT INTO "_prisma_migrations" (
  "id", "checksum", "finished_at", "migration_name", "logs", "rolled_back_at", "started_at", "applied_steps_count"
)
SELECT
  'a120b694-1026-f9a3-8da5-c05155cc6b2f',
  'd15b56154baadc8ed3530f22b67515e49ee0b9001e5ab408b1891d70f188772d',
  NOW(),
  '20261024200000_application_mailbox',
  NULL, NULL, NOW(), 1
WHERE NOT EXISTS (
  SELECT 1 FROM "_prisma_migrations" WHERE "migration_name" = '20261024200000_application_mailbox'
);

INSERT INTO "_prisma_migrations" (
  "id", "checksum", "finished_at", "migration_name", "logs", "rolled_back_at", "started_at", "applied_steps_count"
)
SELECT
  '146f9003-1cce-6ce8-d09a-fb56fc21c584',
  '63a349ccf816f3d516b0ad8a1e874e225b975dcd7902f6744df90700cb25ce92',
  NOW(),
  '20261024210000_job_description_full',
  NULL, NULL, NOW(), 1
WHERE NOT EXISTS (
  SELECT 1 FROM "_prisma_migrations" WHERE "migration_name" = '20261024210000_job_description_full'
);

INSERT INTO "_prisma_migrations" (
  "id", "checksum", "finished_at", "migration_name", "logs", "rolled_back_at", "started_at", "applied_steps_count"
)
SELECT
  'b4628b95-e3af-2cd5-8d31-275c2928020f',
  '8d0050742c4ee96908db1da156217b92eadc2d69cf44207703b274a70820394c',
  NOW(),
  '20261024220000_job_description_fetch_backoff',
  NULL, NULL, NOW(), 1
WHERE NOT EXISTS (
  SELECT 1 FROM "_prisma_migrations" WHERE "migration_name" = '20261024220000_job_description_fetch_backoff'
);

COMMIT;
