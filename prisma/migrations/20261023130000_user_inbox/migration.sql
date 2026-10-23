-- Per-user inbound inbox: additive only (two tables + one enum). No existing column altered.
-- Do not apply to production without an approved rollout.
-- CreateEnum
CREATE TYPE "InboundEmailCategory" AS ENUM ('confirmation', 'incomplete', 'interview', 'rejection', 'other');

-- CreateTable
CREATE TABLE "UserInbox" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "disabledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserInbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InboundEmail" (
    "id" TEXT NOT NULL,
    "inboxId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerMessageId" TEXT NOT NULL,
    "rfcMessageId" TEXT,
    "fromAddress" TEXT NOT NULL,
    "toAddress" TEXT NOT NULL,
    "subject" TEXT,
    "bodyText" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "category" "InboundEmailCategory" NOT NULL DEFAULT 'other',
    "classifiedBy" TEXT NOT NULL DEFAULT 'rules',
    "codesJson" TEXT NOT NULL DEFAULT '[]',
    "linksJson" TEXT NOT NULL DEFAULT '[]',
    "applicationId" TEXT,
    "matchedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InboundEmail_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserInbox_userId_key" ON "UserInbox"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserInbox_slug_key" ON "UserInbox"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "UserInbox_address_key" ON "UserInbox"("address");

-- CreateIndex
CREATE INDEX "InboundEmail_userId_receivedAt_idx" ON "InboundEmail"("userId", "receivedAt");

-- CreateIndex
CREATE INDEX "InboundEmail_applicationId_idx" ON "InboundEmail"("applicationId");

-- CreateIndex
CREATE UNIQUE INDEX "InboundEmail_provider_providerMessageId_key" ON "InboundEmail"("provider", "providerMessageId");

-- AddForeignKey
ALTER TABLE "UserInbox" ADD CONSTRAINT "UserInbox_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InboundEmail" ADD CONSTRAINT "InboundEmail_inboxId_fkey" FOREIGN KEY ("inboxId") REFERENCES "UserInbox"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InboundEmail" ADD CONSTRAINT "InboundEmail_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InboundEmail" ADD CONSTRAINT "InboundEmail_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE SET NULL ON UPDATE CASCADE;

