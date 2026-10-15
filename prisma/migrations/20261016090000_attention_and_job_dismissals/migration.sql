-- Add columns without a default first: historical read state remains unknown.
ALTER TABLE "ApplicationReply" ADD COLUMN "attentionTrackedAt" TIMESTAMP(3), ADD COLUMN "readAt" TIMESTAMP(3), ADD COLUMN "handledAt" TIMESTAMP(3), ADD COLUMN "remindAt" TIMESTAMP(3);
ALTER TABLE "ApplicationReply" ALTER COLUMN "attentionTrackedAt" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "GmailMessage" ADD COLUMN "handledAt" TIMESTAMP(3), ADD COLUMN "remindAt" TIMESTAMP(3);
CREATE TABLE "JobDismissal" (
 "userId" TEXT NOT NULL, "jobId" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "JobDismissal_pkey" PRIMARY KEY ("userId", "jobId"),
 CONSTRAINT "JobDismissal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT "JobDismissal_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
