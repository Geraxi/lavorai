import type { Metadata } from "next";
import { AdminTraffic } from "@/components/admin-traffic";
import { PageTitle } from "../_ui";

export const metadata: Metadata = { title: "Admin · Traffico", robots: { index: false } };
export const dynamic = "force-dynamic";

export default function AdminTrafficPage() {
  return (
    <>
      <PageTitle title="Traffico sito" sub="Page views, visitatori unici, top pagine e referrer" />
      <AdminTraffic />
    </>
  );
}
