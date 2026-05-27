import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { Kpi, Panel, PageTitle } from "../_ui";

export const metadata: Metadata = { title: "Admin · Consegna", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function AdminDeliveryPage() {
  const [appsByStatus, appsByConfirmation, appsBySubmittedVia, totalApps] = await Promise.all([
    prisma.application.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.application.groupBy({ by: ["submitConfirmation"], _count: { _all: true } }),
    prisma.application.groupBy({ by: ["submittedVia"], _count: { _all: true } }),
    prisma.application.count(),
  ]);

  const confMap = Object.fromEntries(appsByConfirmation.map((r) => [r.submitConfirmation ?? "null", r._count._all]));
  const confirmedDelivered = Object.entries(confMap).filter(([k]) => k.startsWith("DETECTED")).reduce((s, [, v]) => s + v, 0);
  const unconfirmed = (confMap["UNCONFIRMED"] ?? 0) + (confMap["null"] ?? 0);

  return (
    <>
      <PageTitle title="Verità sulla consegna" sub="Solo DETECTED_* conta come prova hard di consegna" />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12, marginBottom: 16 }}>
        <Kpi label="Consegna confermata (HTTP/DOM)" value={confirmedDelivered} tone={confirmedDelivered > 0 ? "good" : "warn"} />
        <Kpi label="Non confermata / sospetta" value={unconfirmed} tone={unconfirmed > 0 ? "warn" : "good"} />
      </div>

      <Panel title="Per submitConfirmation">
        <div style={{ fontSize: 12.5, color: "var(--fg-muted)", lineHeight: 1.7 }}>
          {appsByConfirmation.length === 0 ? "nessun dato" : appsByConfirmation.map((r) => `${r.submitConfirmation ?? "null"}: ${r._count._all}`).join(" · ")}
        </div>
      </Panel>
      <Panel title="Per submittedVia">
        <div style={{ fontSize: 12.5, color: "var(--fg-muted)", lineHeight: 1.7 }}>
          {appsBySubmittedVia.map((r) => `${r.submittedVia ?? "null"}: ${r._count._all}`).join(" · ")}
        </div>
      </Panel>
      <Panel title="Per status">
        <div style={{ fontSize: 12.5, color: "var(--fg-muted)", lineHeight: 1.7 }}>
          {appsByStatus.map((r) => `${r.status}: ${r._count._all}`).join(" · ")}
        </div>
      </Panel>

      {confirmedDelivered === 0 && totalApps > 0 && (
        <div style={{ marginTop: 14, padding: "10px 12px", borderRadius: 8, background: "rgba(220,38,38,0.08)", border: "1px solid rgba(220,38,38,0.3)", fontSize: 12.5, color: "#fca5a5" }}>
          ZERO candidature con prova hard di consegna su {totalApps} totali. Priorità #1.
        </div>
      )}
    </>
  );
}
