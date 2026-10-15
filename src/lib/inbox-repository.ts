import { RELEASE_CANARY } from "@/lib/release-email-canary";
import { prisma } from "@/lib/db";
import { isApplicationVerificationMessage } from "@/lib/reply-security-message";
import { formatInboxEmailText } from "@/lib/inbox-email-text";
import { isLikelyJobMail } from "@/lib/gmail-match";
import { inboxKindLabel, type InboxMessage } from "@/lib/inbox-message";

function isSecurityMessage(message: { fromAddress: string; subject: string | null; bodyText: string | null; snippet?: string | null }): boolean {
  return isApplicationVerificationMessage({
    fromAddress: message.fromAddress,
    subject: formatInboxEmailText(message.subject ?? ""),
    bodyText: formatInboxEmailText(message.bodyText ?? message.snippet ?? ""),
  });
}

/**
 * The caller must authenticate first. Every query is scoped to that user; the
 * inbound relationship is authoritative even when Gmail is not connected.
 * Already synced Gmail is retained if the connection is later removed.
 */
const inboundSelect = {
  id: true, applicationId: true, fromAddress: true, subject: true,
  bodyText: true, receivedAt: true, kind: true, isHuman: true, isSecurityCode: true,
  attentionTrackedAt: true, readAt: true, handledAt: true, remindAt: true,
  application: {
    select: { userId: true, userStatus: true, job: { select: { company: true, title: true, location: true, remote: true, salaryMin: true, salaryMax: true } } },
  },
} as const;

export async function getInboxMessages(userId: string, savedReplyParents: string[] = []): Promise<InboxMessage[]> {
  if (!userId) throw new Error("Inbox owner is required");
  const [recentReplies, gmailMessages] = await Promise.all([
    prisma.applicationReply.findMany({
      where: { application: { userId }, isSecurityCode: false },
      orderBy: { receivedAt: "desc" },
      take: 200,
      select: inboundSelect,
    }),
    prisma.gmailMessage.findMany({
      where: { userId, archived: false },
      orderBy: { date: "desc" },
      take: 200,
      select: {
        id: true, fromAddress: true, subject: true, snippet: true, bodyText: true, threadId: true, gmailMessageId: true,
        date: true, kind: true, isHuman: true, read: true, handledAt: true, remindAt: true, applicationId: true,
        application: {
          select: { userId: true, userStatus: true, job: { select: { company: true, title: true, location: true, remote: true, salaryMin: true, salaryMax: true } } },
        },
      },
    }),
  ]);

  // Keep saved drafts/replies usable even after their original leaves the recent window.
  const missingIds = [...new Set(savedReplyParents)].slice(0, 200).filter(id => !recentReplies.some(row => row.id === id));
  const olderParents = missingIds.length ? await prisma.applicationReply.findMany({
    where: { id: { in: missingIds }, application: { userId }, isSecurityCode: false }, select: inboundSelect,
  }) : [];
  const replies = [...recentReplies, ...olderParents];

  const inbound: InboxMessage[] = replies
    // Legacy security emails predate the explicit flag. Never display their code.
    .filter((reply) => reply.application.userId === userId && !reply.isSecurityCode && !isSecurityMessage(reply))
    .map((reply) => {
      const bodyText = formatInboxEmailText(reply.bodyText ?? "");
      return {
        id: `application_reply:${reply.id}`,
        source: "application_reply",
        from: reply.fromAddress,
        subject: reply.subject,
        snippet: bodyText.slice(0, 200),
        bodyText,
        date: reply.receivedAt.toISOString(),
        kind: reply.kind,
        label: reply.applicationId === RELEASE_CANARY.applicationId ? "Test diagnostico" : inboxKindLabel(reply.kind),
        read: reply.readAt ? true : reply.attentionTrackedAt ? false : null,
        isHuman: reply.isHuman, handledAt: reply.handledAt?.toISOString() ?? null, remindAt: reply.remindAt?.toISOString() ?? null,
        applicationId: reply.applicationId,
        applicationStatus: reply.application.userStatus,
        company: reply.application.job.company,
        jobTitle: reply.application.job.title,
        location: reply.application.job.location, remote: reply.application.job.remote, salaryMin: reply.application.job.salaryMin, salaryMax: reply.application.job.salaryMax,
        jobRelated: true,
      };
    });

  const gmail: InboxMessage[] = gmailMessages
    .filter((message) => !isSecurityMessage(message))
    .map((message) => {
      // A malformed/historical cross-user link must never expose the other
      // owner's company, job, application ID, or status in this user's inbox.
      const application = message.application?.userId === userId ? message.application : null;
      const jobRelated = Boolean(application) || isLikelyJobMail(message.fromAddress, message.subject ?? "", message.bodyText ?? "");
      const kind = jobRelated ? message.kind : "auto";
      return {
        id: `gmail:${message.id}`,
        source: "gmail",
        threadId: message.threadId, gmailMessageId: message.gmailMessageId,
        from: message.fromAddress,
        subject: message.subject,
        snippet: formatInboxEmailText(message.snippet ?? ""),
        bodyText: formatInboxEmailText(message.bodyText ?? ""),
        date: message.date.toISOString(),
        kind,
        label: jobRelated ? inboxKindLabel(kind) : "Other mail",
        read: message.read,
        isHuman: message.isHuman, handledAt: message.handledAt?.toISOString() ?? null, remindAt: message.remindAt?.toISOString() ?? null,
        applicationId: application ? message.applicationId : null,
        applicationStatus: application?.userStatus ?? null,
        company: application?.job.company ?? null,
        jobTitle: application?.job.title ?? null,
        location: application?.job.location, remote: application?.job.remote, salaryMin: application?.job.salaryMin, salaryMax: application?.job.salaryMax,
        jobRelated,
      };
    });

  return [...inbound, ...gmail].sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
}
