import { getLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { isAdmin } from "@/lib/admin";
import { AdminReportsView } from "@/components/admin-reports-view";
export const dynamic = "force-dynamic";
export default async function AdminReportsPage() {
  const user = await getCurrentUser();
  if (!isAdmin(user?.email)) notFound();
  return <AdminReportsView locale={await getLocale()} />;
}
