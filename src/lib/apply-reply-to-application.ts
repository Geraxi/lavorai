/**
 * Shared logic for applying recruiter replies to Applications.
 * 
 * Used by:
 * 1. Inbound webhook (ApplicationReply from Resend)
 * 2. Gmail sync (GmailMessage classification)
 * 
 * Updates Application fields: lastReplyAt, lastReplyKind, replyCount, userStatus
 * based on the reply classification (colloquio, rifiutata, risposta, ricevuta, auto, bounce).
 */

import { prisma } from "@/lib/db";
import { replyKindToUserStatus, type ReplyKind } from "@/lib/reply-parser";

export interface ApplyReplyInput {
  applicationId: string;
  kind: ReplyKind;
  isHuman: boolean;
  /** 
   * Optional: existing application data to avoid refetching.
   * If not provided, will fetch from DB.
   */
  existingApp?: {
    userStatus: string | null;
  };
}

/**
 * Apply a reply to an Application, updating lastReplyAt, lastReplyKind, 
 * replyCount, and userStatus according to classification.
 * 
 * Idempotent at the caller level: Gmail sync checks for existing messages
 * before calling this, so each unique message is processed once.
 * 
 * @returns true if application was updated, false if not found
 */
export async function applyReplyToApplication(input: ApplyReplyInput): Promise<boolean> {
  const { applicationId, kind, isHuman, existingApp } = input;

  // Fetch app if not provided
  let app = existingApp;
  if (!app) {
    const fetched = await prisma.application.findUnique({
      where: { id: applicationId },
      select: { userStatus: true },
    });
    if (!fetched) return false;
    app = fetched;
  }

  // Apply update based on classification
  if (isHuman) {
    // Human reply: update lastReplyAt, lastReplyKind, increment replyCount
    // Set userStatus ONLY if we don't have a more advanced status already
    const nextStatus = replyKindToUserStatus(kind);
    const ADVANCED = ["offerta", "colloquio"];
    const keepExisting =
      app.userStatus && ADVANCED.includes(app.userStatus) && kind === "risposta";

    await prisma.application.update({
      where: { id: applicationId },
      data: {
        lastReplyAt: new Date(),
        lastReplyKind: kind,
        replyCount: { increment: 1 },
        ...(nextStatus && !keepExisting ? { userStatus: nextStatus } : {}),
      },
    });
  } else if (kind === "ricevuta") {
    // Confirmation receipt: proof of delivery. Counts as reply,
    // marks "vista" if no status yet, doesn't overwrite anything else.
    await prisma.application.update({
      where: { id: applicationId },
      data: {
        lastReplyAt: new Date(),
        lastReplyKind: kind,
        replyCount: { increment: 1 },
        viewedAt: new Date(),
        ...(app.userStatus ? {} : { userStatus: "vista" }),
      },
    });
  } else {
    // auto/bounce: track count but don't touch status
    await prisma.application.update({
      where: { id: applicationId },
      data: { replyCount: { increment: 1 } },
    });
  }

  return true;
}
