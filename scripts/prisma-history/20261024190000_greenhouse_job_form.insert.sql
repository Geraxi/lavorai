-- REVIEWED, NOT APPLIED. History row only. Run AFTER the sibling verify.sql
-- returns objects_match=true on EU. Does not CREATE/ALTER/DROP schema.

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
