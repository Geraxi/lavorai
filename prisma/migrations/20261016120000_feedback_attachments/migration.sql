-- Additive only. Do not apply to production without a separately approved rollout.
CREATE TABLE "FeedbackAttachment" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "reportId" TEXT NOT NULL REFERENCES "FeedbackReport"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "position" INTEGER NOT NULL CHECK ("position" BETWEEN 0 AND 2),
  "filename" VARCHAR(120) NOT NULL CHECK ("filename" ~ '^[A-Za-z0-9][A-Za-z0-9._-]*$'),
  "contentType" VARCHAR(32) NOT NULL CHECK ("contentType" IN ('image/png', 'image/jpeg', 'image/webp', 'application/pdf')),
  "byteLength" INTEGER NOT NULL CHECK ("byteLength" BETWEEN 1 AND 3145728),
  "data" BYTEA NOT NULL CHECK (octet_length("data") = "byteLength"),
  "scanStatus" VARCHAR(16) NOT NULL CHECK ("scanStatus" IN ('sanitized', 'quarantined', 'clean')),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FeedbackAttachment_pdf_scan_check" CHECK ("contentType" <> 'application/pdf' OR "scanStatus" <> 'sanitized')
);
CREATE UNIQUE INDEX "FeedbackAttachment_reportId_position_key" ON "FeedbackAttachment"("reportId", "position");

CREATE TABLE "FeedbackUploadBudget" (
  "userId" TEXT NOT NULL PRIMARY KEY REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "hourStart" TIMESTAMP(3) NOT NULL,
  "hourCount" INTEGER NOT NULL CHECK ("hourCount" BETWEEN 1 AND 20),
  "dayStart" TIMESTAMP(3) NOT NULL,
  "dayCount" INTEGER NOT NULL CHECK ("dayCount" BETWEEN 1 AND 60)
);
