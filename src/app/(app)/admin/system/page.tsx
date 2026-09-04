import type { Metadata } from "next";
import { AdminAiHealth } from "@/components/admin-ai-health";
import { PageTitle } from "../_ui";

export const metadata: Metadata = { title: "Admin · Salute AI", robots: { index: false } };
export const dynamic = "force-dynamic";

export default function AdminSystemPage() {
  return (
    <div className="adm-page" style={{ gridTemplateRows: "auto minmax(0,1fr)" }}>
      <PageTitle title="Salute AI" sub="Verifica chiave Anthropic e che Chromium si avvii in produzione." />
      <div className="adm-card-body scroll" style={{ paddingRight: 4 }}>
        <AdminAiHealth />
      </div>
    </div>
  );
}
