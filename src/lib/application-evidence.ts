import { hasVerifiedSubmissionReceipt } from "@/lib/submission-receipt";

export interface DeliveryEvidenceInput {
  status: string;
  submittedVia: string | null;
  submitConfirmation?: string | null;
  submissionReceiptJson?: string | null;
  confirmedAt?: Date | string | null;
  /** Query ordered newest first; one application counts once, never per attempt. */
  emailAttempts?: { status: string; providerEmailId: string | null; acceptedAt?: Date | null; createdAt?: Date }[];
}

export type DeliveryEvidence =
  | "confirmed_portal"
  | "confirmed_email"
  | "provider_accepted"
  | "provider_delivered"
  | "sent_no_bounce"
  | "outcome_unknown"
  | "delivery_problem"
  | "pending"
  | "legacy_unverified"
  | "excluded";

/** Distinct confirmation statuses used by dashboard, analytics and cron counts. */
export type ConfirmationStatus =
  | "ats_accepted"
  | "provider_accepted"
  | "email_delivered"
  | "sent_no_bounce"
  | "outcome_unknown";

export function deliveryEvidence(application: DeliveryEvidenceInput): DeliveryEvidence {
  if (application.status === "diagnostic") return "excluded";
  // ATS destination confirmation (inbound receipt email), not mailbox no-bounce.
  if (application.confirmedAt) return "confirmed_email";
  if (application.submittedVia === "mock_demo" || ["DRY_RUN", "UNCONFIRMED"].includes(application.submitConfirmation ?? "")) return "excluded";
  const attempt = application.emailAttempts?.[0];
  if (application.status === "failed") return "delivery_problem";
  if (application.submittedVia?.startsWith("mailbox_")) {
    if (application.submitConfirmation === "MAILBOX_BOUNCED") return "delivery_problem";
    if (application.submitConfirmation === "MAILBOX_NO_BOUNCE") return "sent_no_bounce";
    if (application.submitConfirmation === "MAILBOX_ACCEPTED") return "provider_accepted";
    return "outcome_unknown";
  }
  if ((application.submittedVia === "email_recruiter" || !application.submittedVia) && attempt) {
    if (["failed", "bounced", "complained"].includes(attempt.status)) return "delivery_problem";
    if (attempt.status === "sending") return "pending";
    // Resend delivered = recipient MTA accepted the message, not an employer receipt.
    if (attempt.providerEmailId && attempt.status === "delivered") return "provider_delivered";
    if (attempt.providerEmailId && ["accepted", "delayed"].includes(attempt.status)) return "provider_accepted";
    return "outcome_unknown";
  }
  if (application.status === "success" && application.submittedVia?.startsWith("portal_") && hasVerifiedSubmissionReceipt(application.submissionReceiptJson, application.submittedVia)) return "confirmed_portal";
  if (application.status === "success" && application.submittedVia) return "legacy_unverified";
  if (["UNCONFIRMED", "SUBMISSION_STARTED"].includes(application.submitConfirmation ?? "")) return "outcome_unknown";
  return attempt ? "pending" : "excluded";
}

export function confirmationStatus(evidence: DeliveryEvidence): ConfirmationStatus | null {
  switch (evidence) {
    case "confirmed_portal":
    case "confirmed_email":
      return "ats_accepted";
    case "provider_accepted":
      return "provider_accepted";
    case "provider_delivered":
      return "email_delivered";
    case "sent_no_bounce":
      return "sent_no_bounce";
    case "outcome_unknown":
      return "outcome_unknown";
    default:
      return null;
  }
}

export function confirmationStatusOf(application: DeliveryEvidenceInput): ConfirmationStatus | null {
  return confirmationStatus(deliveryEvidence(application));
}

export function isConfirmedDelivery(evidence: DeliveryEvidence): boolean {
  return evidence === "confirmed_portal" || evidence === "confirmed_email";
}

/** status=success with a send timestamp but no verified receipt. Not a fabricated proof. Never upgraded. */
export function isSentUnverified(application: DeliveryEvidenceInput & { submittedAt?: Date | string | null }): boolean {
  if (application.status !== "success" || !application.submittedAt) return false;
  const evidence = deliveryEvidence(application);
  return evidence === "legacy_unverified" || evidence === "excluded";
}

export function applicationEvidenceDate(application: DeliveryEvidenceInput & { submittedAt: Date | null; completedAt: Date | null; createdAt: Date }): Date {
  return application.submittedAt ?? application.emailAttempts?.[0]?.acceptedAt ?? application.emailAttempts?.[0]?.createdAt ?? application.completedAt ?? application.createdAt;
}
