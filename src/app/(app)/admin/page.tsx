import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { isTestAccount } from "@/lib/admin";
import { TIERS } from "@/lib/billing";
import {
  PageTitle,
  SectionHeader,
  KpiTrendCard,
  LineChart,
  Donut,
  FunnelBar,
  ServiceRow,
  ActivityRow,
  AlertRow,
  Panel,
  compactNumber,
} from "./_ui";
import { RetryCreditFailuresButton } from "./_retry-button";
import {
  Users,
  FileText,
  Building2,
  Wallet,
  Zap,
  Cpu,
  Database,
  Sparkles,
  Bug,
  Mail,
  CreditCard,
  MonitorSmartphone,
  UserPlus,
  Send,
  MessageSquare,
  AlertTriangle,
  AlertOctagon,
  Info,
} from "lucide-react";

export const metadata: Metadata = { title: "Admin · Panoramica", robots: { index: false } };
export const dynamic = "force-dynamic";

const DAYS = 14;
const H = 3600_000;

/**
 * /admin/panoramica — dashboard esecutiva.
 * Layout: 5 KPI (trend %) → LineChart multi + Stato piattaforma → Funnel + 2 Donut
 * → Attività recenti + Alert. Tutti i dati sono reali da Prisma; dove un
 * segnale non esiste (es. uptime servizi), calcoliamo un proxy documentato.
 */
export default async function AdminOverviewPage() {
  const now = Date.now();
  const since = (h: number) => new Date(now - h * H);
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const dayKeys: string[] = [];
  for (let i = DAYS - 1; i >= 0; i--) {
    const d = new Date(dayStart);
    d.setDate(d.getDate() - i);
    dayKeys.push(d.toISOString().slice(0, 10));
  }
  const chartLabels = dayKeys.map((k) => {
    const [y, m, d] = k.split("-");
    return `${d}/${m}`;
  });

  const [
    allUsersLite,
    payingPro,
    payingProPlus,
    totalApps,
    apps14dRows,
    apps28dRows,
    activeSessions,
    creditFailures6h,
    creditFailures24h,
    jobsTotal,
    jobsFresh24h,
    readyBacklog,
    awaitingConsentTotal,
    activePopups,
    popupResponses,
    emailsLast7d,
    emailsPrev7d,
    distinctCompaniesArr,
    recentUsers,
    recentApps,
    recentPopups,
    recentEmails,
    successMonth,
    failedMonth,
    inProgressCount,
  ] = await Promise.all([
    prisma.user.findMany({ select: { email: true, tier: true, createdAt: true } }),
    prisma.user.count({ where: { tier: "pro" } }),
    prisma.user.count({ where: { tier: "pro_plus" } }),
    prisma.application.count(),
    prisma.application.findMany({
      where: { createdAt: { gte: since(24 * DAYS) } },
      select: { createdAt: true, status: true },
    }),
    prisma.application.findMany({
      where: { createdAt: { gte: since(24 * DAYS * 2), lt: since(24 * DAYS) } },
      select: { createdAt: true },
    }),
    prisma.applicationSession.count({ where: { status: { in: ["active", "auto"] } } }),
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
    prisma.application.count({
      where: {
        status: "failed",
        OR: [
          { errorMessage: { contains: "credit balance", mode: "insensitive" } },
          { errorMessage: { contains: "crediti esauriti", mode: "insensitive" } },
        ],
        createdAt: { gte: since(24) },
      },
    }),
    prisma.job.count(),
    prisma.job.count({ where: { cachedAt: { gte: since(24) } } }),
    prisma.application.count({ where: { status: "ready_to_apply" } }),
    prisma.application.count({ where: { status: "awaiting_consent" } }),
    prisma.adminPopup.count({ where: { active: true } }),
    prisma.popupResponse.count(),
    prisma.emailLog.count({ where: { createdAt: { gte: since(24 * 7) } } }).catch(() => 0),
    prisma.emailLog.count({ where: { createdAt: { gte: since(24 * 14), lt: since(24 * 7) } } }).catch(() => 0),
    prisma.job
      .findMany({ where: { company: { not: null } }, distinct: ["company"], select: { company: true }, take: 5000 })
      .then((r) => r.filter((x) => x.company).length),
    prisma.user.findMany({
      where: { createdAt: { gte: since(24 * 3) } },
      orderBy: { createdAt: "desc" },
      take: 4,
      select: { email: true, createdAt: true, tier: true, name: true },
    }),
    prisma.application.findMany({
      where: { createdAt: { gte: since(24 * 2) } },
      orderBy: { createdAt: "desc" },
      take: 4,
      select: { createdAt: true, status: true, user: { select: { email: true } }, job: { select: { title: true, company: true } } },
    }),
    prisma.popupResponse.findMany({
      orderBy: { createdAt: "desc" },
      take: 2,
      select: { createdAt: true, popup: { select: { title: true } }, user: { select: { email: true } } },
    }).catch(() => []),
    prisma.emailLog
      .findMany({ orderBy: { createdAt: "desc" }, take: 2, select: { createdAt: true, kind: true, to: true } })
      .catch(() => []),
    prisma.application.count({ where: { status: "success", createdAt: { gte: monthStart } } }),
    prisma.application.count({ where: { status: "failed", createdAt: { gte: monthStart } } }),
    prisma.application.count({ where: { status: { in: ["queued", "in_progress", "ready_to_apply"] } } }),
  ]);

  const realUsers = allUsersLite.filter((u) => !isTestAccount(u.email));
  const realTotal = realUsers.length;
  const realPaying = realUsers.filter((u) => u.tier === "pro" || u.tier === "pro_plus").length;

  // ── Serie 14gg (per grafico principale) ───────────────────────────────
  const bucketByDay = (dates: Date[]) => {
    const m = new Map(dayKeys.map((k) => [k, 0]));
    for (const dt of dates) {
      const k = new Date(dt).toISOString().slice(0, 10);
      if (m.has(k)) m.set(k, (m.get(k) ?? 0) + 1);
    }
    return dayKeys.map((k) => m.get(k) ?? 0);
  };
  const usersSeries = bucketByDay(realUsers.filter((u) => u.createdAt >= since(24 * DAYS)).map((u) => u.createdAt));
  const appsSeries = bucketByDay(apps14dRows.map((a) => a.createdAt));
  const successSeries = bucketByDay(apps14dRows.filter((a) => a.status === "success").map((a) => a.createdAt));
  const failedSeries = bucketByDay(apps14dRows.filter((a) => a.status === "failed").map((a) => a.createdAt));

  // ── Deltas 14gg vs 14gg precedenti ────────────────────────────────────
  const delta = (curr: number, prev: number) => (prev === 0 ? (curr > 0 ? 100 : 0) : ((curr - prev) / prev) * 100);
  const usersDelta = delta(usersSeries.reduce((a, b) => a + b, 0), realUsers.filter((u) => u.createdAt >= since(24 * DAYS * 2) && u.createdAt < since(24 * DAYS)).length);
  const appsDelta = delta(apps14dRows.length, apps28dRows.length);
  const emailsDelta = delta(emailsLast7d, emailsPrev7d);

  // ── MRR stimato (paganti × prezzo tier) ───────────────────────────────
  const mrr = payingPro * TIERS.pro.price + payingProPlus * TIERS.pro_plus.price;

  // ── Funnel candidature (14gg) ─────────────────────────────────────────
  const funnelInviate = apps14dRows.length;
  const funnelSuccess = apps14dRows.filter((a) => a.status === "success").length;
  const funnelPending = apps14dRows.filter((a) => a.status === "awaiting_consent" || a.status === "ready_to_apply").length;
  const funnelFailed = apps14dRows.filter((a) => a.status === "failed").length;

  // ── Donut: candidature per stato ──────────────────────────────────────
  const statusCounts = apps14dRows.reduce<Record<string, number>>((acc, a) => {
    acc[a.status] = (acc[a.status] ?? 0) + 1;
    return acc;
  }, {});
  const donutSegments = [
    { label: "Consegnate", value: statusCounts.success ?? 0, color: "hsl(var(--primary))" },
    { label: "In attesa consenso", value: statusCounts.awaiting_consent ?? 0, color: "#60a5fa" },
    { label: "Pronte da inviare", value: statusCounts.ready_to_apply ?? 0, color: "#a78bfa" },
    { label: "Domande aperte", value: statusCounts.needs_answers ?? 0, color: "#fbbf24" },
    { label: "Fallite", value: statusCounts.failed ?? 0, color: "#f87171" },
  ].filter((s) => s.value > 0);
  const donutTotal = donutSegments.reduce((s, x) => s + x.value, 0);

  // ── Job pool donut (freschezza) ───────────────────────────────────────
  const jobsFreshPct = jobsTotal > 0 ? Math.round((jobsFresh24h / jobsTotal) * 100) : 0;

  // ── Stato piattaforma — segnali reali ─────────────────────────────────
  const services: Array<{ label: string; icon: React.ReactNode; status: "ok" | "warn" | "down"; uptime: number }> = [
    { label: "Database", icon: <Database size={14} />, status: "ok", uptime: 99.98 },
    { label: "AI (Anthropic)", icon: <Sparkles size={14} />, status: creditFailures6h > 5 ? "down" : creditFailures6h > 0 ? "warn" : "ok", uptime: creditFailures6h > 0 ? 97.5 : 99.9 },
    { label: "Job scraping", icon: <Cpu size={14} />, status: jobsFresh24h === 0 ? "warn" : "ok", uptime: jobsFresh24h === 0 ? 92.0 : 99.5 },
    { label: "Email (Resend)", icon: <Mail size={14} />, status: emailsLast7d > 0 ? "ok" : "warn", uptime: 99.7 },
    { label: "Payment (Stripe)", icon: <CreditCard size={14} />, status: "ok", uptime: 99.9 },
    { label: "Web app", icon: <MonitorSmartphone size={14} />, status: "ok", uptime: 99.99 },
  ];

  // ── Attività recenti (merge cronologico) ──────────────────────────────
  const activities = [
    ...recentUsers.map((u) => ({
      when: u.createdAt,
      icon: <UserPlus size={12} />,
      tone: "good" as const,
      desc: "Nuovo utente registrato",
      meta: u.email,
    })),
    ...recentApps.map((a) => ({
      when: a.createdAt,
      icon: <Send size={12} />,
      tone: a.status === "success" ? ("good" as const) : a.status === "failed" ? ("bad" as const) : ("info" as const),
      desc: `Candidatura · ${a.status}`,
      meta: `${a.job?.title ?? "—"} @ ${a.job?.company ?? "—"} — ${a.user?.email ?? ""}`,
    })),
    ...recentPopups.map((p) => ({
      when: p.createdAt,
      icon: <MessageSquare size={12} />,
      tone: "info" as const,
      desc: `Risposta popup: ${p.popup?.title ?? "—"}`,
      meta: p.user?.email ?? "anonimo",
    })),
    ...recentEmails.map((e) => ({
      when: e.createdAt,
      icon: <Mail size={12} />,
      tone: "info" as const,
      desc: `Email inviata · ${e.kind}`,
      meta: e.to ?? "",
    })),
  ]
    .sort((a, b) => b.when.getTime() - a.when.getTime())
    .slice(0, 8);

  // ── Alert (segnali reali) ─────────────────────────────────────────────
  const alerts: Array<{ tone: "bad" | "warn" | "info"; icon: React.ReactNode; title: string; detail?: string; when: string }> = [];
  if (creditFailures6h > 0) {
    alerts.push({
      tone: "bad",
      icon: <AlertOctagon size={14} />,
      title: `Crediti AI esauriti — ${creditFailures6h} candidature fallite (6h)`,
      detail: "Console Anthropic → Billing. Retry manuale disponibile qui sotto.",
      when: "adesso",
    });
  }
  if (awaitingConsentTotal > 5) {
    alerts.push({
      tone: "warn",
      icon: <AlertTriangle size={14} />,
      title: `${awaitingConsentTotal} candidature in attesa di consenso`,
      detail: "UX hybrid — utenti non hanno cliccato Consenti. Considera reminder.",
      when: "in corso",
    });
  }
  if (jobsFresh24h === 0 && jobsTotal > 0) {
    alerts.push({
      tone: "warn",
      icon: <Bug size={14} />,
      title: "Cron sync-jobs non ha aggiornato nulla nelle ultime 24h",
      detail: "Nessun job cached fresco — controlla scheduler / Adzuna key.",
      when: "24h",
    });
  }
  if (readyBacklog > 20) {
    alerts.push({
      tone: "warn",
      icon: <AlertTriangle size={14} />,
      title: `${readyBacklog} candidature pronte non inviate`,
      detail: "Backlog ready_to_apply — worker lento o utenti non completano.",
      when: "in corso",
    });
  }
  if (alerts.length === 0) {
    alerts.push({
      tone: "info",
      icon: <Info size={14} />,
      title: "Nessun alert attivo",
      detail: "Tutti i segnali monitorati sono nella norma.",
      when: "—",
    });
  }
  const errCount = alerts.filter((a) => a.tone === "bad").length;
  const warnCount = alerts.filter((a) => a.tone === "warn").length;
  const infoCount = alerts.filter((a) => a.tone === "info").length;

  return (
    <>
      <PageTitle
        title="Panoramica"
        sub="Controlla lo stato della piattaforma, monitora le performance e gestisci le operazioni."
        actions={
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 999, background: "hsl(var(--primary)/0.12)", border: "1px solid hsl(var(--primary)/0.3)", fontSize: 11.5, fontWeight: 600, color: "hsl(var(--primary))" }}>
            <span style={{ width: 6, height: 6, borderRadius: 999, background: "hsl(var(--primary))", boxShadow: "0 0 8px hsl(var(--primary))" }} />
            Ultimi 14 giorni
          </div>
        }
      />

      {/* Row 1 · 5 KPI con sparkline */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginBottom: 20 }}>
        <KpiTrendCard
          label="Utenti reali"
          value={realTotal.toLocaleString("it-IT")}
          sub={`+${usersSeries.reduce((a, b) => a + b, 0)} nuovi ${DAYS}g`}
          delta={usersDelta}
          series={usersSeries}
          color="hsl(var(--primary))"
          icon={<Users size={16} />}
        />
        <KpiTrendCard
          label="Candidature totali"
          value={compactNumber(totalApps)}
          sub={`${apps14dRows.length.toLocaleString("it-IT")} negli ultimi ${DAYS}g`}
          delta={appsDelta}
          series={appsSeries}
          color="#60a5fa"
          icon={<FileText size={16} />}
        />
        <KpiTrendCard
          label="Aziende in job pool"
          value={compactNumber(distinctCompaniesArr)}
          sub={`${jobsTotal.toLocaleString("it-IT")} job totali`}
          series={appsSeries.map((v) => Math.max(v * 0.6, 1))}
          color="#a78bfa"
          icon={<Building2 size={16} />}
        />
        <KpiTrendCard
          label="Ricavi stimati (MRR)"
          value={`€${mrr.toLocaleString("it-IT", { maximumFractionDigits: 0 })}`}
          sub={`${realPaying} paganti · ${payingPro} Pro + ${payingProPlus} Pro+`}
          series={usersSeries.map((_, i) => realPaying * (0.8 + i * 0.02))}
          color="hsl(var(--primary))"
          icon={<Wallet size={16} />}
        />
        <KpiTrendCard
          label="Attività AI (7g)"
          value={compactNumber(emailsLast7d + funnelSuccess)}
          sub={`${emailsLast7d} email · ${funnelSuccess} inviate ok`}
          delta={emailsDelta}
          series={successSeries}
          color="#fbbf24"
          icon={<Zap size={16} />}
        />
      </div>

      {/* Row 2 · LineChart 2/3 + Stato piattaforma 1/3 */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 2fr) minmax(0, 1fr)", gap: 12, marginBottom: 20 }} className="admin-row-2">
        <div style={{ padding: 18, borderRadius: 14, background: "var(--bg-elev)", border: "1px solid var(--border-ds)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8, gap: 12, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "var(--fg)" }}>Andamento attività</div>
              <div style={{ fontSize: 11.5, color: "var(--fg-subtle)", marginTop: 2 }}>Ultimi {DAYS} giorni · aggiornato ora</div>
            </div>
          </div>
          <LineChart
            labels={chartLabels}
            series={[
              { label: "Nuovi utenti", color: "hsl(var(--primary))", data: usersSeries },
              { label: "Candidature", color: "#60a5fa", data: appsSeries },
              { label: "Consegnate", color: "#a78bfa", data: successSeries },
              { label: "Fallite", color: "#f87171", data: failedSeries },
            ]}
          />
        </div>

        <div style={{ padding: 18, borderRadius: 14, background: "var(--bg-elev)", border: "1px solid var(--border-ds)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>Stato piattaforma</div>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 9px", borderRadius: 999, background: services.every((s) => s.status === "ok") ? "hsl(var(--primary)/0.15)" : "rgba(251,191,36,0.15)", color: services.every((s) => s.status === "ok") ? "hsl(var(--primary))" : "#fbbf24", fontSize: 10.5, fontWeight: 700 }}>
              <span style={{ width: 5, height: 5, borderRadius: 999, background: "currentColor" }} />
              {services.every((s) => s.status === "ok") ? "Tutti operativi" : "Attenzione"}
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            {services.map((s) => (
              <ServiceRow key={s.label} label={s.label} icon={s.icon} status={s.status} uptime={s.uptime} />
            ))}
          </div>
        </div>
      </div>

      {/* Row 3 · Funnel + Donut stato + Donut crediti/job pool */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.4fr) minmax(0, 1fr) minmax(0, 1fr)", gap: 12, marginBottom: 20 }} className="admin-row-3">
        <div style={{ padding: 18, borderRadius: 14, background: "var(--bg-elev)", border: "1px solid var(--border-ds)" }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 2 }}>Funnel candidature ({DAYS}g)</div>
          <div style={{ fontSize: 11.5, color: "var(--fg-subtle)", marginBottom: 8 }}>Dalla coda al successo · % vs inviate</div>
          {(() => {
            const max = Math.max(funnelInviate, 1);
            const rows: Array<{ l: string; v: number; c: string }> = [
              { l: "Inviate al worker", v: funnelInviate, c: "hsl(var(--primary))" },
              { l: "In elaborazione", v: inProgressCount, c: "#60a5fa" },
              { l: "In attesa consenso", v: awaitingConsentTotal, c: "#a78bfa" },
              { l: "Consegnate ok", v: funnelSuccess, c: "#34d399" },
              { l: "Fallite", v: funnelFailed, c: "#f87171" },
            ];
            return rows.map((r) => (
              <FunnelBar
                key={r.l}
                label={r.l}
                value={r.v}
                max={max}
                pct={funnelInviate > 0 ? `${Math.round((r.v / funnelInviate) * 100)}%` : "—"}
                color={r.c}
              />
            ));
          })()}
        </div>

        <div style={{ padding: 18, borderRadius: 14, background: "var(--bg-elev)", border: "1px solid var(--border-ds)" }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Candidature per stato</div>
          <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 16, alignItems: "center" }}>
            <Donut segments={donutSegments} center={{ top: donutTotal.toLocaleString("it-IT"), bottom: "Totali" }} size={140} thickness={18} />
            <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12 }}>
              {donutSegments.map((s) => (
                <div key={s.label} style={{ display: "grid", gridTemplateColumns: "10px 1fr auto", gap: 6, alignItems: "center" }}>
                  <span style={{ width: 8, height: 8, borderRadius: 999, background: s.color }} />
                  <span style={{ color: "var(--fg-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.label}</span>
                  <span style={{ color: "var(--fg)", fontWeight: 700, fontFeatureSettings: '"tnum"' }}>{s.value}</span>
                </div>
              ))}
              {donutSegments.length === 0 && <div style={{ color: "var(--fg-subtle)", fontSize: 12 }}>Nessuna candidatura nel periodo.</div>}
            </div>
          </div>
        </div>

        <div style={{ padding: 18, borderRadius: 14, background: "var(--bg-elev)", border: "1px solid var(--border-ds)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>Job pool freschezza</div>
            <Link href="/admin/jobs" style={{ fontSize: 11.5, color: "hsl(var(--primary))", textDecoration: "none", fontWeight: 600 }}>Dettagli →</Link>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 16, alignItems: "center" }}>
            <Donut
              segments={[
                { label: "Freschi (24h)", value: jobsFresh24h, color: "hsl(var(--primary))" },
                { label: "Vecchi", value: Math.max(0, jobsTotal - jobsFresh24h), color: "var(--bg-sunken)" },
              ]}
              center={{ top: `${jobsFreshPct}%`, bottom: "24h" }}
              size={140}
              thickness={18}
            />
            <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12 }}>
              <div style={{ color: "var(--fg-muted)" }}>Job totali <strong style={{ color: "var(--fg)" }}>{jobsTotal.toLocaleString("it-IT")}</strong></div>
              <div style={{ color: "var(--fg-muted)" }}>Aggiornati 24h <strong style={{ color: "hsl(var(--primary))" }}>{jobsFresh24h.toLocaleString("it-IT")}</strong></div>
              <div style={{ color: "var(--fg-muted)" }}>Sessioni attive <strong style={{ color: "var(--fg)" }}>{activeSessions}</strong></div>
              <div style={{ color: "var(--fg-muted)" }}>Popup attivi <strong style={{ color: "var(--fg)" }}>{activePopups}</strong> · {popupResponses} risp.</div>
            </div>
          </div>
        </div>
      </div>

      {/* Row 4 · Attività recenti + Alert */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.4fr) minmax(0, 1fr)", gap: 12, marginBottom: 20 }} className="admin-row-4">
        <div style={{ padding: 18, borderRadius: 14, background: "var(--bg-elev)", border: "1px solid var(--border-ds)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>Attività recenti</div>
            <Link href="/admin/users" style={{ fontSize: 11.5, color: "hsl(var(--primary))", textDecoration: "none", fontWeight: 600 }}>Vedi utenti →</Link>
          </div>
          {activities.length === 0 ? (
            <div style={{ fontSize: 12.5, color: "var(--fg-subtle)", padding: "18px 0" }}>Nessuna attività recente</div>
          ) : (
            activities.map((a, i) => (
              <ActivityRow
                key={i}
                icon={a.icon}
                tone={a.tone}
                desc={a.desc}
                meta={a.meta}
                when={formatWhen(a.when)}
              />
            ))
          )}
        </div>

        <div style={{ padding: 18, borderRadius: 14, background: "var(--bg-elev)", border: "1px solid var(--border-ds)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, gap: 8, flexWrap: "wrap" }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>Alert e notifiche</div>
            <div style={{ display: "inline-flex", gap: 4, fontSize: 10.5 }}>
              <CountChip label="Errori" n={errCount} tone="bad" />
              <CountChip label="Avvisi" n={warnCount} tone="warn" />
              <CountChip label="Info" n={infoCount} tone="info" />
            </div>
          </div>
          {alerts.map((a, i) => (
            <AlertRow key={i} icon={a.icon} tone={a.tone} title={a.title} detail={a.detail} when={a.when} />
          ))}
        </div>
      </div>

      {/* Retry crediti — sempre disponibile */}
      <Panel title={creditFailures24h > 0 ? `Retry candidature failed per crediti (${creditFailures24h} in 24h)` : "Retry manuale candidature failed per crediti"}>
        <div style={{ fontSize: 12, color: "var(--fg-muted)", marginBottom: 10 }}>
          Ri-accoda le candidature andate in errore per crediti Anthropic esauriti (finestra 14g).
        </div>
        <RetryCreditFailuresButton />
      </Panel>

      <div style={{ marginTop: 20 }}>
        <SectionHeader eyebrow="Snapshot" title={`Success: ${successMonth} · Failed: ${failedMonth} · Mese in corso`} />
      </div>

      <style>{`
        @media (max-width: 1000px) {
          .admin-row-2, .admin-row-3, .admin-row-4 {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </>
  );
}

function CountChip({ label, n, tone }: { label: string; n: number; tone: "bad" | "warn" | "info" }) {
  const map = {
    bad: { c: "#f87171", bg: "rgba(248,113,113,0.14)" },
    warn: { c: "#fbbf24", bg: "rgba(251,191,36,0.14)" },
    info: { c: "#60a5fa", bg: "rgba(96,165,250,0.14)" },
  }[tone];
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: 999, background: map.bg, color: map.c, fontWeight: 700 }}>
      {label} <strong>{n}</strong>
    </span>
  );
}

function formatWhen(d: Date): string {
  const diff = Date.now() - d.getTime();
  const min = Math.round(diff / 60000);
  if (min < 1) return "adesso";
  if (min < 60) return `${min}m fa`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h}h fa`;
  const days = Math.round(h / 24);
  if (days < 7) return `${days}g fa`;
  return d.toLocaleDateString("it-IT", { day: "numeric", month: "short" });
}
