import type { Metadata } from "next";
import { AdminNudges } from "@/components/admin-nudges";
import { PageTitle } from "../_ui";

export const metadata: Metadata = { title: "Admin · Nudge", robots: { index: false } };
export const dynamic = "force-dynamic";

export default function AdminNudgesPage() {
  return (
    <>
      <PageTitle title="Nudge onboarding" sub="Email a utenti bloccati per completare lo step mancante" />
      <AdminNudges />
    </>
  );
}
