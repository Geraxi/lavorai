-- Additive only: two new tables (MailboxConnection, MailboxSend) + indexes + FKs. No existing table or column is altered.
-- Do not apply to production without an approved rollout.
-- CreateTable
CREATE TABLE "MailboxConnection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "accessTokenEnc" TEXT NOT NULL,
    "refreshTokenEnc" TEXT,
    "expiresAt" TIMESTAMP(3),
    "scopes" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MailboxConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MailboxSend" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "fromAddress" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "recipientProvenanceJson" TEXT,
    "subject" TEXT NOT NULL,
    "bodyText" TEXT NOT NULL,
    "attachmentsJson" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'prepared',
    "approvedAt" TIMESTAMP(3),
    "sendClaimedAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "providerMessageId" TEXT,
    "providerThreadId" TEXT,
    "internetMessageId" TEXT,
    "dryRun" BOOLEAN NOT NULL DEFAULT false,
    "lastCheckedAt" TIMESTAMP(3),
    "checkCount" INTEGER NOT NULL DEFAULT 0,
    "confirmedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "bounceEvidenceJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MailboxSend_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MailboxConnection_userId_provider_key" ON "MailboxConnection"("userId", "provider");

-- CreateIndex
CREATE INDEX "MailboxSend_applicationId_createdAt_idx" ON "MailboxSend"("applicationId", "createdAt");

-- CreateIndex
CREATE INDEX "MailboxSend_userId_state_idx" ON "MailboxSend"("userId", "state");

-- CreateIndex
CREATE INDEX "MailboxSend_state_submittedAt_idx" ON "MailboxSend"("state", "submittedAt");

-- AddForeignKey
ALTER TABLE "MailboxConnection" ADD CONSTRAINT "MailboxConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailboxSend" ADD CONSTRAINT "MailboxSend_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

