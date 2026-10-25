-- REVIEWED, NOT APPLIED. History row only. Run AFTER the sibling verify.sql
-- returns objects_match=true on EU. Does not CREATE/ALTER/DROP schema.

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
