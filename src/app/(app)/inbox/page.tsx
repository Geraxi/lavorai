import { prisma } from "@/lib/db";
import { publicReply } from "@/lib/inbox-replies";
import type { Metadata } from "next";
import { getLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { GmailInboxView } from "@/components/gmail-inbox-view";
import { hasGmailConnected } from "@/lib/gmail-client";
import { getInboxMessages } from "@/lib/inbox-repository";
import { AppTopbar } from "@/components/design/topbar";
import { countUnreadJobMessages, getDraftReplies, getRecruiterReplies } from "@/lib/dashboard-metrics-shared";
import { FilePenLine, Mail, MessageSquare } from "lucide-react";
import "./inbox.css";

export const metadata: Metadata = { title: "Inbox" };
export const dynamic = "force-dynamic";

/** Recruiter messages received by LavorAI, plus optionally synced Gmail. */
export default async function InboxPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/inbox");

  // Un solo giro: risposte inviate, inbox e stato Gmail partono insieme.
  const outgoingPromise = prisma.inboxReply.findMany({ where: { application: { userId: user.id } }, orderBy: { createdAt: "desc" }, take: 200 });
  const parents = outgoingPromise.then((rows) => rows.map(row => row.parentReplyId));
  parents.catch(() => undefined); // l'errore emerge già da outgoingPromise
  const [outgoing, gmailConnected, messages, locale, replies, drafts] = await Promise.all([
    outgoingPromise,
    hasGmailConnected(user.id),
    getInboxMessages(user.id, parents),
    getLocale(),
    getRecruiterReplies(user.id),
    getDraftReplies(user.id),
  ]);
  const en = locale === "en";
  const tr = (it: string, english: string) => (en ? english : it);
  // Same predicate as the dashboard metrics and the attention queue.
  const unread = countUnreadJobMessages(messages);
  const stats = [
    { key: "replies", icon: MessageSquare, value: replies, label: tr("Risposte recruiter", "Recruiter replies"), hint: tr("candidature con almeno una risposta", "applications with at least one reply") },
    { key: "unread", icon: Mail, value: unread, label: tr("Da leggere", "Unread"), hint: tr("messaggi di lavoro non ancora aperti", "job messages not opened yet") },
    { key: "drafts", icon: FilePenLine, value: drafts, label: tr("Bozze", "Drafts"), hint: tr("risposte salvate, non inviate", "saved replies, not sent") },
  ];
  return (
    <>
      <AppTopbar title="Inbox" breadcrumb={tr("Lavoro", "Work")} />
      <div className="inbox-page">
      <section className="inbox-stats" aria-label={tr("Riepilogo inbox", "Inbox summary")}>
        {stats.map(({ key, icon: StatIcon, value, label, hint }) => (
          <div key={key} className="inbox-stat" data-stat={key}>
            <span className="pm-chip-icon"><StatIcon size={14} strokeWidth={1.75} aria-hidden /></span>
            <span className="inbox-stat-text">
              <span className="inbox-stat-top"><b>{value}</b>{label}</span>
              <small>{hint}</small>
            </span>
          </div>
        ))}
      </section>
      <GmailInboxView
        locale={locale}
        ownerId={user.id}
        outgoing={outgoing.map(publicReply)}
        messages={messages}
        gmailConnected={gmailConnected}
        userEmail={user.email ?? null}
      />
      </div>
    </>
  );
}
