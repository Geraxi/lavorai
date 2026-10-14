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

/** Caller must atomically deduplicate the source message in this same transaction.
 * Receipts and automation remain visible as messages but do not inflate human
 * replies or mark an application read by a person.
 */
export async function applyReplyToApplication(
  input: ApplyReplyInput,
  tx: Pick<Prisma.TransactionClient, "application"> = prisma,
): Promise<boolean> {
  if (!input.isHuman || !["risposta", "colloquio", "rifiutata"].includes(input.kind)) return true;
  const app = await tx.application.findUnique({
    where: { id: input.applicationId }, select: { userStatus: true, lastReplyAt: true, status: true },
  });
  if (!app) return false;
  if (app.status === "diagnostic") return true; // Stored test reply is not employer interest.
  const receivedAt = input.receivedAt ?? new Date();
  const stale = !!app.lastReplyAt && receivedAt < app.lastReplyAt;
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
