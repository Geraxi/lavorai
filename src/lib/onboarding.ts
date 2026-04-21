import { prisma } from "@/lib/db";
import type { ChecklistState } from "@/components/onboarding-checklist";

/**
 * Deriva lo stato onboarding dell'utente dal DB.
 * Tutti i flag sono computati — niente denormalizzazione.
 */
export async function getOnboardingState(
  userId: string,
): Promise<ChecklistState> {
  const [cvCount, prefs, appCount] = await Promise.all([
    prisma.cVDocument.count({ where: { userId } }),
    prisma.userPreferences.findUnique({ where: { userId } }),
    prisma.application.count({ where: { userId } }),
  ]);

  return {
    hasUploadedCv: cvCount > 0,
    hasSetPreferences: !!prefs && prefs.rolesJson !== "[]",
    hasBrowsedJobs: appCount > 0 || !!prefs, // proxy: se ha preferenze o candidature ha esplorato
    hasFirstApplication: appCount > 0,
  };
}
