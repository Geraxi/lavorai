import type { Metadata } from "next";
import { AdminTestApply } from "@/components/admin-test-apply";
import { PageTitle } from "../_ui";

export const metadata: Metadata = { title: "Admin · Test invio", robots: { index: false } };
export const dynamic = "force-dynamic";

export default function AdminTestPage() {
  return (
    <>
      <PageTitle title="Test invio candidatura" sub="Esegui un'apply end-to-end (dry-run o reale) su Vercel" />
      <AdminTestApply />
    </>
  );
}
