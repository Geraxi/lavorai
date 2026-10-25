-- Additive only. Not applied by this change.
-- Nullable outcome columns so the existing 24/10 EmailLog rows are preserved.

ALTER TABLE "EmailLog" ADD COLUMN IF NOT EXISTS "outcome" TEXT;
ALTER TABLE "EmailLog" ADD COLUMN IF NOT EXISTS "providerEmailId" TEXT;
ALTER TABLE "EmailLog" ADD COLUMN IF NOT EXISTS "errorName" TEXT;
ALTER TABLE "EmailLog" ADD COLUMN IF NOT EXISTS "errorCode" TEXT;

CREATE INDEX IF NOT EXISTS "EmailLog_to_kind_createdAt_idx" ON "EmailLog"("to", "kind", "createdAt");
CREATE INDEX IF NOT EXISTS "EmailLog_providerEmailId_idx" ON "EmailLog"("providerEmailId");
