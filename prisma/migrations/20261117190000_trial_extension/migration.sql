-- Additive only: one-off extra free week after the trial ended.
ALTER TABLE "User" ADD COLUMN "trialExtensionEndsAt" TIMESTAMP(3);
