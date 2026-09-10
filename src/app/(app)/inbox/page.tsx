import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { AppTopbar } from "@/components/design/topbar";
import { InboxView, type InboxAnswer, type InboxReply, type InboxSent } from "@/components/inbox-view";

export const metadata: Metadata = { title: "Inbox" };
export const dynamic = "force-dynamic";

/**
 * Inbox utente: cosa è stato inviato a suo nome (candidature con prova di
 * consegna e risposte usate nei form), le risposte riutilizzabili (sue e
 * dell'AI, modificabili) e i messaggi reali dei recruiter.
 */
export default async function InboxPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/inbox");

  const [sentRows, waiting, answerRows, replyRows] = await Promise.all([
    prisma.application.findMany({
      where: { userId: user.id, status: { in: ["success", "needs_answers", "ready_to_apply"] } },
      orderBy: [{ completedAt: "desc" }, { createdAt: "desc" }],
      take: 200,
      select: {
        id: true, status: true, portal: true, submittedVia: true, submitConfirmation: true, answersUsedJson: true, coverLetterText: true, cvPdfPath: true, cvDocxPath: true,
        pendingQuestionsJson: true, createdAt: true, completedAt: true, lastReplyAt: true, lastReplyKind: true, replyCount: true, userStatus: true, viewedAt: true,
        job: { select: { title: true, company: true, url: true, location: true } },
      },
    }),
    prisma.application.count({ where: { userId: user.id, status: "needs_answers" } }),
    prisma.userAnswer.findMany({
      where: { userId: user.id },
      orderBy: [{ answeredAt: "desc" }, { createdAt: "desc" }],
      select: { id: true, labelKey: true, label: true, kind: true, optionsJson: true, answer: true, source: true, answeredAt: true },
    }),
    prisma.applicationReply.findMany({
      where: { application: { userId: user.id }, OR: [{ isHuman: true }, { kind: "ricevuta" }] },
      orderBy: { receivedAt: "desc" },
      take: 50,
      select: { id: true, fromAddress: true, subject: true, bodyText: true, kind: true, receivedAt: true, application: { select: { id: true, job: { select: { title: true, company: true } } } } },
    }),
  ]);

  const parse = <T,>(s: string | null): T[] => {
    if (!s) return [];
    try { const v = JSON.parse(s); return Array.isArray(v) ? (v as T[]) : []; } catch { return []; }
  };

  const sent: InboxSent[] = sentRows.map((a) => ({
    id: a.id,
    status: a.status,
    company: a.job.company ?? "Azienda",
    title: a.job.title,
    location: a.job.location ?? null,
    url: a.job.url,
    portal: a.portal,
    via: a.submittedVia,
    confirmation: a.submitConfirmation,
    date: (a.completedAt ?? a.createdAt).toISOString(),
    createdAt: a.createdAt.toISOString(),
    lastReplyAt: a.lastReplyAt?.toISOString() ?? null,
    viewedAt: a.viewedAt?.toISOString() ?? null,
    coverLetter: a.coverLetterText ?? null,
    hasCv: !!(a.cvPdfPath || a.cvDocxPath),
    answers: parse<{ label: string; answer: string; source: string }>(a.answersUsedJson),
    pending: parse<{ label: string; kind?: string; options?: string[] }>(a.pendingQuestionsJson),
    replyKind: a.lastReplyKind,
    replyCount: a.replyCount,
    userStatus: a.userStatus,
  }));
  const answers: InboxAnswer[] = answerRows.map((r) => ({
    id: r.id, labelKey: r.labelKey, label: r.label, kind: r.kind, options: parse<string>(r.optionsJson), answer: r.answer ?? "", source: r.source, answeredAt: r.answeredAt?.toISOString() ?? null,
  }));
  const replies: InboxReply[] = replyRows.map((r) => ({
    id: r.id, from: r.fromAddress, subject: r.subject, body: (r.bodyText ?? "").slice(0, 600), kind: r.kind, date: r.receivedAt.toISOString(), applicationId: r.application.id, company: r.application.job.company ?? "Azienda", title: r.application.job.title,
  }));

  return (
    <>
      <AppTopbar title="Inbox" breadcrumb="Lavoro" />
      <InboxView sent={sent} answers={answers} replies={replies} waiting={waiting} forwardAddress={process.env.INBOUND_EMAIL_DOMAIN ? `inbox@${process.env.INBOUND_EMAIL_DOMAIN}` : null} />
    </>
  );
}
