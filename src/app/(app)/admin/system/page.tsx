import type { Metadata } from "next";
import { AdminAiHealth } from "@/components/admin-ai-health";
import { PageTitle } from "../_ui";

export const metadata: Metadata = { title: "Admin · Salute AI", robots: { index: false } };
export const dynamic = "force-dynamic";

export default function AdminSystemPage() {
  return (
    <>
      <PageTitle title="Salute AI" sub="Verifica chiave Anthropic e che Chromium si avvii in produzione" />
      <AdminAiHealth />
    </>
  );
}
