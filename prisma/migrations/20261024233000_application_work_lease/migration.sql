-- Additive only. Do not backfill or rewrite historical ownership.
-- Not applied by this change; apply on the EU database separately.
ALTER TABLE "Application" ADD COLUMN "leaseToken" TEXT;
ALTER TABLE "Application" ADD COLUMN "leaseExpiresAt" TIMESTAMP(3);
ALTER TABLE "Application" ADD COLUMN "submitStartedAt" TIMESTAMP(3);
CREATE INDEX "Application_status_leaseExpiresAt_idx" ON "Application"("status", "leaseExpiresAt");
