-- Additive only. Do not backfill or infer historical attempt evidence.
-- Not applied by this change; apply on the EU database separately.
ALTER TABLE "Application" ADD COLUMN "submitClickPerformedAt" TIMESTAMP(3);
ALTER TABLE "Application" ADD COLUMN "outboundSubmissionJson" TEXT;
ALTER TABLE "Application" ADD COLUMN "destinationResponseJson" TEXT;
