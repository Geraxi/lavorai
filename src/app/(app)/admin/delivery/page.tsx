import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { Kpi, Panel, PageTitle } from "../_ui";

export const metadata: Metadata = { title: "Admin · Consegna", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function AdminDeliveryPage() {
  const [appsByStatus, appsByConfirmation, appsBySubmittedVia, totalApps, failedApps] =
    await Promise.all([
      prisma.application.groupBy({ by: ["status"], _count: { _all: true } }),
      prisma.application.groupBy({ by: ["submitConfirmation"], _count: { _all: true } }),
      prisma.application.groupBy({ by: ["submittedVia"], _count: { _all: true } }),
      prisma.application.count(),
      // Raccogli errorMessage delle failed per aggregazione top-N.
      prisma.application.findMany({
        where: { status: "failed", errorMessage: { not: null } },
        select: { errorMessage: true },
        take: 5000,
      }),
    ]);

  // Top-10 errori: normalizza (prima frase) + conta ricorrenze
  const errBucket = new Map<string, number>();
  for (const a of failedApps) {
    const raw = (a.errorMessage ?? "").trim();
    if (!raw) continue;
    // Prima frase o primi 100 char — abbastanza per accorpare messaggi simili
    const key = raw.split(/[.\n]/)[0].slice(0, 120);
    errBucket.set(key, (errBucket.get(key) ?? 0) + 1);
  }
  const topErrors = [...errBucket.entries()]
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10);

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

      <Panel title="Top errori (failed)">
        {topErrors.length === 0 ? (
          <div style={{ fontSize: 12.5, color: "var(--fg-muted)" }}>nessun errore registrato</div>
        ) : (
          <table style={{ width: "100%", fontSize: 12.5, borderCollapse: "collapse" }}>
            <tbody>
              {topErrors.map(([msg, count]) => (
                <tr key={msg} style={{ borderBottom: "1px solid var(--border-ds)" }}>
                  <td style={{ padding: "6px 8px", color: "#fca5a5", fontWeight: 600, width: 60, whiteSpace: "nowrap" }}>
                    {count}×
                  </td>
                  <td style={{ padding: "6px 8px", color: "var(--fg-muted)", lineHeight: 1.5 }}>
                    {msg}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>

      {confirmedDelivered === 0 && totalApps > 0 && (
        <div style={{ marginTop: 14, padding: "10px 12px", borderRadius: 8, background: "rgba(220,38,38,0.08)", border: "1px solid rgba(220,38,38,0.3)", fontSize: 12.5, color: "#fca5a5" }}>
          ZERO candidature con prova hard di consegna su {totalApps} totali. Priorità #1.
        </div>
      )}
    </>
  );
}
