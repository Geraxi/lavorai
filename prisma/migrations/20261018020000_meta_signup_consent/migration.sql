-- Additive only: two new tables + indexes + one FK to "User". No existing table or column is altered.
-- Safe for `prisma db push` (creates the two tables, touches nothing else). Do not apply to production without an approved rollout.
-- CreateTable
CREATE TABLE "ConsentRecord" (
    "id" TEXT NOT NULL,
    "visitorId" TEXT NOT NULL,
    "noticeVersion" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "consentRequired" BOOLEAN NOT NULL,
    "analytics" TEXT NOT NULL,
    "advertising" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsentRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegistrationConversion" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimedAt" TIMESTAMP(3),
    "outcome" TEXT,

    CONSTRAINT "RegistrationConversion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ConsentRecord_visitorId_createdAt_idx" ON "ConsentRecord"("visitorId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "RegistrationConversion_userId_key" ON "RegistrationConversion"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "RegistrationConversion_eventId_key" ON "RegistrationConversion"("eventId");

-- AddForeignKey
ALTER TABLE "RegistrationConversion" ADD CONSTRAINT "RegistrationConversion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

