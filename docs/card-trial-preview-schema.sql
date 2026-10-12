-- REVIEW ONLY. Do not apply automatically. PostgreSQL additive rollout dependency.
-- Contains personal CV/letter output: use existing user-data access, retention and deletion policies.
-- A single lifetime successful allowance per user. Definite unbilled failures may retry
-- ONLY the same job, up to three reservations total. Billable/unknown outcomes stay reserved.
-- Keep jobId as an immutable text snapshot so catalog cleanup cannot erase the allowance.
CREATE TABLE "CardTrialPreview" (
  "userId" TEXT PRIMARY KEY REFERENCES "User"("id") ON DELETE CASCADE,
  "jobId" TEXT NOT NULL,
  "state" TEXT NOT NULL CHECK ("state" IN ('reserved', 'succeeded', 'failed')),
  "leaseId" TEXT NOT NULL,
  "leaseExpiresAt" TIMESTAMPTZ NOT NULL,
  "result" JSONB,
  "attempts" INTEGER NOT NULL DEFAULT 1 CHECK ("attempts" BETWEEN 1 AND 3),
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (("state" = 'succeeded' AND "result" IS NOT NULL)
      OR ("state" <> 'succeeded' AND "result" IS NULL))
);
-- leaseExpiresAt is diagnostic only. NEVER automatically delete or reclaim expired reservations.
-- For an uncertain provider outcome or persistence failure, reconcile with provider/DB evidence.
-- Only an operator with definite no-output evidence may transition reserved -> failed; if output
-- exists, persist that original output as succeeded instead. Never regenerate a succeeded preview.
-- The application uses tagged, parameterized Prisma raw queries and no generated model changes.
-- Apply through the reviewed normal migration process before enabling rollout gates.
