import Link from "next/link";
import { AlertTriangle, ArrowUpRight, CheckCircle2, DatabaseZap, Users } from "lucide-react";
import { Kpi, PageTitle } from "./_ui";
import { AdminGrowthNav } from "@/components/admin-growth-nav";
import { AdminPeriodPicker } from "@/components/admin-period-picker";
import type { loadAdminGrowthMetrics } from "@/lib/admin-growth-metrics";

type Metrics = Awaited<ReturnType<typeof import("@/lib/admin-growth-metrics").loadAdminGrowthMetrics>>;

export function GrowthHeader({ title, sub, active, query }: { title: string; sub: string; active: string; query: { range?: string; from?: string; to?: string } }) {
  return <>
    <PageTitle title={title} sub={sub} actions={<AdminPeriodPicker range={query.range} from={query.from} to={query.to} />} />
    <AdminGrowthNav active={active} />
  </>;
}

export function DataNotice({ children = "Questa metrica inizierà a popolarsi per gli eventi futuri: il dato storico non viene stimato." }: { children?: React.ReactNode }) {
  return <div className="adm-card" style={{ padding: "11px 14px", flexDirection: "row", gap: 9, alignItems: "center", color: "var(--fg-muted)", fontSize: 12 }}><DatabaseZap size={15} color="#60a5fa" />{children}</div>;
}

export function Funnel({ metrics }: { metrics: Metrics }) {
  const max = Math.max(...metrics.funnel.map((stage) => stage.value), 1);
  return <section className="adm-card">
    <div className="adm-card-head"><div><div className="adm-card-title">Funnel di conversione</div><div className="adm-card-sub">Clicca uno stadio per vedere gli utenti coinvolti.</div></div><span className="adm-pill neutral">{metrics.period.label}</span></div>
    <div style={{ display: "grid", gap: 10 }}>
      {metrics.funnel.map((stage, index) => <Link key={stage.label} href={stage.href} style={{ textDecoration: "none", color: "inherit", display: "grid", gridTemplateColumns: "minmax(130px, 180px) 1fr 44px 18px", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 12.5, color: "var(--fg-muted)" }}>{index + 1}. {stage.label}</span><span style={{ height: 8, background: "var(--bg-sunken)", borderRadius: 99, overflow: "hidden" }}><span style={{ display: "block", width: `${(stage.value / max) * 100}%`, height: "100%", background: index > 6 ? "#fbbf24" : "hsl(var(--primary))", borderRadius: 99 }} /></span><b className="adm-num" style={{ textAlign: "right", fontSize: 13 }}>{stage.value}</b><ArrowUpRight size={13} color="var(--fg-subtle)" />
      </Link>)}
    </div>
    {metrics.drops[0]?.drop > 0 && <div style={{ marginTop: 15, paddingTop: 12, borderTop: "1px solid var(--border-ds)", display: "flex", gap: 8, alignItems: "center", fontSize: 12 }}><AlertTriangle size={14} color="#fbbf24" /><span style={{ color: "var(--fg-muted)" }}>Perdita più grande:</span><b>{metrics.drops[0].label}</b><span className="adm-num" style={{ color: "#fbbf24" }}>−{metrics.drops[0].drop}</span></div>}
  </section>;
}

export function UpgradeReady({ metrics }: { metrics: Metrics }) {
  return <section className="adm-card"><div className="adm-card-head"><div><div className="adm-card-title">Pronti per l&apos;upgrade</div><div className="adm-card-sub">Score trasparente basato solo su segnali disponibili.</div></div><Link href="/admin/users?plan=free" className="adm-link">Apri utenti →</Link></div>
    <div className="adm-card-body scroll">
      {metrics.upgradeReady.length === 0 ? <div style={{ color: "var(--fg-subtle)", fontSize: 12, padding: "14px 0" }}>Nessun utente raggiunge ancora la soglia di interesse.</div> : metrics.upgradeReady.slice(0, 8).map((user) => <Link href={`/admin/users?sel=${user.id}`} key={user.id} className="adm-tr" style={{ gridTemplateColumns: "minmax(0,1fr) 52px 58px", textDecoration: "none", color: "inherit" }}><div className="adm-ellipsis"><div style={{ fontWeight: 600 }}>{user.email}</div><div className="adm-ellipsis" style={{ fontSize: 11, color: "var(--fg-subtle)", marginTop: 2 }}>{user.completed.join(" · ")}</div></div><div className="adm-num" style={{ textAlign: "right", color: "var(--fg-muted)" }}>{user.applications} app.</div><span className={`adm-pill ${user.score >= 60 ? "good" : "warn"}`} style={{ justifySelf: "end" }}>{user.score}/100</span></Link>)}
    </div>
    <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--border-ds)", fontSize: 11, color: "var(--fg-subtle)" }}>Oggi incluso: verifica +10, onboarding +20, CV +20, 3+ candidature +10, attività recente +5, trial terminata +15. I ritorni ripetuti e l&apos;uso del tailoring compariranno quando saranno tracciati.</div>
  </section>;
}

export function OverviewKpis({ metrics }: { metrics: Metrics }) {
  const trialing = metrics.users.filter((u) => u.trialEndsAt && u.trialEndsAt > new Date()).length;
  return <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0,1fr))", gap: 12 }}>
    <Kpi label="MRR attuale" value={`€${metrics.mrr.toLocaleString("it-IT", { maximumFractionDigits: 2 })}`} sub={`${metrics.activePaid.length} abbonamenti Stripe attivi · storico in raccolta`} icon={<Users size={15} />} tone="good" />
    <Kpi label="Nuovi utenti" value={metrics.currentUsers.length} sub={`${metrics.previousSignups} nel periodo precedente`} icon={<Users size={15} />} />
    <Kpi label="Attivazione" value={`${metrics.activationRate.toFixed(1)}%`} sub={`${metrics.activationUsers.length} utenti: verificati + CV + setup + candidatura`} icon={<CheckCircle2 size={15} />} tone="good" />
    <Kpi label="Trial attive" value={trialing} sub="Utenti in prova Pro" icon={<Users size={15} />} />
    <Kpi label="Upgrade-ready" value={metrics.upgradeReady.length} sub="Score ≥30, segnali disponibili" icon={<ArrowUpRight size={15} />} tone="warn" />
  </div>;
}
