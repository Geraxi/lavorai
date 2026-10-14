-- Additive, durable cross-channel customer submission budget. No historical
-- rows, customer preferences, existing tables or migration history are changed.
CREATE TABLE "ApplicationSubmissionReservation" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "subjectKey" TEXT NOT NULL,
    "attemptStartedAt" TIMESTAMP(3) NOT NULL,
    "channel" TEXT NOT NULL,
    "rolloutStartedAt" TIMESTAMP(3) NOT NULL,
    "budgetDay" DATE NOT NULL,
    "reservedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ApplicationSubmissionReservation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ApplicationSubmissionReservation_applicationId_budgetDay_key"
    ON "ApplicationSubmissionReservation"("applicationId", "budgetDay");
CREATE INDEX "ApplicationSubmissionReservation_budgetDay_idx"
    ON "ApplicationSubmissionReservation"("budgetDay");
CREATE UNIQUE INDEX "ApplicationSubmissionReservation_subjectKey_budgetDay_key"
    ON "ApplicationSubmissionReservation"("subjectKey", "budgetDay");
