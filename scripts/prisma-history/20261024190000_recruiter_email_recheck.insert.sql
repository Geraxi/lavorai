-- REVIEWED, NOT APPLIED. History row only. Run AFTER the sibling verify.sql
-- returns objects_match=true on EU. Does not CREATE/ALTER/DROP schema.

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
