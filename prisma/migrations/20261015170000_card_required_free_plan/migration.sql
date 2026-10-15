-- Additive migration. Existing stored trial deadlines and Stripe subscriptions remain intact.
ALTER TABLE "User" ADD COLUMN "cardSetupAt" TIMESTAMP(3),
  ADD COLUMN "freeApplicationsUsed" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ALTER COLUMN "trialDurationDays" SET DEFAULT 0;
ALTER TABLE "Application" ADD COLUMN "previewResultJson" TEXT,
  ADD COLUMN "previewApprovedAt" TIMESTAMP(3);
CREATE TABLE "ApplicationPreview" (
  "id" TEXT NOT NULL PRIMARY KEY, "userId" TEXT NOT NULL, "jobId" TEXT NOT NULL,
  "resultJson" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ApplicationPreview_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ApplicationPreview_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "ApplicationPreview_userId_jobId_idx" ON "ApplicationPreview"("userId", "jobId");
-- Lifetime usage starts with real historical submissions, never queued/failed/manual imports.
UPDATE "User" u SET "freeApplicationsUsed" = LEAST(5, (
  SELECT COUNT(*) FROM "Application" a WHERE a."userId" = u.id AND a.status = 'success'
  AND a."submittedAt" IS NOT NULL AND a."submittedVia" NOT IN ('manual', 'mock_demo')
));

-- Freeze deadlines for any pre-rollout accounts whose active trial was implicit
-- in createdAt. New accounts never derive a trial from their creation timestamp.
UPDATE "User" SET "trialEndsAt" = "createdAt" + INTERVAL '7 days'
WHERE tier = 'free' AND "trialEndsAt" IS NULL
  AND "createdAt" + INTERVAL '7 days' > CURRENT_TIMESTAMP;
