-- ADDITIVE ONLY. Do not apply to production without an approved rollout.
-- One-time skip-list recruiter-email recheck marker. No existing column
-- is altered or dropped. Null means the row has not been rechecked.

ALTER TABLE "Application" ADD COLUMN IF NOT EXISTS "recruiterEmailRecheckedAt" TIMESTAMP(3);
