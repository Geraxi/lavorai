import type { Metadata } from "next";
import { AdminAssistant } from "@/components/admin-assistant";
import { PageTitle } from "../_ui";

export const metadata: Metadata = { title: "Admin · Assistant", robots: { index: false } };
export const dynamic = "force-dynamic";

export default function AdminAssistantPage() {
  return (
    <>
      <PageTitle title="Assistant" sub="Chat operativa per analisi e azioni admin" />
      <AdminAssistant />
    </>
  );
}
