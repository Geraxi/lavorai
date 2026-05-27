import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { isAdmin } from "@/lib/admin";
import { AdminSidebar } from "@/components/admin-sidebar";

/**
 * Layout admin: auth gate centralizzato + sidebar dedicata.
 * Tutte le sub-route sotto /admin/* sono protette qui — niente più check
 * duplicati nelle page.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!isAdmin(user?.email)) notFound();

  return (
    <div
      className="admin-grid"
      style={{
        padding: "28px 24px",
        maxWidth: 1280,
        margin: "0 auto",
        display: "grid",
        gridTemplateColumns: "200px 1fr",
        gap: 24,
      }}
    >
      <AdminSidebar />
      <div style={{ minWidth: 0 }}>{children}</div>
      <style>{`@media (max-width:900px){.admin-grid{grid-template-columns:1fr !important}.admin-grid > nav{position:relative !important;top:0 !important;}}`}</style>
    </div>
  );
}
