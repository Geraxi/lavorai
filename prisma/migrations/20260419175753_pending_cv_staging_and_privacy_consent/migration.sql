-- AlterTable
ALTER TABLE "User" ADD COLUMN "privacyConsentAt" DATETIME;

-- CreateTable
CREATE TABLE "PendingCvSubmission" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "originalFilename" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "extractedText" TEXT NOT NULL,
    "privacyConsentAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "PendingCvSubmission_email_key" ON "PendingCvSubmission"("email");

-- CreateIndex
CREATE INDEX "PendingCvSubmission_expiresAt_idx" ON "PendingCvSubmission"("expiresAt");
