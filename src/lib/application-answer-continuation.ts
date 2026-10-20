import { createHash } from "node:crypto";
import type { Fact } from "./candidate-facts";
import { rolloutApplicationIneligibility } from "./application-rollout";

/** Server-only evidence. Never backfill this from NOT_SUBMITTED or client input.
 * The original reservation identity survives every continuation; workToken is
 * rotated to fence old workers. A final-submit boundary permanently ends reuse. */
export type AnswerContinuation = {
  version: 1; applicationId: string; userId: string; jobId: string; jobUrl: string;
  attemptStartedAt: string; workToken: string; channel: string;
  /** null only while paused with consentSource "answers": the candidate's
   * confirmation on Domande is the per-application consent (product decision
   * 20 Oct 2026), recorded at queue time together with consentNote. */
  consentGrantedAt: string | null;
  consentSource?: "explicit" | "answers";
  consentNote?: string;
  pendingHash: string; pausedAt: string; phase: "paused" | "queued" | "running";
  confirmedAt: string | null; finalSubmitStarted: boolean;
  preTransmissionEvidence?: PreTransmissionEvidence;
  candidateDataStartedAt?: string;
  verificationSubmitStarted?: boolean;
};
export type PreTransmissionEvidence = "greenhouse_blank_form_v1" | "ashby_blank_form_v1";
/** Channels whose pause is attested before any candidate data reaches the portal. */
export const CONTINUATION_CHANNELS = ["portal_recruitee", "portal_greenhouse", "portal_ashby"];
/** Channels with a staged blank-form -> candidate data -> final submit boundary. */
export const STAGED_CHANNELS = ["portal_greenhouse", "portal_ashby"];
export const BLANK_FORM_EVIDENCE: Record<string, PreTransmissionEvidence> = {
  portal_greenhouse: "greenhouse_blank_form_v1", portal_ashby: "ashby_blank_form_v1",
};
export const ANSWERS_CONSENT_NOTE = "Consenso per questa candidatura dato confermando le risposte su Domande";
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
    if (value.consentSource !== undefined && !["explicit", "answers"].includes(value.consentSource)) return null;
    // Consent may be pending only for a paused, answers-sourced proof.
    const consentPending = value.consentGrantedAt === null && value.consentSource === "answers" && value.phase === "paused";
    for (const key of ["applicationId", "userId", "jobId", "jobUrl", "attemptStartedAt", "workToken", "channel", ...(consentPending ? [] : ["consentGrantedAt"]), "pendingHash", "pausedAt"]) if (typeof value[key] !== "string" || !value[key]) return null;
    for (const key of ["attemptStartedAt", "workToken", ...(consentPending ? [] : ["consentGrantedAt"]), "pausedAt"]) if (!Number.isFinite(Date.parse(value[key]))) return null;
    if (value.confirmedAt !== null && (typeof value.confirmedAt !== "string" || !Number.isFinite(Date.parse(value.confirmedAt)))) return null;
    if (!/^portal_[a-z0-9_-]+$/.test(value.channel) || !/^[a-f0-9]{64}$/.test(value.pendingHash)) return null;
    if (BLANK_FORM_EVIDENCE[value.channel] && value.preTransmissionEvidence !== BLANK_FORM_EVIDENCE[value.channel]) return null;
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
  if (!proof || !CONTINUATION_CHANNELS.includes(proof.channel) || proof.phase !== phase) return "continuation_proof_missing";
  const answersConsent = proof.consentSource === "answers";
  const consentOk = proof.consentGrantedAt === null
    ? answersConsent && phase === "paused" && row.consentGrantedAt === null
    : proof.consentGrantedAt === row.consentGrantedAt?.toISOString()
      // Explicit consent precedes the attempt; answers-sourced consent is given
      // after the verified blank-form pause and before (or at) confirmation.
      && (answersConsent
        ? Date.parse(proof.consentGrantedAt) >= Date.parse(proof.pausedAt) && (!proof.confirmedAt || Date.parse(proof.consentGrantedAt) <= Date.parse(proof.confirmedAt))
        : Date.parse(proof.consentGrantedAt) <= Date.parse(proof.attemptStartedAt));
  if (proof.finalSubmitStarted || proof.candidateDataStartedAt || proof.verificationSubmitStarted) return "continuation_delivery_uncertain";
  if (proof.applicationId !== row.id || proof.userId !== row.userId || proof.jobId !== row.jobId
    || (jobUrl !== undefined && proof.jobUrl !== jobUrl) || proof.workToken !== row.startedAt?.toISOString()
    || !consentOk
    || !row.pendingQuestionsJson || proof.pendingHash !== continuationDigest(row.pendingQuestionsJson)
    || Date.parse(proof.attemptStartedAt) > Date.parse(proof.workToken)
    || Date.parse(proof.attemptStartedAt) < +row.createdAt
    || (phase === "paused" && Date.parse(proof.workToken) > Date.parse(proof.pausedAt)) || Date.parse(proof.pausedAt) > +now
    || (phase !== "paused" && (!proof.confirmedAt || Date.parse(proof.confirmedAt) < Date.parse(proof.pausedAt) || Date.parse(proof.confirmedAt) > +now))) return "continuation_proof_mismatch";
  const statuses = phase === "paused" ? ["needs_answers"] : phase === "queued" ? ["queued", "answers_claimed"] : ["optimizing", "ready_to_apply"];
  if (!statuses.includes(row.status) || row.submitConfirmation !== "NOT_SUBMITTED" || row.completedAt
    || row.submittedAt || row.submittedVia || row.submissionReceiptJson || row.viewedAt || row.lastReplyAt || row.replyCount || row.userStatus) return "continuation_delivery_uncertain";
  return null;
}
