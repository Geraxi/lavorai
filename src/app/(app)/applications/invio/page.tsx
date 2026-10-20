import type { Metadata } from "next";
import { AppTopbar } from "@/components/design/topbar";
import { MailboxApproval } from "@/components/mailbox-approval";

export const metadata: Metadata = { title: "Approva invii" };
export const dynamic = "force-dynamic";

export default function MailboxApprovalPage() {
  return (
    <>
      <AppTopbar title="Approva invii" breadcrumb="Candidature" />
      <div className="pm-page">
        <header className="pm-page-head">
          <div>
            <h1>Approva invii</h1>
            <p className="pm-muted">Le email partono dalla tua casella solo dopo che hai controllato destinatario e allegati.</p>
          </div>
        </header>
        <MailboxApproval />
      </div>
    </>
  );
}
