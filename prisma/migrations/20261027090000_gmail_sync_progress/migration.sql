-- Additive only. No account/token changes and no historical send/reply rewrites.
CREATE TABLE "GmailSyncProgress" (
  "accountId" TEXT PRIMARY KEY REFERENCES "Account"("id") ON DELETE CASCADE,
  "leaseToken" TEXT,
  "leaseUntil" TIMESTAMP(3),
  "lastAttemptAt" TIMESTAMP(3),
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedBefore" BIGINT,
  "scanBefore" BIGINT,
  "pageToken" TEXT,
  "messageIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "nextPageToken" TEXT,
  "lastError" TEXT,
  CONSTRAINT "GmailSyncProgress_lease_pair" CHECK (("leaseToken" IS NULL) = ("leaseUntil" IS NULL))
);
CREATE INDEX "GmailSyncProgress_due" ON "GmailSyncProgress" ("nextAttemptAt", "lastAttemptAt");
