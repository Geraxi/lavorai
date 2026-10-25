/**
 * Three distinct send-evidence levels recorded on every portal attempt:
 *   1. submit click performed
 *   2. outgoing submission request observed (matched POST/XHR)
 *   3. destination response (status / body / receipt / candidate id)
 *
 * After a click or outbound request, ambiguity (timeout, challenge, missing
 * response) stays uncertain. Only an explicit 4xx/validation rejection with
 * no acceptance is rejected-not-sent.
 */
export type OutboundSubmissionEvidence = {
  capturedAt: string;
  provider: string;
  jobId: string;
  endpoint: string;
  operation?: string;
  method: string;
};

export type DestinationResponseEvidence = {
  capturedAt: string;
  httpStatus?: number | null;
  rejected: boolean;
  ambiguous: boolean;
  signal?: string;
  receiptId?: string;
};

export type SubmissionAttemptEvidence = {
  version: 1;
  clickPerformed: boolean;
  clickPerformedAt?: string;
  outboundRequest: OutboundSubmissionEvidence | null;
  destinationResponse: DestinationResponseEvidence | null;
};

export const REJECTED_NOT_SENT = "REJECTED_NOT_SENT";

export function emptyAttemptEvidence(): SubmissionAttemptEvidence {
  return { version: 1, clickPerformed: false, outboundRequest: null, destinationResponse: null };
}

export function attemptEvidenceWrite(ev?: SubmissionAttemptEvidence | null): {
  submitClickPerformedAt?: Date;
  outboundSubmissionJson?: string;
  destinationResponseJson?: string;
} {
  if (!ev) return {};
  return {
    ...(ev.clickPerformed && ev.clickPerformedAt
      ? { submitClickPerformedAt: new Date(ev.clickPerformedAt) }
      : {}),
    ...(ev.outboundRequest ? { outboundSubmissionJson: JSON.stringify(ev.outboundRequest) } : {}),
    ...(ev.destinationResponse ? { destinationResponseJson: JSON.stringify(ev.destinationResponse) } : {}),
  };
}
