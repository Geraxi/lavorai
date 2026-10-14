import { prisma } from "@/lib/db";
import { completeApplicationSubmission } from "@/lib/application-worker-gates";

/** Repair only bookkeeping after proven provider acceptance. Never send, reset
 * an ownership token, requeue work or require current consent for a past send.
 * The same locked completion gate atomically updates the round exactly once.
 */
export async function reconcileAcceptedApplicationEmails(limit = 20): Promise<{
  reconciled: number; skipped: number; failed: number;
}> {
  const attempts = await prisma.applicationEmailAttempt.findMany({
    where: {
      providerEmailId: { not: null }, acceptedAt: { not: null },
      application: { OR: [
        { status: "applying", submitConfirmation: "SUBMISSION_STARTED" },
        { status: "ready_to_apply", submitConfirmation: "UNCONFIRMED" },
      ] },
    },
    orderBy: { acceptedAt: "asc" }, take: Math.max(1, Math.min(100, limit)),
    select: { applicationId: true, attemptKey: true, acceptedAt: true,
      application: { select: { startedAt: true } } },
  });
  let reconciled = 0; let skipped = 0; let failed = 0;
  for (const attempt of attempts) {
    const token = attempt.application.startedAt;
    if (!token || !attempt.acceptedAt || attempt.attemptKey !== `application-${attempt.applicationId}-${token.getTime()}`) {
      skipped++; continue;
    }
    try {
      const changed = await completeApplicationSubmission(attempt.applicationId, token, {
        submittedVia: "email_recruiter", submitConfirmation: "EMAIL_SENT",
        submittedAt: attempt.acceptedAt, completedAt: new Date(), errorMessage: null,
      });
      if (changed) reconciled++; else skipped++;
    } catch { failed++; }
  }
  return { reconciled, skipped, failed };
}
