/**
 * Account prerequisites the worker enforces before any submission
 * (see `currentWorkerIneligibility`). Checking them when the user confirms an
 * application avoids creating rows that the worker can only hold: a held row
 * keeps its claim and is never retried automatically during the rollout, so a
 * missing privacy consent used to strand explicitly confirmed (and sometimes
 * paid) applications silently in "queued".
 */
export interface ApplicationPrerequisiteBlock {
  status: 409;
  body: { error: "privacy_consent_required" | "activation_incomplete"; issue: "privacy_consent" | "verify_email"; message: string; redirect: string };
}

export function applicationPrerequisiteBlock(user: {
  privacyConsentAt?: Date | null;
  emailVerified?: Date | null;
}): ApplicationPrerequisiteBlock | null {
  if (!user.privacyConsentAt) return { status: 409, body: {
    error: "privacy_consent_required", issue: "privacy_consent",
    message: "Prima di inviare candidature leggi l’informativa e dai il consenso privacy nelle Impostazioni.",
    redirect: "/settings#privacy-consent",
  } };
  if (!user.emailVerified) return { status: 409, body: {
    error: "activation_incomplete", issue: "verify_email",
    message: "Verifica prima la tua email per attivare le candidature.",
    redirect: "/onboarding",
  } };
  return null;
}
