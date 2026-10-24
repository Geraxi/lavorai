-- ADDITIVE ONLY. Do not apply to production without an approved rollout.
-- Per-user application mailbox: notify preference, richer kind, notify outbox.
-- No existing column is altered or dropped.

ALTER TABLE "UserPreferences" ADD COLUMN IF NOT EXISTS "mailboxNotifyMode" TEXT NOT NULL DEFAULT 'priority';

ALTER TABLE "ApplicationReply" ADD COLUMN IF NOT EXISTS "notifyStatus" TEXT NOT NULL DEFAULT 'pending';

ALTER TABLE "InboundEmail" ADD COLUMN IF NOT EXISTS "mailboxKind" TEXT;
ALTER TABLE "InboundEmail" ADD COLUMN IF NOT EXISTS "notifyStatus" TEXT NOT NULL DEFAULT 'pending';
