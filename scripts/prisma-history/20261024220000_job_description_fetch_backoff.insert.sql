-- REVIEWED, NOT APPLIED. History row only. Run AFTER the sibling verify.sql
-- returns objects_match=true on EU. Does not CREATE/ALTER/DROP schema.

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
