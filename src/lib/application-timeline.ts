import { deliveryEvidence, type DeliveryEvidenceInput } from "./application-evidence";
import { parseVerifiedSubmissionReceipt } from "./submission-receipt";
export interface EvidenceStep { kind: "prepared" | "submitted" | "delivered" | "response"; state: "observed" | "unknown" | "pending" | "problem"; at: string | null; source: string }
type Input = DeliveryEvidenceInput & { cvPdfPath?: string | null; cvDocxPath?: string | null; coverLetterText?: string | null; coverLetterPath?: string | null;
  emailAttempts?: Array<{ status: string; providerEmailId: string | null; acceptedAt?: Date | null; events?: Array<{ type: string; occurredAt: Date }> }>;
  replies?: Array<{ receivedAt: Date }>; gmailMessages?: Array<{ date: Date }> };
/** No created/completed timestamps are substituted for missing event evidence. */
export function applicationTimeline(app: Input): EvidenceStep[] {
  const evidence = deliveryEvidence(app); const email = app.emailAttempts?.[0];
  const receipt = parseVerifiedSubmissionReceipt(app.submissionReceiptJson, app.submittedVia);
  const excluded = app.status === "diagnostic" || app.submittedVia === "mock_demo" || ["DRY_RUN", "UNCONFIRMED"].includes(app.submitConfirmation ?? "");
  const accepted = !excluded && !!email?.providerEmailId && !!email?.acceptedAt;
  const delivered = !excluded && email?.providerEmailId ? email.events?.find(e => e.type === "email.delivered") : null;
  const replies = [...(app.replies ?? []).map(r => r.receivedAt), ...(app.gmailMessages ?? []).map(r => r.date)].sort((a,b) => +a - +b);
  return [
    { kind: "prepared", state: app.cvPdfPath || app.cvDocxPath || app.coverLetterPath || app.coverLetterText ? "observed" : "unknown", at: null, source: "materials" },
    { kind: "submitted", state: evidence === "confirmed_portal" || accepted ? "observed" : evidence === "delivery_problem" ? "problem" : "unknown", at: evidence === "confirmed_portal" ? receipt!.capturedAt : accepted ? email!.acceptedAt!.toISOString() : null, source: evidence === "confirmed_portal" ? "ats_receipt" : accepted ? "provider_acceptance" : "no_receipt" },
    { kind: "delivered", state: evidence === "confirmed_portal" ? "observed" : evidence === "delivery_problem" ? "problem" : evidence === "confirmed_email" ? "observed" : "pending", at: evidence === "confirmed_portal" ? receipt!.capturedAt : evidence === "confirmed_email" ? delivered?.occurredAt.toISOString() ?? null : null, source: evidence === "confirmed_portal" ? "ats_receipt" : evidence === "delivery_problem" ? "delivery_failure" : "recipient_server" },
    { kind: "response", state: replies.length && !excluded ? "observed" : "unknown", at: !excluded ? replies[0]?.toISOString() ?? null : null, source: "classified_message" },
  ];
}
