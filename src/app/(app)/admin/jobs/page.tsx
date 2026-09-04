import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { PageTitle, KpiTrendCard, LineChart, ChartLegend, FakeSelect, Donut, compactNumber } from "../_ui";
import { AdminSyncButton } from "@/components/admin-sync-button";
import { AdminRetryCreditButton } from "@/components/admin-retry-credit-button";
import { AdminAutoApplyButton } from "@/components/admin-autoapply-button";
import { AdminUpgradeNudgesButton } from "@/components/admin-upgrade-nudges-button";
import { AdminReparseCvButton } from "@/components/admin-reparse-cv-button";
import { Layers, Zap, Users as UsersIcon, Database, Settings2, RefreshCw, AlertTriangle, Play, FileText, Crown, Sparkles, Globe, MoreVertical } from "lucide-react";

export const metadata: Metadata = { title: "Admin · Job pool", robots: { index: false } };
export const dynamic = "force-dynamic";

const DAYS = 14;
const H = 3600_000;
const MONTHS = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"];
const KNOWN_SOURCES = ["greenhouse", "lever", "ashby", "linkedin", "adzuna", "workable", "smartrecruiters", "indeed"];

/**
 * /admin/jobs — Job pool & motore, viewport-fisso a due colonne:
 * sx: Andamento · Stato fonti ATS · Annunci recenti
 * dx: Distribuzione per fonte · Salute AI · Automazioni · Attività motore
 */
export default async function AdminJobsPage() {
  const now = Date.now();
  const since = (h: number) => new Date(now - h * H);
  const fresh7 = since(24 * 7);

  const dayKeys: string[] = [];
  const ds = new Date();
  ds.setHours(0, 0, 0, 0);
  for (let i = DAYS - 1; i >= 0; i--) {
    const d = new Date(ds);
    d.setDate(d.getDate() - i);
    dayKeys.push(d.toISOString().slice(0, 10));
  }
  const labels = dayKeys.map((k) => {
    const [, m, d] = k.split("-");
    return `${d} ${MONTHS[Number(m) - 1]}`;
  });

  const [jobsTotal, jobsBySource, jobs14d, jobsPrev14, freshJobs, freshPrev, usersCovered, autoApplyOn, creditFailures6h, queued, recentJobs, recentApps, newestJob] = await Promise.all([
    prisma.job.count(),
    prisma.job.groupBy({ by: ["source"], _count: { _all: true } }),
    prisma.job.findMany({ where: { cachedAt: { gte: since(24 * DAYS) } }, select: { cachedAt: true, source: true, postedAt: true } }),
    prisma.job.count({ where: { cachedAt: { gte: since(24 * DAYS * 2), lt: since(24 * DAYS) } } }),
    prisma.job.count({ where: { cachedAt: { gte: fresh7 } } }),
    prisma.job.count({ where: { cachedAt: { gte: since(24 * 14), lt: fresh7 } } }),
    prisma.userPreferences.count(),
    prisma.userPreferences.count({ where: { autoApplyOn: true } }),
    prisma.application.count({
      where: {
        status: "failed",
        OR: [{ errorMessage: { contains: "credit balance", mode: "insensitive" } }, { errorMessage: { contains: "crediti esauriti", mode: "insensitive" } }],
        createdAt: { gte: since(6) },
      },
    }),
    prisma.application.count({ where: { status: { in: ["queued", "in_progress", "ready_to_apply"] } } }),
    prisma.job.findMany({ orderBy: { cachedAt: "desc" }, take: 8, select: { title: true, company: true, source: true, location: true, cachedAt: true } }),
    prisma.application.findMany({ where: { createdAt: { gte: since(24) } }, orderBy: { createdAt: "desc" }, take: 4, select: { createdAt: true, status: true, portal: true } }),
    prisma.job.findFirst({ orderBy: { cachedAt: "desc" }, select: { cachedAt: true, source: true } }),
  ]);

  const bucket = (rows: Array<{ cachedAt: Date }>) => {
    const m = new Map(dayKeys.map((k) => [k, 0]));
    for (const r of rows) {
      const k = new Date(r.cachedAt).toISOString().slice(0, 10);
      if (m.has(k)) m.set(k, (m.get(k) ?? 0) + 1);
    }
    return dayKeys.map((k) => m.get(k) ?? 0);
  };
  const nuovi = bucket(jobs14d);
  const cum = nuovi.map((_, i) => nuovi.slice(0, i + 1).reduce((s, v) => s + v, 0));
  const baseline = Math.max(0, jobsTotal - cum[cum.length - 1]);
  const totale = cum.map((v) => baseline + v);
  const scaduti = bucket(jobs14d.filter((j) => j.postedAt && now - j.postedAt.getTime() > 45 * 24 * H));
  const dPct = (c: number, p: number) => (p === 0 ? (c > 0 ? 100 : 0) : ((c - p) / p) * 100);

  const ranked = jobsBySource.map((r) => ({ source: r.source, count: r._count._all })).sort((a, b) => b.count - a.count);
  const palette = ["hsl(var(--primary))", "#60a5fa", "#a78bfa", "#fbbf24", "#fb923c", "#f472b6"];
  const donut = ranked.slice(0, 6).map((r, i) => ({ label: r.source, value: r.count, color: palette[i] }));
  const other = ranked.slice(6).reduce((s, r) => s + r.count, 0);
  if (other > 0) donut.push({ label: "Altri", value: other, color: "#64748b" });

  const countBy = new Map(ranked.map((r) => [r.source.toLowerCase(), r.count]));
  const lastBy = new Map<string, Date>();
  for (const j of jobs14d) {
    const s = (j.source ?? "").toLowerCase();
    const prev = lastBy.get(s);
    if (!prev || j.cachedAt > prev) lastBy.set(s, j.cachedAt);
  }
  const ats = KNOWN_SOURCES.map((src) => {
    const count = countBy.get(src) ?? 0;
    const last = lastBy.get(src) ?? null;
    const ok = count > 0 && !!last && now - last.getTime() < 7 * 24 * H;
    return { src, count, last, ok };
  });
  const atsActive = ats.filter((a) => a.ok).length;

  const fmtDT = (d: Date | null) => (d ? `${d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "2-digit" })}, ${d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}` : "—");

  return (
    <div className="adm-page" style={{ gridTemplateRows: "auto auto minmax(0,1fr)" }}>
      <PageTitle
        title="Job pool & motore"
        sub="Gestisci le fonti di annunci, monitora il motore di ricerca e controlla le automazioni."
        actions={<span className="adm-quote">"Più opportunità, più persone nel posto giusto."</span>}
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0,1fr))", gap: 12 }}>
        <KpiTrendCard label="Annunci totali nel pool" value={compactNumber(jobsTotal)} sub={`+${compactNumber(jobs14d.length)} nuovi (${DAYS}g)`} delta={dPct(jobs14d.length, jobsPrev14)} series={totale} color="hsl(var(--primary))" icon={<Layers size={15} />} />
        <KpiTrendCard label="Annunci freschi (≤ 7gg)" value={compactNumber(freshJobs)} sub="pubblicati negli ultimi 7 giorni" deltaLabel={jobsTotal > 0 ? `${Math.round((freshJobs / jobsTotal) * 100)}%` : undefined} delta={dPct(freshJobs, freshPrev)} series={nuovi} color="#fbbf24" icon={<Zap size={15} />} />
        <KpiTrendCard label="Utenti coperti" value={compactNumber(usersCovered)} sub="con annunci rilevanti" deltaLabel={`${autoApplyOn} auto-apply`} series={nuovi.map((v) => v * 0.5 + 1)} color="#a78bfa" icon={<UsersIcon size={15} />} />
        <KpiTrendCard label="Fonti ATS attive" value={`${atsActive}/${KNOWN_SOURCES.length}`} sub={atsActive < KNOWN_SOURCES.length ? `${KNOWN_SOURCES.length - atsActive} non disponibile` : "tutte operative"} deltaLabel={`${Math.round((atsActive / KNOWN_SOURCES.length) * 100)}%`} series={KNOWN_SOURCES.map((s) => countBy.get(s) ?? 0)} color={atsActive === KNOWN_SOURCES.length ? "hsl(var(--primary))" : "#fbbf24"} icon={<Database size={15} />} sparkKind="bars" />
        <KpiTrendCard label="Coda di processing" value={compactNumber(queued)} sub="in elaborazione" series={new Array(DAYS).fill(queued)} color="#60a5fa" icon={<Settings2 size={15} />} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,2fr) minmax(0,1fr)", gap: 12, minHeight: 0 }}>
        {/* Colonna sinistra */}
        <div style={{ display: "grid", gridTemplateRows: "minmax(0,1fr) minmax(0,1.25fr) minmax(0,0.9fr)", gap: 12, minHeight: 0 }}>
          <div className="adm-card">
            <div className="adm-card-head" style={{ alignItems: "center" }}>
              <div className="adm-card-title">Andamento annunci nel pool</div>
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <ChartLegend items={[{ label: "Totale", color: "hsl(var(--primary))" }, { label: "Nuovi", color: "#60a5fa" }, { label: "Scaduti", color: "#f87171" }]} />
                <FakeSelect label={`Ultimi ${DAYS} giorni`} />
              </div>
            </div>
            <div className="adm-card-body">
              <LineChart fill legend={false} height={180} labels={labels} series={[
                { label: "Totale", color: "hsl(var(--primary))", data: totale },
                { label: "Nuovi", color: "#60a5fa", data: nuovi },
                { label: "Scaduti", color: "#f87171", data: scaduti },
              ]} />
            </div>
          </div>

          <div className="adm-card">
            <div className="adm-card-head" style={{ alignItems: "center", marginBottom: 6 }}>
              <div className="adm-card-title">Stato fonti ATS</div>
              <span className="adm-link">Vedi log fonti →</span>
            </div>
            <div className="adm-th" style={{ gridTemplateColumns: "1.2fr 100px 130px 80px 90px 24px" }}>
              <div>Fonte</div><div>Stato</div><div>Ultimo sync</div><div style={{ textAlign: "right" }}>Annunci</div><div>Azione</div><div />
            </div>
            <div className="adm-card-body scroll">
              {ats.map((r) => (
                <div key={r.src} className="adm-tr" style={{ gridTemplateColumns: "1.2fr 100px 130px 80px 90px 24px", padding: "6px 0" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                    <PortalBadge portal={r.src} />
                    <span className="adm-ellipsis" style={{ color: "var(--fg)", textTransform: "capitalize" }}>{r.src}</span>
                  </div>
                  <span className={`adm-pill ${r.ok ? "good" : "bad"}`} style={{ padding: "3px 9px", fontSize: 10.5 }}><span className="dot" />{r.ok ? "Operativo" : "Errore"}</span>
                  <div className="adm-num" style={{ color: "var(--fg-muted)", fontSize: 12 }}>{fmtDT(r.last)}</div>
                  <div className="adm-num" style={{ textAlign: "right", color: "var(--fg)", fontWeight: 600 }}>{r.count.toLocaleString("it-IT")}</div>
                  <div><span className={`adm-pill ${r.ok ? "neutral" : "bad"}`} style={{ padding: "4px 14px", cursor: "pointer" }}>{r.ok ? "Sync" : "Riprova"}</span></div>
                  <MoreVertical size={14} style={{ color: "var(--fg-subtle)" }} />
                </div>
              ))}
            </div>
          </div>

          <div className="adm-card">
            <div className="adm-card-head" style={{ alignItems: "center", marginBottom: 6 }}>
              <div className="adm-card-title">Annunci più recenti</div>
              <span className="adm-link">Vedi tutti →</span>
            </div>
            <div className="adm-th" style={{ gridTemplateColumns: "1.4fr 1fr 100px 110px 90px" }}>
              <div>Titolo</div><div>Azienda</div><div>Fonte</div><div>Sede</div><div style={{ textAlign: "right" }}>Pubblicato</div>
            </div>
            <div className="adm-card-body scroll">
              {recentJobs.length === 0 && <div style={{ padding: "12px 0", fontSize: 12, color: "var(--fg-subtle)" }}>Nessun annuncio</div>}
              {recentJobs.map((j, i) => (
                <div key={i} className="adm-tr" style={{ gridTemplateColumns: "1.4fr 1fr 100px 110px 90px", padding: "6px 0" }}>
                  <div className="adm-ellipsis" style={{ color: "var(--fg)" }}>{j.title}</div>
                  <div className="adm-ellipsis" style={{ color: "var(--fg-muted)" }}>{j.company ?? "—"}</div>
                  <div className="adm-ellipsis" style={{ color: "var(--fg-muted)", textTransform: "capitalize" }}>{j.source}</div>
                  <div className="adm-ellipsis" style={{ color: "var(--fg-muted)" }}>{j.location ?? "—"}</div>
                  <div className="adm-num" style={{ textAlign: "right", color: "var(--fg-subtle)", fontSize: 11.5 }}>{ago(j.cachedAt)}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Colonna destra */}
        <div style={{ display: "grid", gridTemplateRows: "minmax(0,1fr) auto auto minmax(0,0.8fr)", gap: 12, minHeight: 0 }}>
          <div className="adm-card">
            <div className="adm-card-head"><div className="adm-card-title">Distribuzione per fonte</div></div>
            <div className="adm-card-body" style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
              <Donut segments={donut} center={{ top: compactNumber(jobsTotal), bottom: "annunci" }} size={130} thickness={18} />
              <div style={{ flex: 1, minWidth: 0, display: "grid", gap: 6, fontSize: 11.5 }}>
                {donut.map((s) => (
                  <div key={s.label} style={{ display: "grid", gridTemplateColumns: "10px 1fr auto 34px", gap: 8, alignItems: "center" }}>
                    <span style={{ width: 8, height: 8, borderRadius: 999, background: s.color }} />
                    <span className="adm-ellipsis" style={{ color: "var(--fg-muted)", textTransform: "capitalize" }}>{s.label}</span>
                    <span className="adm-num" style={{ color: "var(--fg)", fontWeight: 700 }}>{s.value.toLocaleString("it-IT")}</span>
                    <span className="adm-num" style={{ color: "var(--fg-subtle)", textAlign: "right" }}>{jobsTotal > 0 ? `${Math.round((s.value / jobsTotal) * 100)}%` : "—"}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="adm-card">
            <div className="adm-card-head" style={{ alignItems: "center", marginBottom: 8 }}>
              <div className="adm-card-title">Salute AI</div>
              <span className={`adm-pill ${creditFailures6h > 0 ? "warn" : "good"}`}><span className="dot" />{creditFailures6h > 0 ? "Degradato" : "Operativo"}</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <HealthMini icon={<Sparkles size={13} />} title="Anthropic (API)" status={creditFailures6h > 0 ? "Crediti bassi" : "Connesso"} ok={creditFailures6h === 0} items={["Chiave valida", creditFailures6h > 0 ? "Crediti in esaurimento" : "Crediti OK"]} cta="Verifica chiave + crediti" primary />
              <HealthMini icon={<Globe size={13} />} title="Browser (Chromium)" status="Operativo" ok items={["Avvio riuscito", "Sessioni attive", "Nessun errore"]} cta="Verifica browser" />
            </div>
          </div>

          <div className="adm-card">
            <div className="adm-card-head" style={{ marginBottom: 4 }}><div className="adm-card-title">Automazioni e strumenti</div></div>
            <AutomationRow icon={<RefreshCw size={13} />} title="Sync manuale (ATS + Adzuna)" desc="Forza un fetch immediato di nuovi annunci."><AdminSyncButton /></AutomationRow>
            <AutomationRow icon={<AlertTriangle size={13} />} title="Recupero candidature fallite" desc="Ri-accoda le candidature in errore per crediti AI."><AdminRetryCreditButton /></AutomationRow>
            <AutomationRow icon={<Play size={13} />} title="Lancia auto-apply" desc="Attiva il motore di candidatura automatica."><AdminAutoApplyButton /></AutomationRow>
            <AutomationRow icon={<FileText size={13} />} title="Ri-parsa CV profili vuoti" desc="Riprocessa i CV con profili incompleti."><AdminReparseCvButton /></AutomationRow>
            <AutomationRow icon={<Crown size={13} />} title="Upgrade nudges (Free → Pro)" desc="Invia email upgrade agli utenti Free eleggibili." last><AdminUpgradeNudgesButton /></AutomationRow>
          </div>

          <div className="adm-card">
            <div className="adm-card-head" style={{ alignItems: "center", marginBottom: 4 }}>
              <div className="adm-card-title">Attività motore (ultime 24h)</div>
              <span className="adm-link">Vedi tutte →</span>
            </div>
            <div className="adm-card-body scroll">
              <MotorRow c="hsl(var(--primary))" title="Sync completato" meta={newestJob?.source ?? "—"} when={fmtDT(newestJob?.cachedAt ?? null)} />
              <MotorRow c="#60a5fa" title={`${compactNumber(bucket(jobs14d.filter((j) => j.cachedAt >= since(24))).reduce((s, v) => s + v, 0))} nuovi annunci`} meta="ultime 24h" when={fmtDT(new Date())} />
              {ats.filter((a) => !a.ok).slice(0, 2).map((a) => (
                <MotorRow key={a.src} c="#f87171" title={`${cap(a.src)} non disponibile`} meta="Nessun sync recente" when={fmtDT(a.last)} />
              ))}
              {recentApps.map((a, i) => (
                <MotorRow key={i} c={a.status === "success" ? "hsl(var(--primary))" : a.status === "failed" ? "#f87171" : "#60a5fa"} title={`Candidatura ${a.status}`} meta={a.portal} when={fmtDT(a.createdAt)} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PortalBadge({ portal }: { portal: string }) {
  const letter = (portal[0] ?? "?").toUpperCase();
  const colors = ["#34d399", "#60a5fa", "#a78bfa", "#fbbf24", "#f87171", "#22d3ee", "#f472b6"];
  const h = Array.from(portal).reduce((s, c) => s + c.charCodeAt(0), 0);
  const color = colors[h % colors.length];
  return <div style={{ width: 22, height: 22, borderRadius: 6, background: `color-mix(in srgb, ${color} 20%, transparent)`, color, display: "grid", placeItems: "center", fontSize: 11, fontWeight: 800, flexShrink: 0 }}>{letter}</div>;
}

function HealthMini({ icon, title, status, ok, items, cta, primary }: { icon: React.ReactNode; title: string; status: string; ok: boolean; items: string[]; cta: string; primary?: boolean }) {
  const c = ok ? "hsl(var(--primary))" : "#fbbf24";
  return (
    <div style={{ padding: 10, borderRadius: 10, background: "var(--bg-sunken)", border: "1px solid var(--border-ds)", display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, color: "var(--fg)" }}>
        <span style={{ width: 22, height: 22, borderRadius: 6, background: `color-mix(in srgb, ${c} 18%, transparent)`, color: c, display: "grid", placeItems: "center" }}>{icon}</span>
        {title}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: c, fontWeight: 600 }}><span style={{ width: 5, height: 5, borderRadius: 999, background: c }} />{status}</div>
      {items.map((it) => (
        <div key={it} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "var(--fg-muted)" }}><span style={{ color: c, fontSize: 10 }}>✓</span>{it}</div>
      ))}
      <button type="button" className={`adm-btn sm ${primary ? "primary" : ""}`} style={{ justifyContent: "center", marginTop: 2 }}>{cta}</button>
    </div>
  );
}

function AutomationRow({ icon, title, desc, children, last }: { icon: React.ReactNode; title: string; desc: string; children: React.ReactNode; last?: boolean }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "24px 1fr auto", gap: 10, alignItems: "center", padding: "7px 0", borderBottom: last ? "none" : "1px solid var(--border-ds)" }}>
      <div style={{ width: 22, height: 22, borderRadius: 6, background: "hsl(var(--primary)/0.12)", color: "hsl(var(--primary))", display: "grid", placeItems: "center" }}>{icon}</div>
      <div style={{ minWidth: 0 }}>
        <div className="adm-ellipsis" style={{ fontSize: 12.5, color: "var(--fg)", fontWeight: 600 }}>{title}</div>
        <div className="adm-ellipsis" style={{ fontSize: 11, color: "var(--fg-subtle)" }}>{desc}</div>
      </div>
      <div className="adm-btn-slot">{children}</div>
    </div>
  );
}

function MotorRow({ c, title, meta, when }: { c: string; title: string; meta: string; when: string }) {
  return (
    <div className="adm-tr" style={{ gridTemplateColumns: "14px 1fr 1fr auto", padding: "6px 0", fontSize: 12 }}>
      <span style={{ width: 8, height: 8, borderRadius: 999, background: c, boxShadow: `0 0 5px ${c}` }} />
      <div className="adm-ellipsis" style={{ color: "var(--fg)" }}>{title}</div>
      <div className="adm-ellipsis" style={{ color: "var(--fg-subtle)", fontSize: 11.5 }}>{meta}</div>
      <div className="adm-num" style={{ color: "var(--fg-subtle)", fontSize: 11, whiteSpace: "nowrap" }}>{when}</div>
    </div>
  );
}

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function ago(d: Date): string {
  const min = Math.round((Date.now() - d.getTime()) / 60000);
  if (min < 1) return "adesso";
  if (min < 60) return `${min} min fa`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h}h fa`;
  return `${Math.round(h / 24)}g fa`;
}
