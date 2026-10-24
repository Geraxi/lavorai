-- ADDITIVE ONLY. Do not apply to production without an approved rollout.
-- Backoff after a failed full-description fetch so the candidate window
-- advances past boards that 429 / time out (Twilio, OpenAI, …).

ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "descriptionFetchAttempts" INTEGER;
ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "descriptionFetchRetryAt" TIMESTAMP(3);
