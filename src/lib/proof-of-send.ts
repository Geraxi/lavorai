/**
 * Proof-of-send: NOTHING counts as "sent" without a recorded proof.
 *
 * `Application.sendStatus` is orthogonal to the internal pipeline `status`:
 *   - "submitted"  ONLY together with sentProofType + sentProofRef + sentAt
 *                  (also enforced by the DB CHECK Application_submitted_requires_proof)
 *   - "needs_user" the attempt may or may not have reached the employer; the
 *                  user must verify/act (reason in sendFailureReason)
 *   - "failed"     provably not sent (reason in sendFailureReason)
 *
 * Pure module (no prisma import) so it is safe in tests and API code.
 */
export const SENT_PROOF_TYPES = [
  "gmail_message_id",
  "ats_confirmation_email",
  "success_page_screenshot",
  "ats_submission_receipt",
  "email_provider_message_id",
] as const;
export type SentProofType = (typeof SENT_PROOF_TYPES)[number];

export interface SentProof { type: SentProofType; ref: string }

const MAX_REF = 500;

export function isValidProof(proof: unknown): proof is SentProof {
  if (!proof || typeof proof !== "object") return false;
  const p = proof as Partial<SentProof>;
  return typeof p.type === "string" && (SENT_PROOF_TYPES as readonly string[]).includes(p.type)
    && typeof p.ref === "string" && p.ref.trim().length > 0 && p.ref.length <= MAX_REF
    // Synthetic ids from dry-runs/mocks are never proof.
    && !/^(dryrun-|mock|dry_run)/i.test(p.ref.trim());
}

/** Update fragment marking an application submitted. Throws without valid proof. */
export function submittedWithProof(proof: SentProof, at: Date = new Date()) {
  if (!isValidProof(proof)) throw new Error("proof_required");
  return {
    sendStatus: "submitted" as const,
    sendFailureReason: null,
    sentProofType: proof.type,
    sentProofRef: proof.ref.trim(),
    sentAt: at,
  };
}

/** Update fragment for an attempt without proof. Never sets submitted. */
export function notSubmitted(kind: "needs_user" | "failed", reason: string) {
  return {
    sendStatus: kind,
    sendFailureReason: (reason || kind).replace(/[\r\n]+/g, " ").slice(0, 300),
  };
}

/**
 * Derive proof for a portal completion. A post-submit screenshot (canary/debug
 * upload) beats the receipt; otherwise the verified ATS receipt itself is the
 * proof. Returns null when neither exists.
 */
export function portalProof(input: {
  receipt: { provider: string; kind: string; receiptId?: string; capturedAt: string; jobId: string } | null | undefined;
  postSubmitScreenshotUrl?: string | null;
}): SentProof | null {
  const shot = input.postSubmitScreenshotUrl?.trim();
  if (shot && /^https:\/\//.test(shot)) return { type: "success_page_screenshot", ref: shot.slice(0, MAX_REF) };
  const r = input.receipt;
  if (!r) return null;
  return { type: "ats_submission_receipt", ref: `${r.provider}:${r.jobId}:${r.receiptId ?? r.kind}:${r.capturedAt}`.slice(0, MAX_REF) };
}
