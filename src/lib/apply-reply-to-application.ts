/** Human outcomes are separate from receipts, automated mail and email opens. */
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { replyKindToUserStatus, type ReplyKind } from "@/lib/reply-parser";

export interface ApplyReplyInput {
  applicationId: string;
  kind: ReplyKind;
  isHuman: boolean;
  receivedAt?: Date;
  /** Kept for callers, but state is read inside the transaction to avoid staleness. */
  existingApp?: { userStatus: string | null };
}

const HUMAN_KINDS = new Set(["risposta", "colloquio", "rifiutata"]);
const SILENT_SURFACE_KINDS = new Set(["ricevuta", "auto_reply", "redirected_to_portal"]);

/** Caller must atomically deduplicate the source message in this same transaction.
 * Receipts and automation remain visible as messages but do not inflate human
 * replies or mark an application read by a person. Auto-replies and
 * apply-via-portal notices never become "rifiutata".
 */
export async function applyReplyToApplication(
  input: ApplyReplyInput,
  tx: Pick<Prisma.TransactionClient, "application"> = prisma,
): Promise<boolean> {
  const app = await tx.application.findUnique({
    where: { id: input.applicationId }, select: { userStatus: true, lastReplyAt: true, lastReplyKind: true, status: true },
  });
  if (!app) return false;
  if (app.status === "diagnostic") return true; // Stored test reply is not employer interest.
  const receivedAt = input.receivedAt ?? new Date();
  const stale = !!app.lastReplyAt && receivedAt < app.lastReplyAt;
  const humanKindLocked = HUMAN_KINDS.has(app.lastReplyKind ?? "")
    || HUMAN_KINDS.has(app.userStatus ?? "")
    || app.userStatus === "offerta";

  if (!input.isHuman || !HUMAN_KINDS.has(input.kind)) {
    if (SILENT_SURFACE_KINDS.has(input.kind) && !stale && !humanKindLocked) {
      await tx.application.update({
        where: { id: input.applicationId },
        data: { lastReplyKind: input.kind },
      });
    }
    return true;
  }

  const nextStatus = replyKindToUserStatus(input.kind);
  const keepExisting = app.userStatus === "offerta" ||
    (["colloquio", "rifiutata"].includes(app.userStatus ?? "") && input.kind === "risposta");
  await tx.application.update({ where: { id: input.applicationId }, data: {
    replyCount: { increment: 1 },
    ...(!stale ? { lastReplyAt: receivedAt, lastReplyKind: input.kind } : {}),
    ...(!stale && nextStatus && !keepExisting ? { userStatus: nextStatus } : {}),
  } });
  return true;
}
