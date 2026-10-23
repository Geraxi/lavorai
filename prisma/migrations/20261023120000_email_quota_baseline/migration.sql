CREATE TABLE "EmailQuotaBaseline" (
  "id" TEXT NOT NULL,
  "inputHash" TEXT NOT NULL,
  "snapshotAt" TIMESTAMP(3) NOT NULL,
  "providerObservedAt" TIMESTAMP(3) NOT NULL,
  "dailyConsumed" INTEGER NOT NULL CHECK ("dailyConsumed" >= 0),
  "monthlyConsumed" INTEGER NOT NULL CHECK ("monthlyConsumed" >= 0),
  "dailyResetAt" TIMESTAMP(3) NOT NULL,
  "monthlyResetAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EmailQuotaBaseline_pkey" PRIMARY KEY ("id")
);
