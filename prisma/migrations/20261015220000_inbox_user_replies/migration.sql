-- AlterTable
ALTER TABLE "ApplicationReply" ADD COLUMN     "directRecipient" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "referencesHeader" TEXT,
ADD COLUMN     "replyToAddress" TEXT,
ADD COLUMN     "rfcMessageId" TEXT;

-- CreateTable
CREATE TABLE "InboxReply" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "parentReplyId" TEXT NOT NULL,
    "bodyText" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "fromAddress" TEXT NOT NULL,
    "replyToAddress" TEXT NOT NULL,
    "inReplyTo" TEXT NOT NULL,
    "referencesHeader" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "providerEmailId" TEXT,
    "failureCode" TEXT,
    "firstAttemptAt" TIMESTAMP(3),
    "leaseUntil" TIMESTAMP(3),
    "leaseToken" TEXT,
    "acceptedAt" TIMESTAMP(3),
    "lastEventAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InboxReply_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InboxReply_providerEmailId_key" ON "InboxReply"("providerEmailId");

-- CreateIndex
CREATE INDEX "InboxReply_applicationId_createdAt_idx" ON "InboxReply"("applicationId", "createdAt");

-- CreateIndex
CREATE INDEX "InboxReply_parentReplyId_idx" ON "InboxReply"("parentReplyId");

-- AddForeignKey
ALTER TABLE "InboxReply" ADD CONSTRAINT "InboxReply_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InboxReply" ADD CONSTRAINT "InboxReply_parentReplyId_fkey" FOREIGN KEY ("parentReplyId") REFERENCES "ApplicationReply"("id") ON DELETE CASCADE ON UPDATE CASCADE;

