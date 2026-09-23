export default function AnalyticsLoading() {
  return <div role="status" aria-label="Caricamento analisi" style={{ padding: 32, display: "grid", gap: 28 }}>
    <div style={{ height: 60, width: "60%", background: "var(--bg-elev)", borderRadius: 8 }} />
    <div style={{ height: 120, borderBlock: "1px solid var(--border-ds)", background: "var(--bg-elev)" }} />
    <div style={{ height: 300, background: "var(--bg-elev)", borderRadius: 8 }} />
    <span style={{ color: "var(--fg-muted)" }}>Caricamento delle tue performance…</span>
  </div>;
}
