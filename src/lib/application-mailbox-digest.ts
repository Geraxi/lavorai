import { prisma } from "@/lib/db";
import { mailboxNotifyMode } from "@/lib/application-mailbox";
import {
  sendMailboxDigest,
  type MailboxMailer,
  type MailboxNotifyMessage,
} from "@/lib/application-mailbox-notify";
import { isTestAccount } from "@/lib/admin";

export async function runMailboxDigest(opts: {
  send: MailboxMailer;
  now?: Date;
}): Promise<{ sent: number; skipped: number; errors: number }> {
  const now = opts.now ?? new Date();
  const since = new Date(now.getTime() - 26 * 60 * 60 * 1000);
  const replies = await prisma.applicationReply.findMany({
    where: { notifyStatus: "digest_queued", receivedAt: { gte: since }, isSecurityCode: false },
    take: 200,
    select: {
      id: true, kind: true, fromAddress: true, subject: true, receivedAt: true,
      application: { select: { userId: true, job: { select: { title: true, company: true } } } },
    },
  });
  const inbound = await prisma.inboundEmail.findMany({
    where: { notifyStatus: "digest_queued", receivedAt: { gte: since } },
    take: 200,
    select: {
      id: true, mailboxKind: true, category: true, fromAddress: true, subject: true, receivedAt: true,
      userId: true,
      application: { select: { job: { select: { title: true, company: true } } } },
    },
  });
  const byUser = new Map<string, { replyIds: string[]; inboundIds: string[]; messages: MailboxNotifyMessage[] }>();
  for (const row of replies) {
    const bucket = byUser.get(row.application.userId) ?? { replyIds: [], inboundIds: [], messages: [] };
    bucket.replyIds.push(row.id);
    bucket.messages.push({
      id: `reply:${row.id}`, kind: row.kind, fromAddress: row.fromAddress, subject: row.subject,
      receivedAt: row.receivedAt, jobTitle: row.application.job.title, company: row.application.job.company,
    });
    byUser.set(row.application.userId, bucket);
  }
  for (const row of inbound) {
    const bucket = byUser.get(row.userId) ?? { replyIds: [], inboundIds: [], messages: [] };
    bucket.inboundIds.push(row.id);
    bucket.messages.push({
      id: `inbound:${row.id}`, kind: row.mailboxKind ?? row.category, fromAddress: row.fromAddress, subject: row.subject,
      receivedAt: row.receivedAt, jobTitle: row.application?.job.title ?? "Candidatura", company: row.application?.job.company ?? null,
    });
    byUser.set(row.userId, bucket);
  }
  let sent = 0; let skipped = 0; let errors = 0;
  for (const [userId, bucket] of byUser) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, name: true, locale: true, preferences: { select: { mailboxNotifyMode: true } } },
    });
    if (!user || isTestAccount(user.email) || mailboxNotifyMode(user.preferences?.mailboxNotifyMode) === "off") {
      skipped++; continue;
    }
    try {
      const ok = await sendMailboxDigest({
        userEmail: user.email, user, messages: bucket.messages, send: opts.send,
      });
      if (!ok) { skipped++; continue; }
      if (bucket.replyIds.length) {
        await prisma.applicationReply.updateMany({ where: { id: { in: bucket.replyIds } }, data: { notifyStatus: "digest_sent" } });
      }
      if (bucket.inboundIds.length) {
        await prisma.inboundEmail.updateMany({ where: { id: { in: bucket.inboundIds } }, data: { notifyStatus: "digest_sent" } });
      }
      sent++;
    } catch {
      errors++;
    }
  }
  return { sent, skipped, errors };
}
