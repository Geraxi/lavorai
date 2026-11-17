import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db";
import { applicationsPaused } from "@/lib/application-pause";
import { applicationRolloutConfig, rolloutCreationBlocked } from "@/lib/application-rollout";
import { submissionSubjectKey } from "@/lib/application-submission-budget";
import { maxDrainAttempts } from "@/lib/drain-limits";
import { HELD_MESSAGE_PREFIX, MAX_ATTEMPTS_MESSAGE_PREFIX } from "@/lib/queue-sendability";
import { SKIPPED_ATS_MANUAL_MESSAGE } from "@/lib/ats-skip-hosts";
import { JOB_LIVENESS_UNKNOWN_HELD_MESSAGE } from "@/lib/job-liveness";
import { CONTROLLED_RELEASE_MESSAGE } from "@/lib/application-recovery-release";

/**
 * NOT_SUBMITTED pickup gap.
 *
 * A queued row that the worker stopped BEFORE any irreversible step carries
 * submitConfirmation="NOT_SUBMITTED". When a release path (the
 * APPLICATION_RECOVERY_RELEASE allowlist, the automatic NOT_SUBMITTED release,
 * a quota or stale-lease release) reopens it, it clears startedAt/errorMessage
 * but leaves NOT_SUBMITTED, while the ordinary claim only takes rows whose
 * submitConfirmation is null. Such rows were stranded forever.
 *
 * This normalizes exactly those already-released rows back to a pristine queued
 * row (submitConfirmation null, unsent prepared documents dropped) so every
 * normal admission gate (consent, quota, preferences, dedup ledger, global cap,
 * pre-send fence) runs again. It sends nothing itself.
 *
 * A row is touched only with ZERO evidence that a submit ever started:
 * no submitStartedAt / submitClickPerformedAt, no outbound request, no
 * destination response, no receipt, no proof/sent markers, no canary/answers
 * evidence, no continuation, no views/replies/user status, no email attempt,
 * mailbox send, inbound email or reply row, no submission-ledger reservation
 * (by application or by user+job), and no sibling application for the same
 * user+job. Intentional holds (hold messages, liveness, skip-list handoff,
 * exhausted attempts, controlled release) are never touched.
 */

type DB = Pick<PrismaClient, "application" | "applicationSubmissionReservation" | "$transaction">;
type Tx = Prisma.TransactionClient;

export const NOT_SUBMITTED_CONFIRMATION = "NOT_SUBMITTED";

export function neverSubmittedPickupWhere(now: Date, cutoff: Date, maxAttempts = maxDrainAttempts()): Prisma.ApplicationWhereInput {
  return {
    status: "queued", startedAt: null, leaseToken: null, completedAt: null,
    retryCount: { lt: maxAttempts },
    createdAt: { gt: cutoff, lte: now },
    submitConfirmation: NOT_SUBMITTED_CONFIRMATION,
    sendStatus: "not_sent",
    submitStartedAt: null, submitClickPerformedAt: null,
    outboundSubmissionJson: null, destinationResponseJson: null, submissionReceiptJson: null,
    submittedAt: null, submittedVia: null, sentAt: null, sentProofType: null, sentProofRef: null, confirmedAt: null,
    canaryLog: null, answersUsedJson: null, answerContinuationJson: null,
    viewedAt: null, lastReplyAt: null, replyCount: 0, userStatus: null,
    emailAttempts: { none: {} }, mailboxSends: { none: {} }, inboundEmails: { none: {} }, replies: { none: {} },
  };
}

/** Intentional queued holds stay exactly where they are. */
export function isIntentionalHoldMessage(errorMessage: string | null | undefined): boolean {
  if (!errorMessage) return false;
  return errorMessage.startsWith(HELD_MESSAGE_PREFIX)
    || errorMessage === CONTROLLED_RELEASE_MESSAGE
    || errorMessage === JOB_LIVENESS_UNKNOWN_HELD_MESSAGE
    || errorMessage === SKIPPED_ATS_MANUAL_MESSAGE
    || errorMessage.startsWith(MAX_ATTEMPTS_MESSAGE_PREFIX);
}

/** Pure mirror of the filter, for callers and tests. */
export type PickupEvidenceRow = {
  status: string; startedAt: Date | null; leaseToken?: string | null; completedAt: Date | null;
  retryCount: number; submitConfirmation: string | null; sendStatus?: string | null; errorMessage?: string | null;
  submitStartedAt?: Date | null; submitClickPerformedAt?: Date | null;
  outboundSubmissionJson?: string | null; destinationResponseJson?: string | null; submissionReceiptJson?: string | null;
  submittedAt?: Date | null; submittedVia?: string | null; sentAt?: Date | null; sentProofType?: string | null;
  sentProofRef?: string | null; confirmedAt?: Date | null;
  canaryLog?: string | null; answersUsedJson?: string | null; answerContinuationJson?: string | null;
  viewedAt?: Date | null; lastReplyAt?: Date | null; replyCount?: number | null; userStatus?: string | null;
};

export function neverSubmittedPickupEligible(row: PickupEvidenceRow, maxAttempts = maxDrainAttempts()): boolean {
  if (row.status !== "queued" || row.startedAt || row.leaseToken || row.completedAt) return false;
  if (row.submitConfirmation !== NOT_SUBMITTED_CONFIRMATION) return false;
  if ((row.sendStatus ?? "not_sent") !== "not_sent") return false;
  if (row.retryCount >= maxAttempts) return false;
  if (isIntentionalHoldMessage(row.errorMessage)) return false;
  if (row.submitStartedAt || row.submitClickPerformedAt) return false;
  if (row.outboundSubmissionJson || row.destinationResponseJson || row.submissionReceiptJson) return false;
  if (row.submittedAt || row.submittedVia || row.sentAt || row.sentProofType || row.sentProofRef || row.confirmedAt) return false;
  if (row.canaryLog || row.answersUsedJson || row.answerContinuationJson) return false;
  if (row.viewedAt || row.lastReplyAt || row.replyCount || row.userStatus) return false;
  return true;
}

const pickupSelect = {
  id: true, userId: true, jobId: true, status: true, startedAt: true, leaseToken: true, completedAt: true,
  retryCount: true, submitConfirmation: true, sendStatus: true, errorMessage: true,
  submitStartedAt: true, submitClickPerformedAt: true, outboundSubmissionJson: true,
  destinationResponseJson: true, submissionReceiptJson: true, submittedAt: true, submittedVia: true,
  sentAt: true, sentProofType: true, sentProofRef: true, confirmedAt: true, canaryLog: true,
  answersUsedJson: true, answerContinuationJson: true, viewedAt: true, lastReplyAt: true,
  replyCount: true, userStatus: true,
} satisfies Prisma.ApplicationSelect;

/**
 * Make already-released NOT_SUBMITTED rows claimable again. Returns how many
 * rows were normalized. Never throws into the drain.
 */
export async function pickUpNeverSubmittedRows(opts: { db?: DB; now?: Date; limit?: number } = {}): Promise<number> {
  try {
    if (applicationsPaused() || rolloutCreationBlocked()) return 0;
    const now = opts.now ?? new Date();
    const config = applicationRolloutConfig(now);
    if (!config.enabled || !config.startedAt) return 0;
    const db = (opts.db ?? prisma) as DB;
    const maxAttempts = maxDrainAttempts();
    const where = neverSubmittedPickupWhere(now, config.startedAt, maxAttempts);
    const rows = await db.application.findMany({
      where, select: pickupSelect, orderBy: { createdAt: "asc" }, take: Math.min(50, Math.max(1, opts.limit ?? 25)),
    });
    let picked = 0;
    for (const row of rows) {
      if (!neverSubmittedPickupEligible(row, maxAttempts)) continue;
      const ok = await db.$transaction(async (tx: Tx) => {
        await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtext(${row.userId}))`;
        const reserved = await tx.applicationSubmissionReservation.findFirst({ where: { OR: [
          { applicationId: row.id }, { subjectKey: submissionSubjectKey(row.userId, row.jobId) },
        ] }, select: { id: true } });
        if (reserved) return false;
        const siblings = await tx.application.count({ where: { userId: row.userId, jobId: row.jobId, id: { not: row.id } } });
        if (siblings) return false;
        const changed = await tx.application.updateMany({
          where: { ...where, id: row.id, errorMessage: row.errorMessage },
          data: {
            submitConfirmation: null, sendFailureReason: null,
            // NOT_SUBMITTED proves these prepared files were never transmitted;
            // admission treats unexplained documents as a possible send.
            cvDocxPath: null, cvPdfPath: null, coverLetterPath: null,
          },
        });
        return changed.count === 1;
      });
      if (ok) {
        picked++;
        console.log(`[not-submitted-pickup] ${row.id} reopened for the send queue (no submit evidence)`);
      }
    }
    return picked;
  } catch (err) {
    console.error("[not-submitted-pickup] failed", err instanceof Error ? err.message : err);
    return 0;
  }
}
