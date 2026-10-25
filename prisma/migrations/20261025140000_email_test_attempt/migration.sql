-- Additive only. Not applied by this change; apply on the EU database separately.
-- One-time controlled email test key per (runKey, destination).
-- Never reuses or resets the 14/10 canary attempt key.

CREATE TABLE "EmailTestAttempt" (
    "id" TEXT NOT NULL,
    "runKey" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "attemptKey" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailTestAttempt_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "EmailTestAttempt_not_legacy_canary_key" CHECK ("attemptKey" <> 'release-canary-email-20261013-owner-v1')
);

CREATE UNIQUE INDEX "EmailTestAttempt_attemptKey_key" ON "EmailTestAttempt"("attemptKey");
CREATE UNIQUE INDEX "EmailTestAttempt_runKey_destination_key" ON "EmailTestAttempt"("runKey", "destination");
CREATE INDEX "EmailTestAttempt_applicationId_idx" ON "EmailTestAttempt"("applicationId");

ALTER TABLE "EmailTestAttempt"
    ADD CONSTRAINT "EmailTestAttempt_applicationId_fkey"
    FOREIGN KEY ("applicationId") REFERENCES "Application"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
