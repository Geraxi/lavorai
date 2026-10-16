import { createHash } from "node:crypto";
import type { Fact } from "./candidate-facts";
import { rolloutApplicationIneligibility } from "./application-rollout";

/** Server-only evidence. Never backfill this from NOT_SUBMITTED or client input.
 * The original reservation identity survives every continuation; workToken is
 * rotated to fence old workers. A final-submit boundary permanently ends reuse. */
export type AnswerContinuation = {
  version: 1; applicationId: string; userId: string; jobId: string; jobUrl: string;
  attemptStartedAt: string; workToken: string; channel: string; consentGrantedAt: string;
  pendingHash: string; pausedAt: string; phase: "paused" | "queued" | "running";
  confirmedAt: string | null; finalSubmitStarted: boolean;
  preTransmissionEvidence?: "greenhouse_blank_form_v1";
  candidateDataStartedAt?: string;
  verificationSubmitStarted?: boolean;
};
export const continuationSelect = {
  id: true, userId: true, jobId: true, createdAt: true, consentGrantedAt: true, retryCount: true,
  status: true, startedAt: true, completedAt: true, submittedAt: true, submittedVia: true,
  submitConfirmation: true, submissionReceiptJson: true, answerContinuationJson: true,
  pendingQuestionsJson: true, userProvidedAnswersJson: true, canaryLog: true,
  viewedAt: true, lastReplyAt: true, replyCount: true, userStatus: true,
} as const;
export type ContinuationRow = {
  id: string; userId: string; jobId: string; createdAt: Date; consentGrantedAt: Date | null; retryCount: number;
  status: string; startedAt: Date | null; completedAt: Date | null; submittedAt: Date | null; submittedVia: string | null;
  submitConfirmation: string | null; submissionReceiptJson: string | null; answerContinuationJson: string | null;
  canaryLog: string | null; pendingQuestionsJson: string | null; viewedAt: Date | null; lastReplyAt: Date | null; replyCount: number; userStatus: string | null;
};
export const continuationDigest = (value: string) => createHash("sha256").update(value).digest("hex");
/** Binds confirmation to the answers and factual sources shown to the candidate,
 * as well as the server proof. A change in another tab requires another review. */
export function answerConfirmationDigest(proof: string, answers: string | null, facts: Fact[]): string {
  return continuationDigest(JSON.stringify([proof, answers, facts.map(fact => JSON.stringify(fact)).sort()]));
}
export function parseAnswerContinuation(json: string | null | undefined): AnswerContinuation | null {
  try {
    const value = JSON.parse(json ?? "null");
    if (!value || value.version !== 1 || !["paused", "queued", "running"].includes(value.phase) || typeof value.finalSubmitStarted !== "boolean") return null;
    for (const key of ["applicationId", "userId", "jobId", "jobUrl", "attemptStartedAt", "workToken", "channel", "consentGrantedAt", "pendingHash", "pausedAt"]) if (typeof value[key] !== "string" || !value[key]) return null;
    for (const key of ["attemptStartedAt", "workToken", "consentGrantedAt", "pausedAt"]) if (!Number.isFinite(Date.parse(value[key]))) return null;
    if (value.confirmedAt !== null && (typeof value.confirmedAt !== "string" || !Number.isFinite(Date.parse(value.confirmedAt)))) return null;
    if (!/^portal_[a-z0-9_-]+$/.test(value.channel) || !/^[a-f0-9]{64}$/.test(value.pendingHash)) return null;
    if (value.channel === "portal_greenhouse" && value.preTransmissionEvidence !== "greenhouse_blank_form_v1") return null;
    if (value.candidateDataStartedAt !== undefined && (typeof value.candidateDataStartedAt !== "string" || !Number.isFinite(Date.parse(value.candidateDataStartedAt)))) return null;
    if (value.verificationSubmitStarted !== undefined && typeof value.verificationSubmitStarted !== "boolean") return null;
    return value;
  } catch { return null; }
}
export function answerContinuationIneligibility(row: ContinuationRow, phase: AnswerContinuation["phase"], jobUrl?: string, now = new Date()): string | null {
  const rollout = rolloutApplicationIneligibility(row, now);
  if (rollout) return rollout;
  if (row.canaryLog) {
    try {
      const diagnostic = JSON.parse(row.canaryLog);
      if (diagnostic?.needsUserInput !== true || Object.keys(diagnostic).some(key => !["needsUserInput", "aiDebug", "questions", "at"].includes(key))) return "continuation_delivery_evidence";
    } catch { return "continuation_delivery_evidence"; }
  }
  const proof = parseAnswerContinuation(row.answerContinuationJson);
  if (!proof || !["portal_recruitee", "portal_greenhouse"].includes(proof.channel) || proof.phase !== phase) return "continuation_proof_missing";
  if (proof.finalSubmitStarted || proof.candidateDataStartedAt || proof.verificationSubmitStarted) return "continuation_delivery_uncertain";
  if (proof.applicationId !== row.id || proof.userId !== row.userId || proof.jobId !== row.jobId
    || (jobUrl !== undefined && proof.jobUrl !== jobUrl) || proof.workToken !== row.startedAt?.toISOString()
    || proof.consentGrantedAt !== row.consentGrantedAt?.toISOString()
    || !row.pendingQuestionsJson || proof.pendingHash !== continuationDigest(row.pendingQuestionsJson)
    || Date.parse(proof.attemptStartedAt) > Date.parse(proof.workToken)
    || Date.parse(proof.attemptStartedAt) < +row.createdAt || Date.parse(proof.consentGrantedAt) > Date.parse(proof.attemptStartedAt)
    || (phase === "paused" && Date.parse(proof.workToken) > Date.parse(proof.pausedAt)) || Date.parse(proof.pausedAt) > +now
    || (phase !== "paused" && (!proof.confirmedAt || Date.parse(proof.confirmedAt) < Date.parse(proof.pausedAt) || Date.parse(proof.confirmedAt) > +now))) return "continuation_proof_mismatch";
  const statuses = phase === "paused" ? ["needs_answers"] : phase === "queued" ? ["queued", "answers_claimed"] : ["optimizing", "ready_to_apply"];
  if (!statuses.includes(row.status) || row.submitConfirmation !== "NOT_SUBMITTED" || row.completedAt
    || row.submittedAt || row.submittedVia || row.submissionReceiptJson || row.viewedAt || row.lastReplyAt || row.replyCount || row.userStatus) return "continuation_delivery_uncertain";
  return null;
}
