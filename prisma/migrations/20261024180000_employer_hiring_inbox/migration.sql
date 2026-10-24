-- ADDITIVE ONLY. Do not apply to production without an approved rollout.
-- Optional employer website on Job, plus a per-domain hiring-inbox cache.
-- No existing column is altered or dropped.

ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "companyWebsite" TEXT;

CREATE TABLE IF NOT EXISTS "EmployerHiringInbox" (
    "companyDomain" TEXT NOT NULL,
    "email" TEXT,
    "sourceUrl" TEXT,
    "evidence" TEXT,
    "status" TEXT NOT NULL,
    "checkedAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployerHiringInbox_pkey" PRIMARY KEY ("companyDomain")
);
