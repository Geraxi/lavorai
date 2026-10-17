import { prisma } from "@/lib/db";
import { getInboxMessages } from "@/lib/inbox-repository";
import { attentionStatuses, blockedAction, messageNeedsAttention, type AttentionItem } from "@/lib/attention";
export async function getAttentionQueue(userId: string, locale: string) {
  if (!userId) throw new Error("Owner required");
  const en = locale === "en";
  // Inbox letta in parallelo: le bozze salvate le passano come promise.
  const repliesPromise = prisma.inboxReply.findMany({ where: { application: { userId } }, orderBy: { createdAt: "desc" }, take: 200,
    select: { applicationId: true, parentReplyId: true, status: true, acceptedAt: true, createdAt: true } });
  const draftParents = repliesPromise.then((rows) => rows.filter(r => r.status === "draft").map(r => r.parentReplyId));
  draftParents.catch(() => undefined); // l'errore emerge già da repliesPromise
  const [applications, replies, messages] = await Promise.all([
    prisma.application.findMany({ where: { userId, OR: [{ status: { in: attentionStatuses } }, { submitConfirmation: { in: ["UNCONFIRMED", "SUBMISSION_STARTED"] } }] },
      orderBy: { createdAt: "asc" }, take: 51, select: { id: true, userId: true, status: true, createdAt: true, job: { select: { title: true, company: true } } } }),
    repliesPromise,
    getInboxMessages(userId, draftParents),
  ]);
  const items: AttentionItem[] = messages.filter(m => messageNeedsAttention(m, replies)).map(m => ({
    id: m.id, href: `/inbox?message=${encodeURIComponent(m.id)}`, title: m.company || (en ? "Recruiter message" : "Messaggio recruiter"),
    detail: replies.some(r => `application_reply:${r.parentReplyId}` === m.id && r.status === "draft") ? (en ? "Saved draft to finish" : "Bozza salvata da completare") : m.source === "gmail" ? (en ? "Review in Gmail · external replies are not tracked" : "Controlla in Gmail · risposte esterne non rilevate") : (en ? "No reply found in the recent selection · review the message" : "Nessuna tua risposta nella selezione recente · controlla il messaggio"),
    date: m.date, kind: "message", unread: m.read === null ? null : !m.read,
  }));
  items.push(...applications.slice(0, 50).filter(a => a.userId === userId && a.status !== "diagnostic").map(a => ({ id: a.id, href: a.status === "needs_answers" ? "/questions" : `/applications?id=${encodeURIComponent(a.id)}&includeAll=1`, title: `${a.job.title} · ${a.job.company ?? ""}`, detail: blockedAction(a.status, en), date: null, kind: "application" as const })));
  return { items, limited: applications.length > 50 || messages.length >= 200 || replies.length >= 200,
    unread: messages.filter(m => m.jobRelated && m.read === false).length,
    unknownRead: messages.filter(m => m.jobRelated && m.read === null).length,
    drafts: replies.filter(r => r.status === "draft").length };
}
