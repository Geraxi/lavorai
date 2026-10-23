-- Proof-of-send: additive columns on "Application" + two enums + a CHECK.
-- Legacy rows get sendStatus='not_sent' and satisfy the CHECK unchanged.
-- Do not apply to production without an approved rollout.
CREATE TYPE "SendStatus" AS ENUM ('not_sent', 'submitted', 'needs_user', 'failed');
CREATE TYPE "SentProofType" AS ENUM ('gmail_message_id', 'ats_confirmation_email', 'success_page_screenshot', 'ats_submission_receipt', 'email_provider_message_id');

ALTER TABLE "Application"
  ADD COLUMN "sendStatus" "SendStatus" NOT NULL DEFAULT 'not_sent',
  ADD COLUMN "sendFailureReason" TEXT,
  ADD COLUMN "sentProofType" "SentProofType",
  ADD COLUMN "sentProofRef" TEXT,
  ADD COLUMN "sentAt" TIMESTAMP(3),
  ADD COLUMN "confirmedAt" TIMESTAMP(3);

-- Nothing counts as submitted without proof, even for a buggy writer.
ALTER TABLE "Application" ADD CONSTRAINT "Application_submitted_requires_proof"
  CHECK ("sendStatus" <> 'submitted' OR ("sentProofType" IS NOT NULL AND "sentProofRef" IS NOT NULL AND length("sentProofRef") > 0 AND "sentAt" IS NOT NULL));

CREATE INDEX "Application_userId_sendStatus_idx" ON "Application"("userId", "sendStatus");
