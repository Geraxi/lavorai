-- SUPERSEDED. Do not run this file.
--
-- The blanket seven-row INSERT was replaced by a per-migration procedure:
--   scripts/prisma-history/README.md
-- For each of the seven 24/10 migrations:
--   1. Run scripts/prisma-history/<name>.verify.sql on EU (read-only).
--   2. Require objects_match = true.
--   3. Only then run scripts/prisma-history/<name>.insert.sql (history row only).
--
-- `prisma migrate deploy` must NOT be run until every history row is inserted
-- after its own verification. This file contains no INSERT and no schema DDL.

SELECT 'use_per_migration_procedure' AS instruction
WHERE false;
