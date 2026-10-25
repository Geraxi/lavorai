-- REVIEWED, NOT APPLIED. History row only. Run AFTER the sibling verify.sql
-- returns objects_match=true on EU. Does not CREATE/ALTER/DROP schema.

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
