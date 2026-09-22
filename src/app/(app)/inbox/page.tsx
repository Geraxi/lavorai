import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { GmailInboxView, type GmailInboxMessage } from "@/components/gmail-inbox-view";
import { hasGmailConnected } from "@/lib/gmail-client";
import { formatInboxEmailText } from "@/lib/inbox-email-text";
import { isLikelyJobMail } from "@/lib/gmail-match";

export const metadata: Metadata = { title: "Inbox" };
export const dynamic = "force-dynamic";

/**
 * Inbox Gmail: risposte recruiter dal Gmail dell'utente, classificate
 * e collegate alle candidature quando possibile.
 */
export default async function InboxPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/inbox");

  const gmailConnected = await hasGmailConnected(user.id);

  if (!gmailConnected) {
    return (
      <div style={{ height: "100%", overflow: "hidden" }}>
        <GmailInboxView
          messages={[]}
          gmailConnected={false}
          userEmail={user.email ?? null}
          interviewCount={0}
        />
      </div>
    );
  }

  // Fetch Gmail messages
  const gmailMessages = await prisma.gmailMessage.findMany({
    where: { userId: user.id, archived: false },
    orderBy: { date: "desc" },
    take: 200,
    select: {
      id: true,
      fromAddress: true,
      subject: true,
      snippet: true,
      bodyText: true,
      date: true,
      kind: true,
      label: true,
      read: true,
      applicationId: true,
      application: {
        select: {
          job: {
            select: { company: true, title: true },
          },
        },
      },
    },
  });

  const messages: GmailInboxMessage[] = gmailMessages.map((m) => {
    const jobRelated = isLikelyJobMail(m.fromAddress, m.subject ?? "", m.bodyText ?? "");
    return {
    id: m.id,
    from: m.fromAddress,
    subject: m.subject,
    snippet: formatInboxEmailText(m.snippet ?? ""),
    bodyText: formatInboxEmailText(m.bodyText ?? ""),
    date: m.date.toISOString(),
    kind: jobRelated ? m.kind : "auto",
    label: jobRelated ? m.label : "Other",
    read: m.read,
    applicationId: jobRelated ? m.applicationId : null,
    company: jobRelated ? m.application?.job.company ?? null : null,
    jobTitle: jobRelated ? m.application?.job.title ?? null : null,
    jobRelated,
    };
  });

  const interviewCount = messages.filter((m) => m.jobRelated && m.kind === "colloquio").length;

  return (
    <div style={{ height: "100%", overflow: "hidden" }}>
      <GmailInboxView
        messages={messages}
        gmailConnected={true}
        userEmail={user.email ?? null}
        interviewCount={interviewCount}
      />
    </div>
  );
}
