ALTER TABLE "Job"
  ADD COLUMN "publicationVerifiedAt" TIMESTAMP(3),
  ADD COLUMN "applicationFormCapability" TEXT,
  ADD COLUMN "catalogueCheckedAt" TIMESTAMP(3);
