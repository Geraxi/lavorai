-- Additive only. No historical trial marker is reset or subscription altered.
ALTER TABLE "User" ADD COLUMN "demoPreviewJson" TEXT,
ADD COLUMN "demoClaimedAt" TIMESTAMP(3),
ADD COLUMN "checkoutClaimedAt" TIMESTAMP(3),
ADD COLUMN "trialActivationVersion" INTEGER;
