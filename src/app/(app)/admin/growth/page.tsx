import { loadAdminGrowthMetrics, adminPeriod } from "@/lib/admin-growth-metrics";
import { DataNotice, Funnel, GrowthHeader, OverviewKpis, UpgradeReady } from "../_growth-ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · Growth", robots: { index: false } };

export default async function AdminGrowthPage({ searchParams }: { searchParams?: Promise<{ range?: string; from?: string; to?: string }> }) {
  const query = (await searchParams) ?? {}; const metrics = await loadAdminGrowthMetrics(adminPeriod(query));
  return <div className="adm-page">
    <GrowthHeader title="Growth" sub="Acquisizione, conversione e utenti più vicini al valore." active="/admin/growth" query={query} />
    <OverviewKpis metrics={metrics} />
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.55fr) minmax(340px,1fr)", gap: 12 }}><Funnel metrics={metrics} /><UpgradeReady metrics={metrics} /></div>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
      <section className="adm-card"><div className="adm-card-head"><div><div className="adm-card-title">Canali di acquisizione</div><div className="adm-card-sub">First-touch attribuito agli iscritti nel periodo.</div></div></div>{metrics.sourceRows.length ? metrics.sourceRows.map(([source, value]) => <MetricRow key={source} label={source} value={value} total={metrics.currentUsers.length} />) : <Empty />}</section>
      <section className="adm-card"><div className="adm-card-head"><div><div className="adm-card-title">Landing page che convertono</div><div className="adm-card-sub">Pagina iniziale salvata al momento dell&apos;iscrizione.</div></div></div>{metrics.landingRows.length ? metrics.landingRows.map(([path, value]) => <MetricRow key={path} label={path} value={value} total={metrics.currentUsers.length} />) : <Empty />}</section>
    </div>
    <DataNotice>Il traffico per source, bounce rate e durata sessione diventano disponibili dai page-view futuri. L&apos;attribuzione signup è già attiva e non viene ricostruita artificialmente.</DataNotice>
  </div>;
}
function MetricRow({ label, value, total }: { label: string; value: number; total: number }) { return <div className="adm-tr" style={{ gridTemplateColumns: "minmax(0,1fr) 1fr 48px" }}><span className="adm-ellipsis">{label}</span><span style={{ height: 6, background: "var(--bg-sunken)", borderRadius: 99, overflow: "hidden" }}><span style={{ display: "block", height: "100%", width: `${total ? value / total * 100 : 0}%`, background: "hsl(var(--primary))" }} /></span><b className="adm-num" style={{ textAlign: "right" }}>{value}</b></div>; }
function Empty() { return <div style={{ color: "var(--fg-subtle)", fontSize: 12, padding: "14px 0" }}>Nessun signup attribuito nel periodo.</div>; }
