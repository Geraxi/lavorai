import { prisma } from "@/lib/db";

export type ActivationIssue =
  | "verify_email"
  | "upload_cv"
  | "choose_role"
  | "choose_location"
  | "choose_work_mode"
  | "add_professional_details";

function hasItems(value: string | null | undefined) {
  try {
    const parsed = JSON.parse(value ?? "[]");
    return Array.isArray(parsed) && parsed.length > 0;
  } catch {
    return false;
  }
}

export async function getActivationReadiness(userId: string, { requireVerifiedEmail = true }: { requireVerifiedEmail?: boolean } = {}) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      emailVerified: true,
      seniority: true,
      englishLevel: true,
      noticePeriod: true,
      _count: { select: { cvDocuments: true } },
      preferences: { select: { rolesJson: true, locationsJson: true, sourcesJson: true } },
    },
  });

  if (!user) return { ready: false, issue: "verify_email" as ActivationIssue };
  if (requireVerifiedEmail && !user.emailVerified) return { ready: false, issue: "verify_email" as ActivationIssue };
  if (user._count.cvDocuments === 0) return { ready: false, issue: "upload_cv" as ActivationIssue };
  if (!hasItems(user.preferences?.rolesJson)) return { ready: false, issue: "choose_role" as ActivationIssue };
  if (!hasItems(user.preferences?.locationsJson)) return { ready: false, issue: "choose_location" as ActivationIssue };
  if (!hasItems(user.preferences?.sourcesJson)) return { ready: false, issue: "choose_work_mode" as ActivationIssue };
  if (!user.seniority || !user.englishLevel || !user.noticePeriod) {
    return { ready: false, issue: "add_professional_details" as ActivationIssue };
  }
  return { ready: true, issue: null };
}

export const ACTIVATION_MESSAGES: Record<ActivationIssue, string> = {
  verify_email: "Verifica prima la tua email per attivare le candidature.",
  upload_cv: "Carica il tuo CV prima di attivare le candidature.",
  choose_role: "Scegli almeno un ruolo per cui candidarti.",
  choose_location: "Scegli almeno una località di ricerca.",
  choose_work_mode: "Scegli almeno una modalità di lavoro.",
  add_professional_details: "Completa seniority, inglese e preavviso per ricevere candidature mirate.",
};
