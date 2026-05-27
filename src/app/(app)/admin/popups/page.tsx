import type { Metadata } from "next";
import { AdminPopups } from "@/components/admin-popups";
import { PageTitle } from "../_ui";

export const metadata: Metadata = { title: "Admin · Popup", robots: { index: false } };
export const dynamic = "force-dynamic";

export default function AdminPopupsPage() {
  return (
    <>
      <PageTitle title="Popup utenti" sub="Crea e gestisci popup in-app per raccogliere feedback" />
      <AdminPopups />
    </>
  );
}
