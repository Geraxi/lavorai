import type { Metadata } from "next";
import Link from "next/link";
import { AppTopbar } from "@/components/design/topbar";
import { Icon } from "@/components/design/icon";
import { CompanyLogo, companyColor } from "@/components/design/company-logo";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/db";

export const metadata: Metadata = { title: "Analisi" };
export const dynamic = "force-dynamic";

const C = { sent: "hsl(var(--primary))", eval: "#1F6BFF", int: "#7E3FF2", off: "#FFB400" };

/**
 * Analisi fit-to-viewport: 4 KPI · [andamento 30g stacked | totali periodo]
 * · [top aziende | canali | round attivi] · per portale ATS.
 */
export default async function AnalyticsPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const thirtyStart = new Date(todayStart.getTime() - 29 * 86400_000);
  const prevStart = new Date(thirtyStart.getTime() - 30 * 86400_000);

  const deliveredWhere = { userId: user.id, status: "success", submittedVia: { not: null } } as const;

  const [totalApps, last30, prev30, bySubmittedVia, byCompanyRaw, bySource, activeSessions] = await Promise.all([
    prisma.application.count({ where: deliveredWhere }),
    prisma.application.findMany({
      where: { ...deliveredWhere, createdAt: { gte: thirtyStart } },
      select: { createdAt: true, viewedAt: true, lastReplyAt: true, lastReplyKind: true, userStatus: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.application.count({ where: { ...deliveredWhere, createdAt: { gte: prevStart, lt: thirtyStart } } }),
    prisma.application.groupBy({ by: ["submittedVia"], where: deliveredWhere, _count: true }),
    prisma.application.findMany({ where: deliveredWhere, select: { job: { select: { company: true } } } }),
    prisma.application.groupBy({ by: ["portal"], where: deliveredWhere, _count: true }),
    prisma.applicationSession.findMany({
      where: { userId: user.id, status: { in: ["active", "auto", "paused"] } },
      select: { id: true, title: true, label: true, status: true, sentCount: true, targetCount: true },
      orderBy: { createdAt: "asc" },
      take: 6,
    }),
  ]);

  const isEmpty = totalApps === 0;
  const sent30 = last30.length;
  const isInterview = (a: { userStatus: string | null; lastReplyKind: string | null }) => a.userStatus === "colloquio" || a.lastReplyKind === "colloquio";
  const isOffer = (a: { userStatus: string | null }) => a.userStatus === "offerta";
  const isEval = (a: { viewedAt: Date | null; lastReplyAt: Date | null; userStatus: string | null; lastReplyKind: string | null }) => !!a.viewedAt && !isInterview(a) && !isOffer(a);

  const eval30 = last30.filter(isEval).length;
  const int30 = last30.filter(isInterview).length;
  const off30 = last30.filter(isOffer).length;
  const viewed30 = last30.filter((a) => a.viewedAt).length;

  const delta = prev30 === 0 ? (sent30 > 0 ? 100 : 0) : Math.round(((sent30 - prev30) / prev30) * 100);
  const responseRate = sent30 === 0 ? 0 : Math.round((viewed30 / sent30) * 100);
  const respTimes = last30.filter((a) => a.viewedAt).map((a) => a.viewedAt!.getTime() - a.createdAt.getTime());
  const avgMs = respTimes.length ? respTimes.reduce((s, n) => s + n, 0) / respTimes.length : null;
  const avgLabel = avgMs == null ? "—" : avgMs < 3600_000 ? `${Math.round(avgMs / 60_000)} min` : avgMs < 86400_000 ? `${Math.round(avgMs / 3600_000)} h` : `${Math.round(avgMs / 86400_000)} giorni`;
  const savedMin = totalApps * 15;
  const savedLabel = savedMin < 60 ? `${savedMin}m` : `${Math.floor(savedMin / 60)}h ${savedMin % 60}m`;

  // Bucket giornalieri (30) per categoria
  const days = Array.from({ length: 30 }, () => ({ sent: 0, eval: 0, int: 0, off: 0 }));
  for (const a of last30) {
    const i = Math.floor((a.createdAt.getTime() - thirtyStart.getTime()) / 86400_000);
    if (i < 0 || i > 29) continue;
    days[i].sent++;
    if (isEval(a)) days[i].eval++;
    if (isInterview(a)) days[i].int++;
    if (isOffer(a)) days[i].off++;
  }
  const dayMax = Math.max(1, ...days.map((d) => d.sent));
  const yTicks = niceTicks(dayMax);

  const companyCounts = new Map<string, number>();
  for (const a of byCompanyRaw) {
    const c = a.job.company?.trim() || "Sconosciuta";
    companyCounts.set(c, (companyCounts.get(c) ?? 0) + 1);
  }
  const topCompanies = [...companyCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const topMax = Math.max(1, ...topCompanies.map(([, n]) => n));
  const channels = bySubmittedVia.map((r) => ({ k: r.submittedVia ?? "altro", n: r._count })).sort((a, b) => b.n - a.n).slice(0, 5);
  const chMax = Math.max(1, ...channels.map((c) => c.n));
  const portals = bySource.filter((r) => r.portal).sort((a, b) => b._count - a._count).slice(0, 6);

  return (
    <>
      <AppTopbar title="Analisi" breadcrumb="Lavoro" />
      <div className="fit-page" style={{ gridTemplateColumns: "repeat(3, minmax(0,1fr))", gridTemplateRows: "auto auto minmax(0,1.15fr) minmax(0,1fr) auto" }}>
        {/* Header */}
        <div style={{ gridColumn: "1 / -1", display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16 }}>
          <div>
            <h1 className="fit-h1">Analisi</h1>
            <p className="fit-hero-sub">{isEmpty ? "Le tue metriche appariranno qui appena invii la prima candidatura." : "Una panoramica completa delle tue candidature e delle performance dell'AI."}</p>
          </div>
          <span className="ds-btn ds-btn-sm" style={{ cursor: "default" }}><Icon name="calendar" size={13} /> Ultimi 30 giorni <Icon name="chevron-down" size={12} /></span>
        </div>

        {/* KPI */}
        <div style={{ gridColumn: "1 / -1", display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 12 }}>
          <Kpi icon="send" color={C.sent} label="Candidature inviate" value={String(sent30)} delta={isEmpty ? undefined : `${delta >= 0 ? "↗ +" : "↘ "}${delta}%`} up={delta >= 0} sub="rispetto ai 30 giorni precedenti" />
          <Kpi icon="eye" color={C.eval} label="Tasso di risposta" value={`${responseRate}%`} sub={`${viewed30} su ${sent30} aperte`} />
          <Kpi icon="clock" color={C.int} label="Tempo medio risposta" value={avgLabel} sub="per chi risponde" />
          <Kpi icon="zap" color={C.sent} label="Tempo risparmiato" value={isEmpty ? "0m" : savedLabel} sub="stima 15 min/candidatura" />
        </div>

        {/* Andamento */}
        <div className="fit-card" style={{ gridColumn: "1 / 3" }}>
          <div className="fit-card-head">
            <div className="fit-card-title">Andamento candidature</div>
            <div style={{ display: "flex", gap: 14, fontSize: 11.5, color: "var(--fg-muted)" }}>
              <Legend c={C.sent} l="Inviate" /><Legend c={C.eval} l="In valutazione" /><Legend c={C.int} l="Colloqui" /><Legend c={C.off} l="Offerte" />
            </div>
          </div>
          <div className="fit-body" style={{ flexDirection: "row", gap: 10 }}>
            <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", fontSize: 10.5, color: "var(--fg-subtle)", paddingBottom: 18, flexShrink: 0 }} className="fit-num">
              {yTicks.slice().reverse().map((t) => <span key={t}>{t}</span>)}
            </div>
            <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
              <div style={{ flex: 1, minHeight: 0, display: "flex", alignItems: "flex-end", gap: 3, borderBottom: "1px solid var(--border-ds)", position: "relative" }}>
                {yTicks.map((t) => (
                  <div key={t} style={{ position: "absolute", left: 0, right: 0, bottom: `${(t / yTicks[yTicks.length - 1]) * 100}%`, borderTop: "1px dashed var(--border-ds)", opacity: 0.5 }} />
                ))}
                {days.map((d, i) => {
                  const yMax = yTicks[yTicks.length - 1] || 1;
                  const rest = Math.max(0, d.sent - d.eval - d.int - d.off);
                  return (
                    <div key={i} title={`${d.sent} inviate · ${d.eval} in valutazione · ${d.int} colloqui · ${d.off} offerte`} style={{ flex: 1, height: "100%", display: "flex", flexDirection: "column", justifyContent: "flex-end", position: "relative", zIndex: 1 }}>
                      <div style={{ height: `${(rest / yMax) * 100}%`, background: C.sent, borderRadius: "3px 3px 0 0", minHeight: rest ? 2 : 0 }} />
                      <div style={{ height: `${(d.eval / yMax) * 100}%`, background: C.eval, minHeight: d.eval ? 2 : 0 }} />
                      <div style={{ height: `${(d.int / yMax) * 100}%`, background: C.int, minHeight: d.int ? 2 : 0 }} />
                      <div style={{ height: `${(d.off / yMax) * 100}%`, background: C.off, minHeight: d.off ? 2 : 0 }} />
                    </div>
                  );
                })}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10.5, color: "var(--fg-subtle)", marginTop: 6 }} className="fit-num">
                {[0, 5, 10, 15, 20, 25, 29].map((i) => { const d = new Date(thirtyStart.getTime() + i * 86400_000); return <span key={i}>{d.getDate()} {d.toLocaleDateString("it-IT", { month: "short" }).replace(".", "")}</span>; })}
              </div>
            </div>
          </div>
        </div>

        {/* Totali periodo */}
        <div className="fit-card">
          <div className="fit-card-head"><div className="fit-card-title">Totali periodo</div></div>
          <div className="fit-body" style={{ justifyContent: "center", gap: 4 }}>
            {[{ c: C.sent, l: "Inviate", n: sent30 }, { c: C.eval, l: "In valutazione", n: eval30 }, { c: C.int, l: "Colloqui", n: int30 }, { c: C.off, l: "Offerte", n: off30 }].map((r) => (
              <Link key={r.l} href="/applications" className="fit-row" style={{ gridTemplateColumns: "10px 1fr auto 14px", textDecoration: "none", color: "inherit", padding: "11px 0" }}>
                <span style={{ width: 8, height: 8, borderRadius: 999, background: r.c }} />
                <span>{r.l}</span>
                <strong className="fit-num">{r.n}</strong>
                <Icon name="chevron-right" size={13} style={{ color: "var(--fg-subtle)" }} />
              </Link>
            ))}
          </div>
        </div>

        {/* Top aziende */}
        <div className="fit-card">
          <div className="fit-card-head">
            <div><div className="fit-card-title">Top aziende</div><div className="fit-card-sub">Aziende con più candidature inviate.</div></div>
            <Link href="/applications" className="fit-link">Vedi tutte <Icon name="arrow-right" size={12} /></Link>
          </div>
          <div className="fit-body fit-scroll" style={{ justifyContent: topCompanies.length ? "flex-start" : "center" }}>
            {topCompanies.length === 0 ? <Muted>Nessun dato.</Muted> : topCompanies.map(([name, n]) => (
              <Bar key={name} left={<span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}><CompanyLogo company={name} color={companyColor(name)} size={22} rounded={6} /><span className="fit-ellipsis">{name}</span></span>} n={n} max={topMax} />
            ))}
          </div>
        </div>

        {/* Canali di invio */}
        <div className="fit-card">
          <div className="fit-card-head">
            <div><div className="fit-card-title">Canali di invio</div><div className="fit-card-sub">Da quali fonti provengono le opportunità.</div></div>
          </div>
          <div className="fit-body fit-scroll" style={{ justifyContent: channels.length ? "flex-start" : "center" }}>
            {channels.length === 0 ? <Muted>Nessun dato.</Muted> : channels.map((c) => (
              <Bar key={c.k} left={<span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}><span style={{ width: 22, height: 22, borderRadius: 6, background: "var(--bg-sunken)", border: "1px solid var(--border-ds)", display: "grid", placeItems: "center", flexShrink: 0 }}><Icon name={c.k.startsWith("email") ? "inbox" : "globe"} size={12} /></span><span className="fit-ellipsis">{channelLabel(c.k)}</span></span>} n={c.n} max={chMax} />
            ))}
          </div>
        </div>

        {/* Round attivi */}
        <div className="fit-card">
          <div className="fit-card-head">
            <div><div className="fit-card-title"><Icon name="target" size={14} /> Round attivi</div><div className="fit-card-sub">Candidature in corso per ruolo.</div></div>
            <Link href="/applications" className="fit-link">Vedi tutti <Icon name="arrow-right" size={12} /></Link>
          </div>
          <div className="fit-body fit-scroll" style={{ justifyContent: activeSessions.length ? "flex-start" : "center" }}>
            {activeSessions.length === 0 ? <Muted>Nessun round attivo. Avviane uno dalla dashboard.</Muted> : activeSessions.map((s) => {
              const pct = Math.min(100, Math.round((s.sentCount / Math.max(1, s.targetCount)) * 100));
              return (
                <div key={s.id} style={{ padding: "7px 0", borderBottom: "1px solid var(--border-ds)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 5 }}>
                    <span className="fit-ellipsis" style={{ fontWeight: 500 }}>{s.title ?? s.label}</span>
                    <span className="fit-num" style={{ color: "var(--fg-muted)", fontSize: 11.5, whiteSpace: "nowrap" }}>{s.sentCount} / {s.targetCount} · {s.status === "paused" ? "in pausa" : "attivo"}</span>
                  </div>
                  <div style={{ height: 4, borderRadius: 999, background: "var(--bg-sunken)", overflow: "hidden" }}><div style={{ width: `${pct}%`, height: "100%", background: s.status === "paused" ? "var(--fg-subtle)" : C.sent }} /></div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Per portale ATS */}
        <div className="fit-card" style={{ gridColumn: "1 / -1", padding: "12px 18px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ flexShrink: 0 }}>
              <div className="fit-card-title"><Icon name="globe" size={14} /> Per portale ATS</div>
              <div className="fit-card-sub">Distribuzione delle candidature per portale.</div>
            </div>
            <div style={{ flex: 1, display: "grid", gridTemplateColumns: `repeat(${Math.max(1, portals.length)}, minmax(0,1fr))`, gap: 10 }}>
              {portals.length === 0 ? <Muted>Nessun dato.</Muted> : portals.map((r) => (
                <div key={r.portal} style={{ padding: "10px 14px", borderRadius: 12, background: "var(--bg-sunken)", border: "1px solid var(--border-ds)" }}>
                  <div style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--fg-muted)" }}>{r.portal}</div>
                  <div className="fit-num" style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em", marginTop: 2 }}>{r._count}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function Kpi({ icon, color, label, value, delta, up, sub }: { icon: "send" | "eye" | "clock" | "zap"; color: string; label: string; value: string; delta?: string; up?: boolean; sub: string }) {
  return (
    <div className="fit-card fit-kpi">
      <div className="lbl"><span className="ico" style={{ background: `color-mix(in srgb, ${color} 18%, transparent)`, color }}><Icon name={icon} size={15} /></span>{label}</div>
      <div className="val">{value}{delta && <span className="delta" style={{ color: up ? "hsl(var(--primary))" : "#EF3E42" }}>{delta}</span>}</div>
      <div className="sub">{sub}</div>
    </div>
  );
}
function Legend({ c, l }: { c: string; l: string }) {
  return <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><span style={{ width: 7, height: 7, borderRadius: 999, background: c }} />{l}</span>;
}
function Bar({ left, n, max }: { left: React.ReactNode; n: number; max: number }) {
  return (
    <div style={{ padding: "7px 0" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, fontSize: 12.5, marginBottom: 5 }}>
        {left}<span className="fit-num" style={{ color: "var(--fg-muted)" }}>{n}</span>
      </div>
      <div style={{ height: 4, borderRadius: 999, background: "var(--bg-sunken)", overflow: "hidden" }}><div style={{ width: `${(n / max) * 100}%`, height: "100%", background: "hsl(var(--primary))" }} /></div>
    </div>
  );
}
function Muted({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 12.5, color: "var(--fg-muted)", textAlign: "center" }}>{children}</div>;
}
function niceTicks(max: number): number[] {
  const step = max <= 4 ? 1 : max <= 10 ? 2 : max <= 20 ? 5 : max <= 50 ? 10 : Math.ceil(max / 5 / 10) * 10;
  const top = Math.ceil(max / step) * step;
  const out: number[] = [];
  for (let v = 0; v <= top; v += step) out.push(v);
  return out;
}
function channelLabel(k: string): string {
  if (k === "portal_greenhouse") return "Greenhouse (form ATS)";
  if (k === "portal_lever") return "Lever (form ATS)";
  if (k === "portal_workable") return "Workable (form ATS)";
  if (k === "portal_ashby") return "Ashby (form ATS)";
  if (k === "email_recruiter") return "Email recruiter (Resend)";
  if (k === "mock_demo") return "Demo (sandbox)";
  return k;
}
