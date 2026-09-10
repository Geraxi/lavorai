import type { Metadata } from "next";
import { AdminTraffic } from "@/components/admin-traffic";

export const metadata: Metadata = { title: "Admin · Traffico", robots: { index: false } };
export const dynamic = "force-dynamic";

const RANGES = [1, 7, 14, 30, 90];

export default async function AdminTrafficPage({ searchParams }: { searchParams?: Promise<{ range?: string }> }) {
  const sp = (await searchParams) ?? {};
  const range = RANGES.includes(Number(sp.range)) ? Number(sp.range) : 7;
  return <AdminTraffic days={range} />;
}
