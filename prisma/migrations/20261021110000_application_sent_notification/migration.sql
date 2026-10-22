ALTER TABLE "Application" ADD COLUMN "sentNotificationRequiredAt" TIMESTAMP(3);

CREATE TABLE "ApplicationSentNotification" (
  "applicationId" TEXT NOT NULL,
  "payloadJson" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "firstAttemptAt" TIMESTAMP(3),
  "leaseUntil" TIMESTAMP(3),
  "leaseToken" TEXT,
  "providerEmailId" TEXT,
  "error" TEXT,
  "sentAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ApplicationSentNotification_pkey" PRIMARY KEY ("applicationId")
);
ALTER TABLE "ApplicationSentNotification" ADD CONSTRAINT "ApplicationSentNotification_applicationId_fkey"
  FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;
