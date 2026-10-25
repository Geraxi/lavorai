import type { Metadata } from "next";
import { RELEASE_CANARY } from "@/lib/release-email-canary";
import { PageTitle } from "../_ui";
import { EmailTestAdminPanel } from "./_panel";

export const metadata: Metadata = { title: "Admin · Email test", robots: { index: false } };
export const dynamic = "force-dynamic";

const DESTINATION = RELEASE_CANARY.replyTo;
const DEFAULT_RUN_KEY = "20261025-owned-inbound-1";

export default function AdminEmailTestPage() {
  return (
    <div className="adm-page">
      <PageTitle
        crumb="Email test"
        title="Email test"
        sub="One owned-destination diagnostic. Pause stays on. No retry. Visible only to admins."
      />
      <section className="adm-card">
        <div className="adm-card-head">
          <div>
            <div className="adm-card-title">Send one test email</div>
            <div className="adm-card-sub">Allowlisted destination only. Duplicate runKey is refused.</div>
          </div>
        </div>
        <EmailTestAdminPanel destination={DESTINATION} defaultRunKey={DEFAULT_RUN_KEY} />
      </section>
    </div>
  );
}
