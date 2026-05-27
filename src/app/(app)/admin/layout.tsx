import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { isAdmin } from "@/lib/admin";
import { AdminSidebar } from "@/components/admin-sidebar";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!isAdmin(user?.email)) notFound();

  return (
    <div
      className="admin-grid"
      style={{
        padding: "24px 28px",
        display: "grid",
        gridTemplateColumns: "180px minmax(0, 1fr)",
        gap: 28,
        alignItems: "start",
      }}
    >
      <AdminSidebar />
      <div style={{ minWidth: 0, maxWidth: 1100 }}>{children}</div>
      <style>{`@media (max-width:900px){.admin-grid{grid-template-columns:1fr !important;padding:16px !important}.admin-grid > nav{position:relative !important;top:0 !important;border-right:0 !important;padding-right:0 !important;border-bottom:1px solid var(--border-ds);padding-bottom:8px}}`}</style>
    </div>
  );
}
