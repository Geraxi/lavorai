-- ADDITIVE ONLY. Do not apply to production without an approved rollout.
-- Cached Greenhouse boards-api questions snapshot for the proven-channel pre-check.
-- No existing column is altered or dropped. Never stores candidate answers.

CREATE TABLE IF NOT EXISTS "GreenhouseJobForm" (
    "cacheKey" TEXT NOT NULL,
    "boardToken" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "absoluteUrl" TEXT,
    "status" TEXT NOT NULL,
    "questionsJson" TEXT NOT NULL,
    "checkedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GreenhouseJobForm_pkey" PRIMARY KEY ("cacheKey")
);

CREATE INDEX IF NOT EXISTS "GreenhouseJobForm_boardToken_jobId_idx" ON "GreenhouseJobForm"("boardToken", "jobId");
