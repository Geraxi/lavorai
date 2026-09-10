import { parseRange } from "@/components/admin-range-select";
import type { Metadata } from "next";
import { AdminTraffic } from "@/components/admin-traffic";

export const metadata: Metadata = { title: "Admin · Traffico", robots: { index: false } };
export const dynamic = "force-dynamic";


export default async function AdminTrafficPage({ searchParams }: { searchParams?: Promise<{ range?: string }> }) {
  const sp = (await searchParams) ?? {};
  const range = parseRange(sp.range, 7);
  return <AdminTraffic days={range} />;
}
