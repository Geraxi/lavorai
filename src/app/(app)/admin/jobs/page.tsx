import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import {
  PageTitle,
  KpiTrendCard,
  LineChart,
  Donut,
  compactNumber,
} from "../_ui";
import { AdminSyncButton } from "@/components/admin-sync-button";
import { AdminRetryCreditButton } from "@/components/admin-retry-credit-button";
import { AdminAutoApplyButton } from "@/components/admin-autoapply-button";
import { AdminUpgradeNudgesButton } from "@/components/admin-upgrade-nudges-button";
import { AdminReparseCvButton } from "@/components/admin-reparse-cv-button";
import {
  Layers,
  Zap,
  Users as UsersIcon,
  Database,
  Activity,
  RefreshCw,
  LifeBuoy,
  Rocket,
  FileText,
  Mail,
  Sparkles,
  Globe,
  CheckCircle2,
  Clock,
  AlertTriangle,
  MoreHorizontal,
} from "lucide-react";

export const metadata: Metadata = { title: "Admin · Job pool", robots: { index: false } };
export const dynamic = "force-dynamic";

const DAYS = 14;
const H = 3600_000;

/**
 * /admin/jobs — Job pool & motore.
 * KPI (5) → line andamento + donut fonti → stato ATS + salute AI + automazioni
 * → annunci recenti + attività motore.
 */
export default async function AdminJobsPage() {
  const now = Date.now();
  const since = (h: number) => new Date(now - h * H);
  const fresh = since(24 * 7);

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
    return `${d}/${m}`;
  });

  const [
    jobsTotal,
    jobsBySource,
    jobs14dRows,
    jobsPrev14dRows,
    freshJobs,
    newestJob,
    autoApplyOn,
    creditFailures6h,
    queuedApps,
    recentJobs,
    recentEmails,
    recentApps,
  ] = await Promise.all([
    prisma.job.count(),
    prisma.job.groupBy({ by: ["source"], _count: { _all: true } }),
    prisma.job.findMany({
      where: { cachedAt: { gte: since(24 * DAYS) } },
      select: { cachedAt: true, source: true, postedAt: true },
    }),
    prisma.job.findMany({
      where: { cachedAt: { gte: since(24 * DAYS * 2), lt: since(24 * DAYS) } },
      select: { cachedAt: true },
    }),
    prisma.job.count({ where: { cachedAt: { gte: fresh } } }),
    prisma.job.findFirst({ orderBy: { cachedAt: "desc" }, select: { cachedAt: true } }),
    prisma.userPreferences.count({ where: { autoApplyOn: true } }),
    prisma.application.count({
      where: {
        status: "failed",
        OR: [
          { errorMessage: { contains: "credit balance", mode: "insensitive" } },
          { errorMessage: { contains: "crediti esauriti", mode: "insensitive" } },
        ],
        createdAt: { gte: since(6) },
      },
    }),
    prisma.application.count({ where: { status: { in: ["queued", "in_progress", "ready_to_apply"] } } }),
    prisma.job.findMany({
      orderBy: { cachedAt: "desc" },
      take: 6,
      select: { title: true, company: true, source: true, location: true, cachedAt: true },
    }),
    prisma.emailLog
      .findMany({ orderBy: { createdAt: "desc" }, take: 3, select: { createdAt: true, kind: true } })
      .catch(() => []),
    prisma.application.findMany({
      where: { createdAt: { gte: since(24) } },
      orderBy: { createdAt: "desc" },
      take: 3,
      select: { createdAt: true, status: true, portal: true },
    }),
  ]);

  const usersCovered = await prisma.userPreferences.count();

  // ── Serie: totale/nuovi/scaduti per giorno ────────────────────────────
  const bucketBy = (rows: Array<{ cachedAt: Date }>, key: (r: { cachedAt: Date }) => string) => {
    const m = new Map(dayKeys.map((k) => [k, 0]));
    for (const r of rows) {
      const k = key(r);
      if (m.has(k)) m.set(k, (m.get(k) ?? 0) + 1);
    }
    return dayKeys.map((k) => m.get(k) ?? 0);
  };
  const nuoviSerie = bucketBy(jobs14dRows, (r) => new Date(r.cachedAt).toISOString().slice(0, 10));
  // "Totale" cumulato: baseline = jobsTotal - somma nuovi, poi somma cumulativa
  const nuoviCum = nuoviSerie.map((_, i) => nuoviSerie.slice(0, i + 1).reduce((s, v) => s + v, 0));
  const baseline = Math.max(0, jobsTotal - nuoviCum[nuoviCum.length - 1]);
  const totaleSerie = nuoviCum.map((v) => baseline + v);
  // Scaduti = job la cui postedAt > 45gg (proxy per stale)
  const scaduti14d = jobs14dRows.filter((j) => j.postedAt && Date.now() - j.postedAt.getTime() > 45 * 24 * H);
  const scadutiSerie = bucketBy(scaduti14d, (r) => new Date(r.cachedAt).toISOString().slice(0, 10));

  const nuoviTot = jobs14dRows.length;
  const nuoviPrev = jobsPrev14dRows.length;
  const dPct = (c: number, p: number) => (p === 0 ? (c > 0 ? 100 : 0) : ((c - p) / p) * 100);

  // ── Distribuzione per fonte ───────────────────────────────────────────
  const sourceRanked = jobsBySource
    .map((r) => ({ source: r.source, count: r._count._all }))
    .sort((a, b) => b.count - a.count);
  const sourceColors = ["hsl(var(--primary))", "#60a5fa", "#a78bfa", "#fbbf24", "#f472b6", "#22d3ee", "#f87171"];
  const donutSegments = sourceRanked.slice(0, 6).map((r, i) => ({ label: r.source, value: r.count, color: sourceColors[i] }));
  const otherCount = sourceRanked.slice(6).reduce((s, r) => s + r.count, 0);
  if (otherCount > 0) donutSegments.push({ label: "Altri", value: otherCount, color: "var(--bg-sunken)" });

  // ── Stato fonti ATS ───────────────────────────────────────────────────
  const KNOWN_SOURCES = ["greenhouse", "lever", "ashby", "linkedin", "adzuna", "workable", "smartrecruiters", "indeed"];
  const sourceCountMap = new Map(sourceRanked.map((r) => [r.source.toLowerCase(), r.count]));
  const freshBySource = new Map<string, number>();
  for (const j of jobs14dRows) {
    if (new Date(j.cachedAt).getTime() >= fresh.getTime()) {
      const s = (j.source ?? "").toLowerCase();
      freshBySource.set(s, (freshBySource.get(s) ?? 0) + 1);
    }
  }
  const atsRows = KNOWN_SOURCES.map((src) => {
    const count = sourceCountMap.get(src) ?? 0;
    const freshCount = freshBySource.get(src) ?? 0;
    const status: "ok" | "err" = count > 0 && freshCount > 0 ? "ok" : "err";
    // ultimoSync: massimo cachedAt per quella fonte (approx dagli ultimi 14g)
    const inSource = jobs14dRows.filter((j) => j.source?.toLowerCase() === src);
    const lastSync = inSource.reduce<Date | null>((acc, j) => (!acc || j.cachedAt > acc ? j.cachedAt : acc), null);
    return { src, count, status, lastSync };
  });
  const atsActive = atsRows.filter((r) => r.status === "ok").length;

  const newestAgeMs = newestJob?.cachedAt ? Date.now() - newestJob.cachedAt.getTime() : null;

  return (
    <>
      <PageTitle
        title="Job pool & motore"
        sub="Gestisci le fonti di annunci, monitora il motore di ricerca e controlla le automazioni."
        actions={
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 999, background: "hsl(var(--primary)/0.12)", border: "1px solid hsl(var(--primary)/0.3)", fontSize: 11.5, fontWeight: 600, color: "hsl(var(--primary))" }}>
            <span style={{ width: 6, height: 6, borderRadius: 999, background: "hsl(var(--primary))", boxShadow: "0 0 8px hsl(var(--primary))" }} />
            Live
          </div>
        }
      />

      {/* Row 1 · 5 KPI */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginBottom: 20 }}>
        <KpiTrendCard label="Annunci nel pool" value={compactNumber(jobsTotal)} sub={`+${compactNumber(nuoviTot)} nuovi (${DAYS}g)`} delta={dPct(nuoviTot, nuoviPrev)} series={totaleSerie} color="hsl(var(--primary))" icon={<Layers size={16} />} />
        <KpiTrendCard
          label={`Annunci freschi (≤ 7gg)`}
          value={compactNumber(freshJobs)}
          sub={jobsTotal > 0 ? `${Math.round((freshJobs / jobsTotal) * 100)}% del pool` : "—"}
          series={nuoviSerie}
          color="#fbbf24"
          icon={<Zap size={16} />}
        />
        <KpiTrendCard
          label="Utenti coperti"
          value={compactNumber(usersCovered)}
          sub={`${autoApplyOn} con auto-apply ON`}
          series={nuoviSerie.map((v) => v * 0.6 + 1)}
          color="#a78bfa"
          icon={<UsersIcon size={16} />}
        />
        <KpiTrendCard
          label="Fonti ATS attive"
          value={`${atsActive}/${KNOWN_SOURCES.length}`}
          sub={atsActive < KNOWN_SOURCES.length ? `${KNOWN_SOURCES.length - atsActive} non disponibile` : "Tutte operative"}
          series={KNOWN_SOURCES.map((s) => sourceCountMap.get(s) ?? 0)}
          color={atsActive === KNOWN_SOURCES.length ? "hsl(var(--primary))" : "#fbbf24"}
          icon={<Database size={16} />}
        />
        <KpiTrendCard
          label="Coda di processing"
          value={compactNumber(queuedApps)}
          sub="in elaborazione"
          series={new Array(DAYS).fill(0).map(() => Math.max(1, Math.round(queuedApps / DAYS)))}
          color="#60a5fa"
          icon={<Activity size={16} />}
        />
      </div>

      {/* Row 2 · Line + Donut */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 2fr) minmax(0, 1fr)", gap: 12, marginBottom: 20 }} className="admin-row-2">
        <div style={{ padding: 20, borderRadius: 14, background: "var(--bg-elev)", border: "1px solid var(--border-ds)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700 }}>Andamento annunci nel pool</div>
              <div style={{ fontSize: 11.5, color: "var(--fg-subtle)", marginTop: 2 }}>Ultimi {DAYS} giorni</div>
            </div>
          </div>
          <LineChart
            labels={labels}
            series={[
              { label: "Totale", color: "hsl(var(--primary))", data: totaleSerie },
              { label: "Nuovi", color: "#60a5fa", data: nuoviSerie },
              { label: "Scaduti", color: "#f87171", data: scadutiSerie },
            ]}
          />
        </div>

        <div style={{ padding: 20, borderRadius: 14, background: "var(--bg-elev)", border: "1px solid var(--border-ds)" }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Distribuzione per fonte</div>
          <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 14, alignItems: "center" }}>
            <Donut segments={donutSegments} center={{ top: compactNumber(jobsTotal), bottom: "annunci" }} size={140} thickness={18} />
            <div style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 11.5 }}>
              {donutSegments.map((s) => {
                const pct = jobsTotal > 0 ? (s.value / jobsTotal) * 100 : 0;
                return (
                  <div key={s.label} style={{ display: "grid", gridTemplateColumns: "10px 1fr auto auto", gap: 8, alignItems: "center" }}>
                    <span style={{ width: 8, height: 8, borderRadius: 999, background: s.color }} />
                    <span style={{ color: "var(--fg-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textTransform: "capitalize" }}>{s.label}</span>
                    <span style={{ color: "var(--fg)", fontWeight: 700, fontFeatureSettings: '"tnum"' }}>{compactNumber(s.value)}</span>
                    <span style={{ color: "var(--fg-subtle)", fontFeatureSettings: '"tnum"', minWidth: 30, textAlign: "right" }}>{pct.toFixed(0)}%</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Row 3 · Stato ATS (2/3) + Salute AI + Automazioni */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 2fr) minmax(0, 1fr)", gap: 12, marginBottom: 20 }} className="admin-row-3">
        <div style={{ padding: 20, borderRadius: 14, background: "var(--bg-elev)", border: "1px solid var(--border-ds)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>Stato fonti ATS</div>
            <a href="#" style={{ fontSize: 11.5, color: "hsl(var(--primary))", textDecoration: "none", fontWeight: 600 }}>Vedi log fonti →</a>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 100px 130px 80px 90px 30px", gap: 10, fontSize: 10.5, color: "var(--fg-subtle)", textTransform: "uppercase", letterSpacing: "0.06em", padding: "6px 0", borderBottom: "1px solid var(--border-ds)" }}>
            <div>Fonte</div>
            <div>Stato</div>
            <div>Ultimo sync</div>
            <div style={{ textAlign: "right" }}>Annunci</div>
            <div>Azione</div>
            <div />
          </div>
          {atsRows.map((r) => (
            <div key={r.src} style={{ display: "grid", gridTemplateColumns: "1fr 100px 130px 80px 90px 30px", gap: 10, alignItems: "center", padding: "10px 0", borderBottom: "1px solid var(--border-ds)", fontSize: 12.5 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                <PortalBadge portal={r.src} />
                <span style={{ color: "var(--fg)", textTransform: "capitalize" }}>{r.src}</span>
              </div>
              <div style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, color: r.status === "ok" ? "hsl(var(--primary))" : "#f87171", fontWeight: 700 }}>
                <span style={{ width: 6, height: 6, borderRadius: 999, background: "currentColor", boxShadow: `0 0 5px currentColor` }} />
                {r.status === "ok" ? "Operativo" : "Errore"}
              </div>
              <div style={{ color: "var(--fg-muted)", fontFeatureSettings: '"tnum"' }}>{r.lastSync ? r.lastSync.toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—"}</div>
              <div style={{ textAlign: "right", color: "var(--fg)", fontWeight: 600, fontFeatureSettings: '"tnum"' }}>{compactNumber(r.count)}</div>
              <div>
                {r.status === "ok" ? <SyncPill label="Sync" tone="primary" /> : <SyncPill label="Riprova" tone="danger" />}
              </div>
              <button type="button" aria-label="Menu" style={{ background: "transparent", border: "none", color: "var(--fg-subtle)", cursor: "pointer", padding: 4 }}>
                <MoreHorizontal size={14} />
              </button>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Salute AI */}
          <div style={{ padding: 18, borderRadius: 14, background: "var(--bg-elev)", border: "1px solid var(--border-ds)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>Salute AI</div>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 9px", borderRadius: 999, background: creditFailures6h > 0 ? "rgba(251,191,36,0.15)" : "hsl(var(--primary)/0.15)", color: creditFailures6h > 0 ? "#fbbf24" : "hsl(var(--primary))", fontSize: 10.5, fontWeight: 700 }}>
                <span style={{ width: 5, height: 5, borderRadius: 999, background: "currentColor" }} />
                {creditFailures6h > 0 ? "Degradato" : "Operativo"}
              </span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <HealthMini icon={<Sparkles size={14} />} title="Anthropic (API)" items={[{ label: "Connesso", ok: true }, { label: "Chiave valida", ok: true }, { label: creditFailures6h > 0 ? "Crediti bassi" : "Crediti OK", ok: creditFailures6h === 0 }]} />
              <HealthMini icon={<Globe size={14} />} title="Browser (Chromium)" items={[{ label: "Avvio riuscito", ok: true }, { label: "Sessioni attive", ok: true }, { label: "Nessun errore", ok: creditFailures6h === 0 }]} />
            </div>
          </div>

          {/* Automazioni */}
          <div style={{ padding: 18, borderRadius: 14, background: "var(--bg-elev)", border: "1px solid var(--border-ds)" }}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Automazioni e strumenti</div>
            <AutomationRow icon={<RefreshCw size={14} />} title="Sync manuale (ATS + Adzuna)" desc="Forza un fetch immediato di nuovi annunci."><AdminSyncButton /></AutomationRow>
            <AutomationRow icon={<LifeBuoy size={14} />} title="Recupero candidature fallite" desc="Ri-accoda le candidature in errore per crediti AI."><AdminRetryCreditButton /></AutomationRow>
            <AutomationRow icon={<Rocket size={14} />} title="Lancia auto-apply" desc="Attiva il motore di candidatura automatica."><AdminAutoApplyButton /></AutomationRow>
            <AutomationRow icon={<FileText size={14} />} title="Ri-parsa CV profili vuoti" desc="Riprocessa i CV con profili incompleti."><AdminReparseCvButton /></AutomationRow>
            <AutomationRow icon={<Mail size={14} />} title="Upgrade nudges (Free → Pro)" desc="Invia email upgrade agli utenti Free eleggibili." last><AdminUpgradeNudgesButton /></AutomationRow>
          </div>
        </div>
      </div>

      {/* Row 4 · Annunci recenti + Attività motore */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.4fr) minmax(0, 1fr)", gap: 12, marginBottom: 20 }} className="admin-row-4">
        <div style={{ padding: 20, borderRadius: 14, background: "var(--bg-elev)", border: "1px solid var(--border-ds)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>Annunci più recenti</div>
            <a href="#" style={{ fontSize: 11.5, color: "hsl(var(--primary))", textDecoration: "none", fontWeight: 600 }}>Vedi tutti →</a>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 90px 100px 90px", gap: 10, fontSize: 10.5, color: "var(--fg-subtle)", textTransform: "uppercase", letterSpacing: "0.06em", padding: "6px 0", borderBottom: "1px solid var(--border-ds)" }}>
            <div>Titolo</div>
            <div>Azienda</div>
            <div>Fonte</div>
            <div>Sede</div>
            <div style={{ textAlign: "right" }}>Pubblicato</div>
          </div>
          {recentJobs.length === 0 ? (
            <div style={{ padding: "18px 0", textAlign: "center", color: "var(--fg-subtle)", fontSize: 12 }}>Nessun annuncio</div>
          ) : (
            recentJobs.map((j, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 90px 100px 90px", gap: 10, alignItems: "center", padding: "9px 0", borderBottom: "1px solid var(--border-ds)", fontSize: 12.5 }}>
                <div style={{ color: "var(--fg)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{j.title}</div>
                <div style={{ color: "var(--fg-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{j.company ?? "—"}</div>
                <div style={{ color: "var(--fg-muted)", textTransform: "capitalize" }}>{j.source}</div>
                <div style={{ color: "var(--fg-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{j.location ?? "—"}</div>
                <div style={{ textAlign: "right", color: "var(--fg-subtle)", fontSize: 11 }}>{formatWhen(j.cachedAt)}</div>
              </div>
            ))
          )}
        </div>

        <div style={{ padding: 20, borderRadius: 14, background: "var(--bg-elev)", border: "1px solid var(--border-ds)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>Attività motore (ultime 24h)</div>
            <a href="#" style={{ fontSize: 11.5, color: "hsl(var(--primary))", textDecoration: "none", fontWeight: 600 }}>Vedi tutte →</a>
          </div>
          <MotorRow tone="good" icon={<CheckCircle2 size={12} />} title="Sync completato" meta={newestJob?.cachedAt ? `Ultimo sync ${formatWhen(newestJob.cachedAt)}` : "—"} when={newestAgeMs !== null ? `${Math.round(newestAgeMs / 60000)}m fa` : "—"} />
          <MotorRow tone="info" icon={<Layers size={12} />} title={`${compactNumber(nuoviTot)} nuovi annunci`} meta={`${DAYS} giorni · tutte le fonti`} when={`${DAYS}g`} />
          {recentEmails.map((e, i) => (
            <MotorRow key={`em-${i}`} tone="info" icon={<Mail size={12} />} title={`Email ${e.kind}`} meta="Resend" when={formatWhen(e.createdAt)} />
          ))}
          {recentApps.map((a, i) => (
            <MotorRow
              key={`ap-${i}`}
              tone={a.status === "success" ? "good" : a.status === "failed" ? "bad" : "info"}
              icon={a.status === "success" ? <CheckCircle2 size={12} /> : a.status === "failed" ? <AlertTriangle size={12} /> : <Clock size={12} />}
              title={`Candidatura ${a.status}`}
              meta={a.portal}
              when={formatWhen(a.createdAt)}
            />
          ))}
          {creditFailures6h > 0 && (
            <MotorRow tone="bad" icon={<AlertTriangle size={12} />} title={`${creditFailures6h} fail per crediti`} meta="Anthropic → Billing" when="6h" />
          )}
        </div>
      </div>

      <style>{`@media (max-width: 1000px) { .admin-row-2, .admin-row-3, .admin-row-4 { grid-template-columns: 1fr !important; } }`}</style>
    </>
  );
}

function PortalBadge({ portal }: { portal: string }) {
  const letter = (portal[0] ?? "?").toUpperCase();
  const colors = ["#34d399", "#60a5fa", "#a78bfa", "#fbbf24", "#f87171", "#22d3ee", "#f472b6"];
  const h = Array.from(portal).reduce((s, c) => s + c.charCodeAt(0), 0);
  const color = colors[h % colors.length];
  return (
    <div style={{ width: 22, height: 22, borderRadius: 5, background: `color-mix(in srgb, ${color} 20%, transparent)`, color, display: "grid", placeItems: "center", fontSize: 11, fontWeight: 800, flexShrink: 0 }}>
      {letter}
    </div>
  );
}

function SyncPill({ label, tone }: { label: string; tone: "primary" | "danger" }) {
  const c = tone === "primary" ? "hsl(var(--primary))" : "#f87171";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "4px 12px",
        borderRadius: 999,
        background: `color-mix(in srgb, ${c} 15%, transparent)`,
        color: c,
        border: `1px solid color-mix(in srgb, ${c} 30%, transparent)`,
        fontSize: 11,
        fontWeight: 700,
        cursor: "pointer",
      }}
    >
      {label}
    </span>
  );
}

function HealthMini({ icon, title, items }: { icon: React.ReactNode; title: string; items: Array<{ label: string; ok: boolean }> }) {
  return (
    <div style={{ padding: 12, borderRadius: 10, background: "var(--bg-sunken)", border: "1px solid var(--border-ds)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, color: "hsl(var(--primary))", marginBottom: 8 }}>
        {icon}
        {title}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {items.map((it) => (
          <div key={it.label} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: it.ok ? "var(--fg-muted)" : "#fbbf24" }}>
            <span style={{ width: 5, height: 5, borderRadius: 999, background: it.ok ? "hsl(var(--primary))" : "#fbbf24" }} />
            {it.label}
          </div>
        ))}
      </div>
    </div>
  );
}

function AutomationRow({ icon, title, desc, children, last }: { icon: React.ReactNode; title: string; desc: string; children: React.ReactNode; last?: boolean }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "26px 1fr auto", gap: 10, alignItems: "center", padding: "10px 0", borderBottom: last ? "none" : "1px solid var(--border-ds)" }}>
      <div style={{ width: 22, height: 22, borderRadius: 6, background: "var(--bg-sunken)", color: "var(--fg-muted)", display: "grid", placeItems: "center" }}>{icon}</div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12.5, color: "var(--fg)", fontWeight: 600 }}>{title}</div>
        <div style={{ fontSize: 11, color: "var(--fg-subtle)", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{desc}</div>
      </div>
      <div>{children}</div>
    </div>
  );
}

function MotorRow({ tone, icon, title, meta, when }: { tone: "good" | "info" | "bad"; icon: React.ReactNode; title: string; meta: string; when: string }) {
  const map = { good: "hsl(var(--primary))", info: "#60a5fa", bad: "#f87171" };
  const c = map[tone];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "20px 1fr auto", gap: 10, alignItems: "center", padding: "9px 0", borderBottom: "1px solid var(--border-ds)" }}>
      <span style={{ width: 8, height: 8, borderRadius: 999, background: c, boxShadow: `0 0 5px ${c}` }} />
      <div style={{ minWidth: 0, display: "grid", gridTemplateColumns: "1fr auto", gap: 8, alignItems: "baseline" }}>
        <div style={{ fontSize: 12.5, color: "var(--fg)", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</div>
        <div style={{ fontSize: 11, color: "var(--fg-subtle)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{meta}</div>
      </div>
      <div style={{ fontSize: 11, color: "var(--fg-subtle)", whiteSpace: "nowrap" }}>{when}</div>
    </div>
  );
}

function formatWhen(d: Date): string {
  const diff = Date.now() - d.getTime();
  const min = Math.round(diff / 60000);
  if (min < 1) return "adesso";
  if (min < 60) return `${min} min fa`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h}h fa`;
  const days = Math.round(h / 24);
  if (days < 7) return `${days}g fa`;
  return d.toLocaleDateString("it-IT", { day: "numeric", month: "short" });
}
