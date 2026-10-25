import type { Metadata } from "next";
import { atsTestRealSubmitEnabled, parseAtsTestDestinations } from "@/lib/ats-test-capability";
import { PageTitle } from "../_ui";
import { AtsTestAdminPanel } from "./_panel";

export const metadata: Metadata = { title: "Admin · ATS test", robots: { index: false } };
export const dynamic = "force-dynamic";

export default function AdminAtsTestPage() {
  const destinations = parseAtsTestDestinations();
  return (
    <div className="adm-page">
      <PageTitle
        crumb="ATS test"
        title="ATS test"
        sub="Restricted Recruitee diagnostic. Pause stays on. One row per destination. Visible only to admins."
      />
      <section className="adm-card">
        <div className="adm-card-head">
          <div>
            <div className="adm-card-title">Restricted ATS apply</div>
            <div className="adm-card-sub">
              Dedicated test user only. Dry run never POSTs. Real submit is one-time and needs ATS_TEST_REAL_SUBMIT=true.
            </div>
          </div>
        </div>
        <AtsTestAdminPanel
          destinations={destinations}
          realSubmitEnabled={atsTestRealSubmitEnabled()}
        />
      </section>
    </div>
  );
}
