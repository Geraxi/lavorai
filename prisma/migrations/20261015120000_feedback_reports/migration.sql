-- CreateTable
CREATE TABLE "FeedbackReport" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "category" VARCHAR(16) NOT NULL,
    "subject" VARCHAR(120) NOT NULL,
    "description" VARCHAR(4000) NOT NULL,
    "pageContext" VARCHAR(32),
    "locale" VARCHAR(2) NOT NULL,
    "status" VARCHAR(16) NOT NULL DEFAULT 'new',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeedbackReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FeedbackReport_userId_createdAt_idx" ON "FeedbackReport"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "FeedbackReport_status_createdAt_idx" ON "FeedbackReport"("status", "createdAt");

-- CreateIndex
CREATE INDEX "FeedbackReport_createdAt_id_idx" ON "FeedbackReport"("createdAt", "id");

-- AddForeignKey
ALTER TABLE "FeedbackReport" ADD CONSTRAINT "FeedbackReport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Defense in depth for writers outside the HTTP API (Prisma does not model CHECKs).
ALTER TABLE "FeedbackReport"
  ADD CONSTRAINT "FeedbackReport_category_check" CHECK ("category" IN ('feedback', 'bug')),
  ADD CONSTRAINT "FeedbackReport_status_check" CHECK ("status" IN ('new', 'in_review', 'resolved', 'closed')),
  ADD CONSTRAINT "FeedbackReport_locale_check" CHECK ("locale" IN ('it', 'en')),
  ADD CONSTRAINT "FeedbackReport_subject_check" CHECK (char_length(btrim("subject")) BETWEEN 3 AND 120),
  ADD CONSTRAINT "FeedbackReport_description_check" CHECK (char_length(btrim("description")) BETWEEN 10 AND 4000),
  ADD CONSTRAINT "FeedbackReport_pageContext_check" CHECK ("pageContext" IS NULL OR "pageContext" IN ('dashboard', 'discover', 'applications', 'inbox', 'materiali', 'questions', 'preferences', 'settings', 'billing', 'onboarding', 'other'));
