import { parseRange } from "@/components/admin-range";
import type { Metadata } from "next";
import { AdminTraffic } from "@/components/admin-traffic";
import { requireAdminPage } from "@/lib/admin-page";

export const metadata: Metadata = { title: "Admin · Traffico", robots: { index: false } };
export const dynamic = "force-dynamic";


export default async function AdminTrafficPage({ searchParams }: { searchParams?: Promise<{ range?: string }> }) {
  await requireAdminPage();
  const sp = (await searchParams) ?? {};
  const range = parseRange(sp.range, 7);
  return <AdminTraffic days={range} />;
}
