-- REVIEWED, NOT APPLIED. History row only. Run AFTER the sibling verify.sql
-- returns objects_match=true on EU. Does not CREATE/ALTER/DROP schema.

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
