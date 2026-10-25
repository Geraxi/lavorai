-- Additive only. Not applied by this change; apply on the EU database separately.
-- Stores the Resend message id when the provider accepted the send.
ALTER TABLE "EmailLog" ADD COLUMN "providerEmailId" TEXT;
