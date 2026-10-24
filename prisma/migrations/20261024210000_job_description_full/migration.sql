-- ADDITIVE ONLY. Do not apply to production without an approved rollout.
-- Marks when we last stored a full public-board description. Existing
-- Job.description values are unchanged; backfill re-fetches rows still at
-- the legacy 2,000-character ingest cap.

ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "descriptionFetchedAt" TIMESTAMP(3);
