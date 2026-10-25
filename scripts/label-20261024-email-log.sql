-- REVIEWED, UNAPPLIED.
-- Labels the existing 24/10 EmailLog rows from an evidence CSV the operator supplies.
-- Never remove EmailLog rows. Never insert new EmailLog rows. Never enqueue or send mail.
--
-- Procedure:
--   1. Copy scripts/email-log-2410-evidence.template.csv and fill the 37 rows.
--   2. Load into a staging table (example):
--        CREATE TEMP TABLE email_log_2410_evidence (
--          id TEXT PRIMARY KEY,
--          kind TEXT,
--          "to" TEXT,
--          created_at TIMESTAMPTZ,
--          evidence_error_name TEXT,
--          evidence_error_code TEXT
--        );
--        \copy email_log_2410_evidence FROM 'scripts/email-log-2410-evidence.csv' CSV HEADER
--   3. Run the UPDATE below. provider_failed only where an error is evidenced;
--      every other matched 24/10 row becomes unknown_not_accepted.
--   4. Do not run prisma migrate deploy. Do not resend.

CREATE TEMP TABLE IF NOT EXISTS email_log_2410_evidence (
  id TEXT PRIMARY KEY,
  kind TEXT,
  "to" TEXT,
  created_at TIMESTAMPTZ,
  evidence_error_name TEXT,
  evidence_error_code TEXT
);

UPDATE "EmailLog" AS e
SET
  outcome = CASE
    WHEN x.evidence_error_name IS NOT NULL AND btrim(x.evidence_error_name) <> ''
      THEN 'provider_failed'
    ELSE 'unknown_not_accepted'
  END,
  "errorName" = NULLIF(btrim(COALESCE(x.evidence_error_name, '')), ''),
  "errorCode" = NULLIF(btrim(COALESCE(x.evidence_error_code, '')), '')
FROM email_log_2410_evidence AS x
WHERE e.id = x.id
  AND e."createdAt" >= TIMESTAMPTZ '2026-10-24 00:00:00+02'
  AND e."createdAt" <  TIMESTAMPTZ '2026-10-25 00:00:00+02'
  AND e.outcome IS NULL;

-- Rows not present in the CSV stay unlabeled (outcome NULL). Admin copy must
-- not call them "sent". Nothing is automatically resent.
