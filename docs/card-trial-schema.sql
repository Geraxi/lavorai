-- REVIEW ONLY. DO NOT RUN UNTIL production schema/backup/target are verified.
-- Additive isolated state; no User columns, defaults, or existing rows changed.
CREATE TABLE "CardTrialRollout" (
  "id" boolean PRIMARY KEY DEFAULT true CHECK ("id" = true),
  "startsAt" timestamptz NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE "CardTrialPolicy" (
  "userId" text PRIMARY KEY REFERENCES "User"("id") ON DELETE CASCADE,
  "policy" text NOT NULL CHECK ("policy" = 'card_preview_v1'),
  "assignedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE "CardTrialEnrollment" (
  "userId" text PRIMARY KEY REFERENCES "User"("id") ON DELETE CASCADE,
  "policy" text NOT NULL DEFAULT 'card_preview_v1',
  "customerId" text UNIQUE,
  "subscriptionId" text UNIQUE,
  "tier" text NOT NULL CHECK ("tier" IN ('pro', 'pro_plus')),
  "status" text NOT NULL DEFAULT 'pending',
  "trialStartedAt" timestamptz,
  "trialEndsAt" timestamptz,
  "cardVerifiedAt" timestamptz,
  "paidThrough" timestamptz,
  "paidInvoiceId" text,
  "firstPaidInvoiceId" text,
  "checkoutKind" text NOT NULL DEFAULT 'trial' CHECK ("checkoutKind" IN ('trial', 'paid_reactivation')),
  "checkoutAttempt" text NOT NULL,
  "checkoutAttemptStartedAt" timestamptz NOT NULL DEFAULT now(),
  "checkoutSessionId" text UNIQUE,
  "checkoutUrl" text,
  "checkoutExpiresAt" timestamptz,
  "cancelAtPeriodEnd" boolean NOT NULL DEFAULT false,
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE "CardTrialWebhookEvent" (
  "eventId" text PRIMARY KEY,
  "userId" text NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "processedAt" timestamptz NOT NULL DEFAULT now()
);
-- Apply docs/card-trial-preview-schema.sql in the same reviewed release.

-- Frozen referral intent; completion and local credits are atomic. An unknown
-- Stripe response stays pending and never falls back to a second local credit.
CREATE TABLE "CardTrialReferralReward" (
  "referredUserId" text PRIMARY KEY REFERENCES "User"("id") ON DELETE CASCADE,
  "referrerId" text NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "mode" text NOT NULL CHECK ("mode" IN ('stripe', 'checkout')),
  "customerId" text,
  "amountCents" integer,
  "currency" text,
  "firstAttemptAt" timestamptz,
  "stripeTransactionId" text,
  "completedAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CHECK ("mode" = 'checkout' OR ("customerId" IS NOT NULL AND "amountCents" IS NOT NULL AND "amountCents" > 0 AND "currency" IS NOT NULL))
);
