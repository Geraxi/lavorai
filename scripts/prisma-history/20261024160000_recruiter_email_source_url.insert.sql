-- REVIEWED, NOT APPLIED. History row only. Run AFTER the sibling verify.sql
-- returns objects_match=true on EU. Does not CREATE/ALTER/DROP schema.

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
