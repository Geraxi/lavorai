import type { Metadata } from "next";
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

  const [gmailConnected, messages] = await Promise.all([
    hasGmailConnected(user.id),
    getInboxMessages(user.id),
  ]);

  return (
    <div style={{ height: "100%", overflow: "hidden" }}>
      <GmailInboxView
        messages={messages}
        gmailConnected={gmailConnected}
        userEmail={user.email ?? null}
      />
    </div>
  );
}
