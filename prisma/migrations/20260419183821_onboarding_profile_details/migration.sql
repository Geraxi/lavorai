-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "emailVerified" DATETIME,
    "name" TEXT,
    "image" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tier" TEXT NOT NULL DEFAULT 'free',
    "stripeCustomerId" TEXT,
    "stripeSubscriptionId" TEXT,
    "stripePriceId" TEXT,
    "subscriptionStatus" TEXT,
    "currentPeriodEnd" DATETIME,
    "welcomeSeenAt" DATETIME,
    "onboardedAt" DATETIME,
    "lastLoginAt" DATETIME,
    "privacyConsentAt" DATETIME,
    "seniority" TEXT,
    "yearsExperience" INTEGER,
    "englishLevel" TEXT,
    "italianNative" BOOLEAN NOT NULL DEFAULT true,
    "euAuthorized" BOOLEAN NOT NULL DEFAULT true,
    "noticePeriod" TEXT,
    "avoidCompanies" TEXT
);
INSERT INTO "new_User" ("createdAt", "currentPeriodEnd", "email", "emailVerified", "id", "image", "lastLoginAt", "name", "onboardedAt", "privacyConsentAt", "stripeCustomerId", "stripePriceId", "stripeSubscriptionId", "subscriptionStatus", "tier", "welcomeSeenAt") SELECT "createdAt", "currentPeriodEnd", "email", "emailVerified", "id", "image", "lastLoginAt", "name", "onboardedAt", "privacyConsentAt", "stripeCustomerId", "stripePriceId", "stripeSubscriptionId", "subscriptionStatus", "tier", "welcomeSeenAt" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "User_stripeCustomerId_key" ON "User"("stripeCustomerId");
CREATE UNIQUE INDEX "User_stripeSubscriptionId_key" ON "User"("stripeSubscriptionId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
