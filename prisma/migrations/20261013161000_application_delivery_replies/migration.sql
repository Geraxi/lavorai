-- Additive only. No historical outcomes are inferred or backfilled.
ALTER TABLE "Application" ADD COLUMN "submissionReceiptJson" TEXT, ADD COLUMN "userProvidedAnswersJson" TEXT, ADD COLUMN "consentGrantedAt" TIMESTAMP(3);
ALTER TABLE "ApplicationReply"
  ADD COLUMN "provider" TEXT,
  ADD COLUMN "providerMessageId" TEXT,
  ADD COLUMN "providerEventId" TEXT,
  ADD COLUMN "isSecurityCode" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "processingAppliedAt" TIMESTAMP(3),
  ADD COLUMN "forwardStatus" TEXT NOT NULL DEFAULT 'skipped',
  ADD COLUMN "forwardPayloadJson" TEXT,
  ADD COLUMN "forwardIdempotencyKey" TEXT,
  ADD COLUMN "forwardStartedAt" TIMESTAMP(3),
  ADD COLUMN "forwardLeaseUntil" TIMESTAMP(3),
  ADD COLUMN "forwardLeaseToken" TEXT,
  ADD COLUMN "forwardedAt" TIMESTAMP(3),
  ADD COLUMN "forwardProviderId" TEXT,
  ADD COLUMN "forwardError" TEXT;
CREATE UNIQUE INDEX "ApplicationReply_providerEventId_key" ON "ApplicationReply"("providerEventId");
CREATE UNIQUE INDEX "ApplicationReply_forwardIdempotencyKey_key" ON "ApplicationReply"("forwardIdempotencyKey");
CREATE UNIQUE INDEX "ApplicationReply_provider_providerMessageId_key" ON "ApplicationReply"("provider", "providerMessageId");
CREATE INDEX "ApplicationReply_forwardStatus_forwardLeaseUntil_idx" ON "ApplicationReply"("forwardStatus", "forwardLeaseUntil");
CREATE TABLE "ApplicationEmailAttempt" (
  "id" TEXT NOT NULL,
  "applicationId" TEXT NOT NULL,
  "attemptKey" TEXT NOT NULL,
  "recipient" TEXT NOT NULL,
  "recipientProvenanceJson" TEXT,
  "providerEmailId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'sending',
  "acceptedAt" TIMESTAMP(3),
  "lastEventAt" TIMESTAMP(3),
  "lastEventType" TEXT,
  "failureReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ApplicationEmailAttempt_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ApplicationEmailAttempt_attemptKey_key" ON "ApplicationEmailAttempt"("attemptKey");
CREATE UNIQUE INDEX "ApplicationEmailAttempt_providerEmailId_key" ON "ApplicationEmailAttempt"("providerEmailId");
CREATE INDEX "ApplicationEmailAttempt_applicationId_createdAt_idx" ON "ApplicationEmailAttempt"("applicationId", "createdAt");
ALTER TABLE "ApplicationEmailAttempt" ADD CONSTRAINT "ApplicationEmailAttempt_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE TABLE "EmailProviderEvent" (
  "id" TEXT NOT NULL,
  "providerEventId" TEXT NOT NULL,
  "providerEmailId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "attemptId" TEXT,
  "processedAt" TIMESTAMP(3),
  "failureReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EmailProviderEvent_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "EmailProviderEvent_providerEventId_key" ON "EmailProviderEvent"("providerEventId");
CREATE INDEX "EmailProviderEvent_providerEmailId_occurredAt_idx" ON "EmailProviderEvent"("providerEmailId", "occurredAt");
ALTER TABLE "EmailProviderEvent" ADD CONSTRAINT "EmailProviderEvent_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "ApplicationEmailAttempt"("id") ON DELETE SET NULL ON UPDATE CASCADE;
