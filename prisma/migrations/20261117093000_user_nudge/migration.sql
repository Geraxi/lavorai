-- Additive only: ledger for consent / pending-questions service nudges.
CREATE TABLE "UserNudge" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "lastSentAt" TIMESTAMP(3),
    "lastProviderEmailId" TEXT,
    "optedOutAt" TIMESTAMP(3),
    "bouncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserNudge_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserNudge_userId_kind_key" ON "UserNudge"("userId", "kind");
CREATE INDEX "UserNudge_lastProviderEmailId_idx" ON "UserNudge"("lastProviderEmailId");

ALTER TABLE "UserNudge" ADD CONSTRAINT "UserNudge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
