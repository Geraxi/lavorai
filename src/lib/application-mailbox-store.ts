import { prisma } from "@/lib/db";
import {
  mailboxKindLabel,
  redactMailboxBody,
  type MailboxKind,
} from "@/lib/application-mailbox";

export type MailboxThreadMessage = {
  id: string;
  source: "reply" | "inbound";
  kind: string;
  label: string;
  fromAddress: string;
  subject: string | null;
  bodyText: string | null;
  receivedAt: string;
};

export type MailboxThread = {
  applicationId: string;
  jobTitle: string;
  company: string | null;
  jobUrl: string;
  confirmedAt: string | null;
  confirmedFrom: string | null;
  confirmedSubject: string | null;
  messages: MailboxThreadMessage[];
};

export async function listMailboxThreads(userId: string, locale = "it"): Promise<MailboxThread[]> {
  const apps = await prisma.application.findMany({
    where: { userId, status: { not: "diagnostic" } },
    orderBy: { createdAt: "desc" },
    take: 80,
    select: {
      id: true, confirmedAt: true,
      job: { select: { title: true, company: true, url: true } },
      replies: {
        where: { isSecurityCode: false },
        orderBy: { receivedAt: "asc" },
        take: 40,
        select: { id: true, kind: true, fromAddress: true, subject: true, bodyText: true, receivedAt: true },
      },
      inboundEmails: {
        orderBy: { receivedAt: "asc" },
        take: 40,
        select: { id: true, mailboxKind: true, category: true, fromAddress: true, subject: true, bodyText: true, receivedAt: true },
      },
    },
  });
  return apps.map((app) => {
    const replies: MailboxThreadMessage[] = app.replies.map((row) => ({
      id: `reply:${row.id}`,
      source: "reply",
      kind: row.kind,
      label: mailboxKindLabel(row.kind === "ricevuta" ? "confirmation" : row.kind === "colloquio" ? "interview" : row.kind === "rifiutata" ? "rejection" : row.kind === "risposta" ? "recruiter_question" : row.kind, locale),
      fromAddress: row.fromAddress,
      subject: row.subject,
      bodyText: redactMailboxBody(row.kind, row.bodyText),
      receivedAt: row.receivedAt.toISOString(),
    }));
    const inbound: MailboxThreadMessage[] = app.inboundEmails.map((row) => {
      const kind = row.mailboxKind ?? row.category;
      return {
        id: `inbound:${row.id}`,
        source: "inbound",
        kind,
        label: mailboxKindLabel(kind, locale),
        fromAddress: row.fromAddress,
        subject: row.subject,
        bodyText: redactMailboxBody(kind, row.bodyText),
        receivedAt: row.receivedAt.toISOString(),
      };
    });
    const messages = [...replies, ...inbound].sort((a, b) => a.receivedAt.localeCompare(b.receivedAt) || a.id.localeCompare(b.id));
    const receipt = messages.find((m) => m.kind === "confirmation" || m.kind === "ricevuta") ?? null;
    return {
      applicationId: app.id,
      jobTitle: app.job.title,
      company: app.job.company,
      jobUrl: app.job.url,
      confirmedAt: app.confirmedAt?.toISOString() ?? null,
      confirmedFrom: receipt?.fromAddress ?? null,
      confirmedSubject: receipt?.subject ?? null,
      messages,
    };
  }).filter((thread) => thread.messages.length > 0 || thread.confirmedAt);
}

export async function purgeExpiredMailbox(now = new Date(), days = 180): Promise<{ replies: number; inbound: number }> {
  const cutoff = new Date(now.getTime() - days * 86_400_000);
  const [replies, inbound] = await Promise.all([
    prisma.applicationReply.deleteMany({
      where: { receivedAt: { lt: cutoff } },
    }),
    prisma.inboundEmail.deleteMany({
      where: { receivedAt: { lt: cutoff } },
    }),
  ]);
  return { replies: replies.count, inbound: inbound.count };
}
