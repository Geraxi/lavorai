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
        gridTemplateColumns: "200px minmax(0, 1fr)",
        gap: 32,
        alignItems: "start",
        maxWidth: 1440,
        margin: "0 auto",
      }}
    >
      <AdminSidebar />
      <div style={{ minWidth: 0, maxWidth: 1180 }}>{children}</div>
      <style>{`
        .admin-section-card:hover > div {
          transform: translateY(-2px);
          border-color: color-mix(in srgb, hsl(var(--primary)) 40%, var(--border-ds));
          background: color-mix(in srgb, var(--bg-elev) 92%, hsl(var(--primary)) 8%);
        }
        .admin-section-card:hover .admin-arrow {
          transform: translateX(3px);
          color: hsl(var(--primary));
        }
        @media (max-width: 900px) {
          .admin-grid {
            grid-template-columns: 1fr !important;
            padding: 16px !important;
            gap: 16px !important;
          }
          .admin-grid > nav {
            position: relative !important;
            top: 0 !important;
            border-right: 0 !important;
            padding-right: 0 !important;
            border-bottom: 1px solid var(--border-ds);
            padding-bottom: 12px;
          }
        }
      `}</style>
    </div>
  );
}
