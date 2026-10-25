-- Additive only. Not applied by this change; apply on the EU database separately.
-- First activation budget: at most 5 grants, unique per application id.
-- Concurrent Vercel and GitHub Actions drains share this table (not process memory).

CREATE TABLE "ApplicationReleaseBatch" (
    "id" TEXT NOT NULL,
    "maxCount" INTEGER NOT NULL,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ApplicationReleaseBatch_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ApplicationReleaseBatch_max_le_5" CHECK ("maxCount" >= 0 AND "maxCount" <= 5),
    CONSTRAINT "ApplicationReleaseBatch_used_nonneg" CHECK ("usedCount" >= 0),
    CONSTRAINT "ApplicationReleaseBatch_used_le_max" CHECK ("usedCount" <= "maxCount")
);

CREATE TABLE "ApplicationReleaseGrant" (
    "applicationId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "releasedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ApplicationReleaseGrant_pkey" PRIMARY KEY ("applicationId")
);

CREATE INDEX "ApplicationReleaseGrant_batchId_idx" ON "ApplicationReleaseGrant"("batchId");

ALTER TABLE "ApplicationReleaseGrant"
    ADD CONSTRAINT "ApplicationReleaseGrant_batchId_fkey"
    FOREIGN KEY ("batchId") REFERENCES "ApplicationReleaseBatch"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "ApplicationReleaseBatch" ("id", "maxCount", "usedCount")
VALUES ('activation-1', 5, 0);
