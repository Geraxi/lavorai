import { hasVerifiedSubmissionReceipt } from "@/lib/submission-receipt";

export interface DeliveryEvidenceInput {
  status: string;
  submittedVia: string | null;
  submitConfirmation?: string | null;
  submissionReceiptJson?: string | null;
  /** Query ordered newest first; one application counts once, never per attempt. */
  emailAttempts?: { status: string; providerEmailId: string | null; acceptedAt?: Date | null; createdAt?: Date }[];
}
export type DeliveryEvidence = "confirmed_portal" | "confirmed_email" | "provider_accepted" | "delivery_problem" | "pending" | "legacy_unverified" | "excluded";

export function deliveryEvidence(application: DeliveryEvidenceInput): DeliveryEvidence {
  if (application.status === "diagnostic") return "excluded";
  if (application.submittedVia === "mock_demo" || ["DRY_RUN", "UNCONFIRMED"].includes(application.submitConfirmation ?? "")) return "excluded";
  const attempt = application.emailAttempts?.[0];
  if (application.status === "failed") return "delivery_problem";
  // Invio dalla casella dell'utente (Gmail/Graph): evidenza = id provider + esito controllo rimbalzi.
  if (application.submittedVia?.startsWith("mailbox_")) {
    if (application.submitConfirmation === "MAILBOX_BOUNCED") return "delivery_problem";
    if (application.submitConfirmation === "MAILBOX_NO_BOUNCE") return "confirmed_email";
    if (application.submitConfirmation === "MAILBOX_ACCEPTED") return "provider_accepted";
    return "legacy_unverified";
  }
  if ((application.submittedVia === "email_recruiter" || !application.submittedVia) && attempt) {
    if (["failed", "bounced", "complained"].includes(attempt.status)) return "delivery_problem";
    if (attempt.providerEmailId && attempt.status === "delivered") return "confirmed_email";
    if (attempt.providerEmailId && ["accepted", "delayed"].includes(attempt.status)) return "provider_accepted";
    return "pending";
  }
  if (application.status === "success" && application.submittedVia?.startsWith("portal_") && hasVerifiedSubmissionReceipt(application.submissionReceiptJson, application.submittedVia)) return "confirmed_portal";
  if (application.status === "success" && application.submittedVia) return "legacy_unverified";
  return attempt ? "pending" : "excluded";
}

export function isConfirmedDelivery(evidence: DeliveryEvidence): boolean {
  return evidence === "confirmed_portal" || evidence === "confirmed_email";
}

export function applicationEvidenceDate(application: DeliveryEvidenceInput & { submittedAt: Date | null; completedAt: Date | null; createdAt: Date }): Date {
  return application.submittedAt ?? application.emailAttempts?.[0]?.acceptedAt ?? application.emailAttempts?.[0]?.createdAt ?? application.completedAt ?? application.createdAt;
}
