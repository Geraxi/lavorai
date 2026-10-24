-- ADDITIVE ONLY. Do not apply to production without an approved rollout.
-- Adds the source URL of an employer-published recruiter/application email.
-- No existing column is altered or dropped.

ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "recruiterEmailSourceUrl" TEXT;
