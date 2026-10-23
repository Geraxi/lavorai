\set ON_ERROR_STOP on
-- Run only against a disposable local database populated with the main schema.
INSERT INTO "User" (id,email,"createdAt",tier,"subscriptionStatus","stripeSubscriptionId","proTrialUsedAt","trialEndsAt") VALUES
('legacy-empty','legacy-empty@example.invalid','2025-01-01','free',NULL,NULL,NULL,NULL),
('legacy-marker','legacy-marker@example.invalid','2026-10-10','free',NULL,NULL,'2026-10-10','2026-10-17'),
('existing-trial','existing-trial@example.invalid','2026-10-20','pro','trialing','sub_fixture_trial','2026-10-20','2026-10-27'),
('existing-paid','existing-paid@example.invalid','2026-09-01','pro','active','sub_fixture_paid','2026-09-01','2026-09-08');
CREATE TEMP TABLE before_activation AS SELECT id,to_jsonb(u) AS snapshot FROM "User" u;
\ir ../prisma/migrations/20261021210000_value_first_activation/migration.sql
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM "User" u JOIN before_activation b USING(id)
    WHERE (to_jsonb(u) - ARRAY['demoPreviewJson','demoClaimedAt','checkoutClaimedAt','trialActivationVersion']) IS DISTINCT FROM b.snapshot)
  THEN RAISE EXCEPTION 'Migration changed historical data'; END IF;
  IF EXISTS (SELECT 1 FROM "User" WHERE "trialActivationVersion" IS NOT NULL OR "demoPreviewJson" IS NOT NULL OR "demoClaimedAt" IS NOT NULL OR "checkoutClaimedAt" IS NOT NULL)
  THEN RAISE EXCEPTION 'Migration granted or populated historical activation'; END IF;
END $$;
INSERT INTO "User" (id,email,"trialActivationVersion") VALUES ('new-value-first','new@example.invalid',1);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM "User" WHERE id='new-value-first' AND "trialActivationVersion"=1 AND "proTrialUsedAt" IS NULL AND "trialEndsAt" IS NULL)
  THEN RAISE EXCEPTION 'Fresh signup should be eligible but not activated'; END IF;
END $$;
SELECT 'PASS additive migration: all historical fields unchanged, old cohorts unmarked, new cohort explicit' AS result;
