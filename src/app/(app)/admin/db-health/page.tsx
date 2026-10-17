import type { Metadata } from "next";
import { getDbDiagnostics } from "@/lib/db-diagnostics";
import { requireAdminPage } from "@/lib/admin-page";

export const metadata: Metadata = { title: "Admin · Database health", robots: { index: false } };
export const dynamic = "force-dynamic";

/** Internal admin-only read-only view. The parent /admin layout enforces admin access. */
export default async function DbHealthPage() {
  await requireAdminPage();
  const report = await getDbDiagnostics();
  return (
    <section className="adm-page" style={{ maxWidth: 1100 }}>
      <div className="adm-card">
        <div className="adm-card-head"><div><div className="adm-card-title">Database diagnostic</div><div className="adm-card-sub">Read-only comparison. Connection strings and credentials are never rendered.</div></div></div>
        <pre style={{ margin: 0, overflow: "auto", padding: 14, borderRadius: 10, background: "var(--bg-sunken)", color: "var(--fg)", fontSize: 12, lineHeight: 1.55 }}>{JSON.stringify(report, null, 2)}</pre>
      </div>
    </section>
  );
}
