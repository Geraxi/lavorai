import type { Metadata } from "next";
import { AdminTraffic } from "@/components/admin-traffic";

export const metadata: Metadata = { title: "Admin · Traffico", robots: { index: false } };
export const dynamic = "force-dynamic";

export default function AdminTrafficPage() {
  return <AdminTraffic />;
}
