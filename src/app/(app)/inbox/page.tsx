import { prisma } from "@/lib/db";
import { publicReply } from "@/lib/inbox-replies";
import type { Metadata } from "next";
import { getLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { GmailInboxView } from "@/components/gmail-inbox-view";
import { hasGmailConnected } from "@/lib/gmail-client";
import { getInboxMessages } from "@/lib/inbox-repository";

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
  const [outgoing, gmailConnected, messages, locale] = await Promise.all([
    outgoingPromise,
    hasGmailConnected(user.id),
    getInboxMessages(user.id, parents),
    getLocale(),
  ]);
  return (
    <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
      <GmailInboxView
        locale={locale}
        ownerId={user.id}
        outgoing={outgoing.map(publicReply)}
        messages={messages}
        gmailConnected={gmailConnected}
        userEmail={user.email ?? null}
      />
    </div>
  );
}
