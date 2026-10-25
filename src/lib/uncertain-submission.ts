import { hasPotentialSubmission } from "@/lib/application-worker-gates";

export const UNCERTAIN_SUBMISSION_MESSAGE =
  "Invio precedente o tentativo con esito da verificare. Nessun nuovo invio automatico: controlla la consegna prima di ritentare.";

export type UncertainEvidenceRow = {
  submitStartedAt?: Date | null;
  submitClickPerformedAt?: Date | null;
  outboundSubmissionJson?: string | null;
  destinationResponseJson?: string | null;
  submittedAt?: Date | null;
  submittedVia?: string | null;
  submitConfirmation?: string | null;
  canaryLog?: string | null;
  answersUsedJson?: string | null;
  viewedAt?: Date | null;
  lastReplyAt?: Date | null;
  replyCount?: number | null;
  userStatus?: string | null;
};

const NO_SEND_CONFIRMATIONS = new Set(["NOT_SUBMITTED", "NEEDS_ANSWERS", "DRY_RUN", "JOB_CLOSED", "REJECTED_NOT_SENT"]);

/** Standalone: prior attempt / submit_started / unconfirmed evidence.
 * Independent of historicalRetriesBlocked(). Never auto-resubmit.
 * NEEDS_ANSWERS / NOT_SUBMITTED / REJECTED_NOT_SENT are proof of no send and stay resumable. */
export function uncertainAutoRetryReason(row: UncertainEvidenceRow): string | null {
  if (row.submitConfirmation === "REJECTED_NOT_SENT") {
    if (row.submittedAt || row.submittedVia || row.viewedAt || row.lastReplyAt || row.replyCount || row.userStatus) {
      return "uncertain_prior_attempt";
    }
    return null;
  }
  if (row.submitStartedAt || row.submitClickPerformedAt) return "uncertain_submit_started";
  if (row.outboundSubmissionJson) return "uncertain_outbound_request";
  if (row.submitConfirmation === "UNCONFIRMED" || row.submitConfirmation === "SUBMISSION_STARTED") {
    return "uncertain_submission";
  }
  if (NO_SEND_CONFIRMATIONS.has(row.submitConfirmation ?? "")) {
    if (row.submittedAt || row.submittedVia || row.viewedAt || row.lastReplyAt || row.replyCount || row.userStatus) {
      return "uncertain_prior_attempt";
    }
    return null;
  }
  if (hasPotentialSubmission(row as never)) return "uncertain_prior_attempt";
  return null;
}

export function blocksUncertainAutoRetry(row: UncertainEvidenceRow): boolean {
  return uncertainAutoRetryReason(row) !== null;
}
