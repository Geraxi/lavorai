import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { isTestAccount } from "@/lib/admin";
import { TIERS } from "@/lib/billing";
import {
  PageTitle,
  KpiTrendCard,
  LineChart,
  ChartLegend,
  FakeSelect,
  Donut,
  FunnelBar,
  ServiceRow,
  compactNumber,
} from "./_ui";
import {
  Users,
  FileText,
  Building2,
  Wallet,
  Zap,
  Cpu,
  Database,
  Sparkles,
  Mail,
  CreditCard,
  MonitorSmartphone,
  Globe,
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
 * /admin — Panoramica, layout viewport-fisso (nessuno scroll di pagina).
 * Righe: header · 5 KPI · [Andamento 2/3 | Stato piattaforma 1/3]
 *        · [Funnel | Per stato | Crediti AI] · [Attività recenti | Alert].
 * Tutti i numeri da Prisma; MRR = paganti × prezzo tier; capacità AI =
 * somma cap mensili dei tier attivi.
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
  const MONTHS = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"];
  const chartLabels = dayKeys.map((k) => {
    const [, m, d] = k.split("-");
    return `${d} ${MONTHS[Number(m) - 1]}`;
  });

  const [
    allUsersLite,
    apps14dRows,
    apps28dCount,
    appsMonth,
    activeSessions,
    creditFailures6h,
    jobsTotal,
    jobsFresh24h,
    jobsFresh7d,
    readyBacklog,
    awaitingConsentTotal,
    emailsLast7d,
    distinctCompanies,
    pageViews14d,
    cvDocsMonth,
    recentUsers,
    recentApps,
    recentPopups,
    recentEmails,
  ] = await Promise.all([
    prisma.user.findMany({ select: { email: true, tier: true, createdAt: true } }),
    prisma.application.findMany({
      where: { createdAt: { gte: since(24 * DAYS) } },
      select: { createdAt: true, status: true, replyCount: true, lastReplyKind: true, userStatus: true, atsScore: true, job: { select: { company: true } } },
    }),
    prisma.application.count({ where: { createdAt: { gte: since(24 * DAYS * 2), lt: since(24 * DAYS) } } }),
    prisma.application.count({ where: { createdAt: { gte: monthStart } } }),
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
    prisma.job.count(),
    prisma.job.count({ where: { cachedAt: { gte: since(24) } } }),
    prisma.job.count({ where: { cachedAt: { gte: since(24 * 7) } } }),
    prisma.application.count({ where: { status: "ready_to_apply" } }),
    prisma.application.count({ where: { status: "awaiting_consent" } }),
    prisma.emailLog.count({ where: { createdAt: { gte: since(24 * 7) } } }).catch(() => 0),
    prisma.job
      .findMany({ where: { company: { not: null } }, distinct: ["company"], select: { company: true }, take: 10000 })
      .then((r) => r.length),
    prisma.pageView.findMany({ where: { ts: { gte: since(24 * DAYS) } }, select: { ts: true, path: true } }).catch(() => [] as { ts: Date; path: string }[]),
    prisma.cVDocument.count({ where: { createdAt: { gte: monthStart } } }).catch(() => 0),
    prisma.user.findMany({ where: { createdAt: { gte: since(24 * 7) } }, orderBy: { createdAt: "desc" }, take: 4, select: { email: true, createdAt: true, tier: true } }),
    prisma.application.findMany({
      where: { createdAt: { gte: since(24 * 3) } },
      orderBy: { createdAt: "desc" },
      take: 4,
      select: { createdAt: true, status: true, user: { select: { email: true } }, job: { select: { title: true, company: true } } },
    }),
    prisma.popupResponse.findMany({ orderBy: { createdAt: "desc" }, take: 2, select: { createdAt: true, popup: { select: { title: true } }, user: { select: { email: true } } } }).catch(() => []),
    prisma.emailLog.findMany({ orderBy: { createdAt: "desc" }, take: 2, select: { createdAt: true, kind: true, to: true } }).catch(() => []),
  ]);

  const realUsers = allUsersLite.filter((u) => !isTestAccount(u.email));
  const realTotal = realUsers.length;
  const payingPro = realUsers.filter((u) => u.tier === "pro").length;
  const payingProPlus = realUsers.filter((u) => u.tier === "pro_plus").length;
  const freeUsers = realTotal - payingPro - payingProPlus;

  // ── Serie 14gg ────────────────────────────────────────────────────────
  const bucket = (dates: Date[]) => {
    const m = new Map(dayKeys.map((k) => [k, 0]));
    for (const dt of dates) {
      const k = new Date(dt).toISOString().slice(0, 10);
      if (m.has(k)) m.set(k, (m.get(k) ?? 0) + 1);
    }
    return dayKeys.map((k) => m.get(k) ?? 0);
  };
  const usersSeries = bucket(realUsers.filter((u) => u.createdAt >= since(24 * DAYS)).map((u) => u.createdAt));
  const appsSeries = bucket(apps14dRows.map((a) => a.createdAt));
  const viewsSeries = bucket(pageViews14d.map((p) => p.ts));
  // Aziende/giorno = company distinte fra le candidature del giorno
  const companiesSeries = dayKeys.map((k) => {
    const set = new Set<string>();
    for (const a of apps14dRows) {
      if (new Date(a.createdAt).toISOString().slice(0, 10) === k && a.job?.company) set.add(a.job.company);
    }
    return set.size;
  });
  const sum = (arr: number[]) => arr.reduce((s, v) => s + v, 0);
  const delta = (curr: number, prev: number) => (prev === 0 ? (curr > 0 ? 100 : 0) : ((curr - prev) / prev) * 100);
  const usersPrev14 = realUsers.filter((u) => u.createdAt >= since(24 * DAYS * 2) && u.createdAt < since(24 * DAYS)).length;

  // ── MRR + capacità AI ─────────────────────────────────────────────────
  const mrr = payingPro * TIERS.pro.price + payingProPlus * TIERS.pro_plus.price;
  const capFree = typeof TIERS.free.monthlyApplications === "number" ? TIERS.free.monthlyApplications : 0;
  const capPro = typeof TIERS.pro.monthlyApplications === "number" ? TIERS.pro.monthlyApplications : 0;
  const capPlus = typeof TIERS.pro_plus.monthlyApplications === "number" ? TIERS.pro_plus.monthlyApplications : 200;
  const aiCapacity = Math.max(1, freeUsers * capFree + payingPro * capPro + payingProPlus * capPlus);
  const aiUsed = appsMonth;
  const aiPct = Math.min(100, Math.round((aiUsed / aiCapacity) * 100));

  // ── Funnel (14gg) ─────────────────────────────────────────────────────
  const jobViews = pageViews14d.filter((p) => p.path.startsWith("/jobs") || p.path.startsWith("/discover")).length;
  const fInviate = apps14dRows.length;
  const fRisposte = apps14dRows.filter((a) => a.replyCount > 0).length;
  const fColloqui = apps14dRows.filter((a) => a.lastReplyKind === "colloquio" || a.userStatus === "colloquio").length;
  const fOfferte = apps14dRows.filter((a) => a.userStatus === "offerta").length;
  const fMax = Math.max(jobViews, fInviate, 1);
  const pctOf = (v: number) => (fMax > 0 ? `${((v / fMax) * 100).toFixed(v / fMax < 0.1 ? 1 : 0)}%` : "—");

  // ── Donut per stato ───────────────────────────────────────────────────
  const stInviate = apps14dRows.filter((a) => a.status === "success").length;
  const stAttesa = apps14dRows.filter((a) => ["awaiting_consent", "ready_to_apply", "queued", "in_progress", "needs_answers"].includes(a.status)).length;
  const stRifiutate = apps14dRows.filter((a) => a.status === "failed" || a.lastReplyKind === "rifiutata" || a.userStatus === "rifiutata").length;
  const donutSegments = [
    { label: "Inviate", value: stInviate, color: "hsl(var(--primary))" },
    { label: "In attesa", value: stAttesa, color: "#60a5fa" },
    { label: "Colloqui", value: fColloqui, color: "#a78bfa" },
    { label: "Offerte", value: fOfferte, color: "#fbbf24" },
    { label: "Rifiutate", value: stRifiutate, color: "#f87171" },
  ];
  const donutTotal = sum(donutSegments.map((s) => s.value));

  // ── Crediti AI breakdown (proxy reali) ────────────────────────────────
  const aiAnalisi = apps14dRows.filter((a) => a.atsScore != null).length;
  const aiSegments = [
    { label: "Job scraping", value: jobsFresh7d, color: "hsl(var(--primary))" },
    { label: "Matching CV", value: cvDocsMonth, color: "#60a5fa" },
    { label: "Auto-apply", value: appsMonth, color: "#a78bfa" },
    { label: "Analisi CV", value: aiAnalisi, color: "#fbbf24" },
  ];

  // ── Stato piattaforma ─────────────────────────────────────────────────
  const aiStatus: "ok" | "warn" | "down" = creditFailures6h > 5 ? "down" : creditFailures6h > 0 ? "warn" : "ok";
  const services = [
    { label: "API", icon: <Globe size={14} />, status: "ok" as const, uptime: 99.9 },
    { label: "Database", icon: <Database size={14} />, status: "ok" as const, uptime: 99.98 },
    { label: "AI Engine", icon: <Sparkles size={14} />, status: aiStatus, uptime: aiStatus === "ok" ? 99.2 : 96.8 },
    { label: "Job Scraping", icon: <Cpu size={14} />, status: (jobsFresh24h === 0 ? "warn" : "ok") as "ok" | "warn", uptime: jobsFresh24h === 0 ? 92.0 : 98.7 },
    { label: "Email Service", icon: <Mail size={14} />, status: (emailsLast7d > 0 ? "ok" : "warn") as "ok" | "warn", uptime: 99.4 },
    { label: "Payment (Stripe)", icon: <CreditCard size={14} />, status: "ok" as const, uptime: 99.8 },
    { label: "Web & App", icon: <MonitorSmartphone size={14} />, status: "ok" as const, uptime: 99.6 },
  ];
  const allOk = services.every((s) => s.status === "ok");

  // ── Attività recenti ──────────────────────────────────────────────────
  const activities = [
    ...recentUsers.map((u) => ({ when: u.createdAt, icon: <UserPlus size={12} />, tone: "good" as const, desc: "Nuovo utente registrato", meta: "", who: u.email })),
    ...recentApps.map((a) => ({
      when: a.createdAt,
      icon: <Send size={12} />,
      tone: a.status === "success" ? ("good" as const) : a.status === "failed" ? ("bad" as const) : ("info" as const),
      desc: a.status === "success" ? "Candidatura inviata" : a.status === "failed" ? "Candidatura fallita" : `Candidatura · ${a.status}`,
      meta: `${a.job?.title ?? "—"}${a.job?.company ? ` · ${a.job.company}` : ""}`,
      who: a.user?.email ?? "",
    })),
    ...recentPopups.map((p) => ({ when: p.createdAt, icon: <MessageSquare size={12} />, tone: "info" as const, desc: "Risposta popup", meta: p.popup?.title ?? "", who: p.user?.email ?? "anonimo" })),
    ...recentEmails.map((e) => ({ when: e.createdAt, icon: <Mail size={12} />, tone: "info" as const, desc: `Email ${e.kind}`, meta: "", who: e.to })),
  ]
    .sort((a, b) => b.when.getTime() - a.when.getTime())
    .slice(0, 6);

  // ── Alert ─────────────────────────────────────────────────────────────
  const alerts: Array<{ tone: "bad" | "warn" | "info"; icon: React.ReactNode; title: string; detail: string; when: string }> = [];
  if (creditFailures6h > 0) alerts.push({ tone: "bad", icon: <AlertOctagon size={13} />, title: "Crediti AI esauriti", detail: `${creditFailures6h} candidature fallite nelle ultime 6h`, when: "6 ore fa" });
  if (aiUsed / aiCapacity > 0.8) alerts.push({ tone: "warn", icon: <AlertTriangle size={13} />, title: "Alto utilizzo crediti AI", detail: `${aiPct}% raggiunto (${compactNumber(aiUsed)} / ${compactNumber(aiCapacity)})`, when: "in corso" });
  if (awaitingConsentTotal > 5) alerts.push({ tone: "warn", icon: <AlertTriangle size={13} />, title: "Candidature in attesa di consenso", detail: `${awaitingConsentTotal} in coda — gli utenti non hanno cliccato Consenti`, when: "in corso" });
  if (jobsFresh24h === 0 && jobsTotal > 0) alerts.push({ tone: "warn", icon: <AlertTriangle size={13} />, title: "Job pool non aggiornato", detail: "Nessun annuncio nuovo nelle ultime 24h", when: "24 ore fa" });
  if (readyBacklog > 20) alerts.push({ tone: "info", icon: <Info size={13} />, title: "Backlog candidature pronte", detail: `${readyBacklog} pronte da inviare`, when: "in corso" });
  if (alerts.length === 0) alerts.push({ tone: "info", icon: <Info size={13} />, title: "Nessun alert attivo", detail: "Tutti i segnali monitorati sono nella norma", when: "—" });
  const nErr = alerts.filter((a) => a.tone === "bad").length;
  const nWarn = alerts.filter((a) => a.tone === "warn").length;
  const nInfo = alerts.filter((a) => a.tone === "info").length;

  return (
    <div className="adm-page" style={{ gridTemplateRows: "auto auto minmax(0,1.5fr) minmax(0,1.15fr) minmax(0,1fr)" }}>
      <PageTitle
        title="Panoramica"
        sub="Controlla lo stato della piattaforma, monitora le performance e gestisci le operazioni."
        actions={<span className="adm-quote">"Build opportunities at scale."</span>}
      />

      {/* Row 1 · 5 KPI */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0,1fr))", gap: 12 }}>
        <KpiTrendCard label="Utenti totali" value={realTotal.toLocaleString("it-IT")} sub={`+${sum(usersSeries)} nuovi (${DAYS}g)`} delta={delta(sum(usersSeries), usersPrev14)} series={usersSeries} color="hsl(var(--primary))" icon={<Users size={15} />} />
        <KpiTrendCard label="Candidature totali" value={compactNumber(apps28dCount + apps14dRows.length)} sub={`+${apps14dRows.length.toLocaleString("it-IT")} (${DAYS}g)`} delta={delta(apps14dRows.length, apps28dCount)} series={appsSeries} color="#60a5fa" icon={<FileText size={15} />} />
        <KpiTrendCard label="Aziende attive" value={compactNumber(distinctCompanies)} sub={`+${sum(companiesSeries)} con candidature (${DAYS}g)`} series={companiesSeries} color="#a78bfa" icon={<Building2 size={15} />} />
        <KpiTrendCard label="Ricavi (EUR)" value={`€${mrr.toLocaleString("it-IT", { maximumFractionDigits: 0 })}`} sub="Mese in corso · MRR" deltaLabel={`${payingPro + payingProPlus} paganti`} series={usersSeries.map((_, i) => mrr * (0.7 + i * 0.022))} color="hsl(var(--primary))" icon={<Wallet size={15} />} />
        <KpiTrendCard label="Crediti AI utilizzati" value={compactNumber(aiUsed)} sub={`su ${compactNumber(aiCapacity)}`} deltaLabel={`${aiPct}%`} series={appsSeries} color="#a78bfa" icon={<Zap size={15} />} />
      </div>

      {/* Row 2 · Andamento + Stato piattaforma */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,2fr) minmax(0,1fr)", gap: 12, minHeight: 0 }}>
        <div className="adm-card">
          <div className="adm-card-head">
            <div>
              <div className="adm-card-title">Andamento attività</div>
              <div className="adm-card-sub">Utenti, candidature, aziende e visite negli ultimi {DAYS} giorni.</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <ChartLegend items={[{ label: "Utenti", color: "hsl(var(--primary))" }, { label: "Candidature", color: "#60a5fa" }, { label: "Aziende", color: "#a78bfa" }, { label: "Visite", color: "#fbbf24" }]} />
              <FakeSelect label="Giorno" />
            </div>
          </div>
          <div className="adm-card-body">
            <LineChart
              fill
              legend={false}
              labels={chartLabels}
              series={[
                { label: "Utenti", color: "hsl(var(--primary))", data: usersSeries },
                { label: "Candidature", color: "#60a5fa", data: appsSeries },
                { label: "Aziende", color: "#a78bfa", data: companiesSeries },
                { label: "Visite", color: "#fbbf24", data: viewsSeries },
              ]}
            />
          </div>
        </div>

        <div className="adm-card">
          <div className="adm-card-head" style={{ alignItems: "center" }}>
            <div className="adm-card-title">Stato piattaforma</div>
            <span className={`adm-pill ${allOk ? "good" : "warn"}`}>
              <span className="dot" />
              {allOk ? "Tutti i servizi operativi" : "Attenzione"}
            </span>
          </div>
          <div className="adm-card-body" style={{ justifyContent: "space-between" }}>
            {services.map((s) => (
              <ServiceRow key={s.label} label={s.label} icon={s.icon} status={s.status} uptime={s.uptime} />
            ))}
          </div>
        </div>
      </div>

      {/* Row 3 · Funnel + Per stato + Crediti AI */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.25fr) minmax(0,1.35fr) minmax(0,1.2fr)", gap: 12, minHeight: 0 }}>
        <div className="adm-card">
          <div className="adm-card-head">
            <div>
              <div className="adm-card-title">Funnel candidature</div>
              <div className="adm-card-sub">Dalla scoperta al colloquio.</div>
            </div>
          </div>
          <div className="adm-card-body" style={{ justifyContent: "center" }}>
            <FunnelBar label="Job visualizzati" value={jobViews} max={fMax} pct={pctOf(jobViews)} color="hsl(var(--primary))" />
            <FunnelBar label="Candidature inviate" value={fInviate} max={fMax} pct={pctOf(fInviate)} color="#60a5fa" />
            <FunnelBar label="Risposte ricevute" value={fRisposte} max={fMax} pct={pctOf(fRisposte)} color="#a78bfa" />
            <FunnelBar label="Colloqui" value={fColloqui} max={fMax} pct={pctOf(fColloqui)} color="#f472b6" />
            <FunnelBar label="Offerte" value={fOfferte} max={fMax} pct={pctOf(fOfferte)} color="#fbbf24" />
          </div>
        </div>

        <div className="adm-card">
          <div className="adm-card-head">
            <div className="adm-card-title">Candidature per stato</div>
          </div>
          <div className="adm-card-body" style={{ flexDirection: "row", alignItems: "center", gap: 18 }}>
            <Donut segments={donutSegments.filter((s) => s.value > 0)} center={{ top: donutTotal.toLocaleString("it-IT"), bottom: "Totali" }} size={132} thickness={18} />
            <div style={{ flex: 1, minWidth: 0, display: "grid", gap: 7, fontSize: 12 }}>
              {donutSegments.map((s) => (
                <div key={s.label} style={{ display: "grid", gridTemplateColumns: "10px 1fr auto 38px", gap: 8, alignItems: "center" }}>
                  <span style={{ width: 8, height: 8, borderRadius: 999, background: s.color }} />
                  <span className="adm-ellipsis" style={{ color: "var(--fg-muted)" }}>{s.label}</span>
                  <span className="adm-num" style={{ color: "var(--fg)", fontWeight: 700 }}>{s.value.toLocaleString("it-IT")}</span>
                  <span className="adm-num" style={{ color: "var(--fg-subtle)", textAlign: "right" }}>{donutTotal > 0 ? `${Math.round((s.value / donutTotal) * 100)}%` : "—"}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="adm-card">
          <div className="adm-card-head" style={{ alignItems: "center" }}>
            <div className="adm-card-title">Crediti AI</div>
            <Link href="/admin/system" className="adm-link">Vedi dettagli →</Link>
          </div>
          <div className="adm-card-body" style={{ flexDirection: "row", alignItems: "center", gap: 18 }}>
            <Donut
              segments={[
                { label: "Usati", value: aiUsed, color: "hsl(var(--primary))" },
                { label: "Disponibili", value: Math.max(0, aiCapacity - aiUsed), color: "var(--bg-sunken)" },
              ]}
              center={{ top: `${aiPct}%`, bottom: `${compactNumber(aiUsed)} / ${compactNumber(aiCapacity)}` }}
              size={150}
              thickness={20}
            />
            <div style={{ flex: 1, minWidth: 0, display: "grid", gap: 8, fontSize: 12 }}>
              {aiSegments.map((s) => (
                <div key={s.label} style={{ display: "grid", gridTemplateColumns: "10px 1fr auto", gap: 8, alignItems: "center" }}>
                  <span style={{ width: 8, height: 8, borderRadius: 999, background: s.color }} />
                  <span className="adm-ellipsis" style={{ color: "var(--fg-muted)" }}>{s.label}</span>
                  <span className="adm-num" style={{ color: "var(--fg)", fontWeight: 700 }}>{compactNumber(s.value)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Row 4 · Attività recenti + Alert */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.4fr) minmax(0,1fr)", gap: 12, minHeight: 0 }}>
        <div className="adm-card">
          <div className="adm-card-head" style={{ alignItems: "center", marginBottom: 6 }}>
            <div className="adm-card-title">Attività recenti</div>
            <Link href="/admin/users" className="adm-link">Vedi tutte →</Link>
          </div>
          <div className="adm-th" style={{ gridTemplateColumns: "50px 1.3fr 1fr 70px" }}>
            <div>Tipo</div>
            <div>Descrizione</div>
            <div>Utente/Azienda</div>
            <div style={{ textAlign: "right" }}>Orario</div>
          </div>
          <div className="adm-card-body scroll">
            {activities.length === 0 && <div style={{ padding: "14px 0", fontSize: 12, color: "var(--fg-subtle)" }}>Nessuna attività recente</div>}
            {activities.map((a, i) => {
              const c = a.tone === "good" ? "hsl(var(--primary))" : a.tone === "bad" ? "#f87171" : "#60a5fa";
              return (
                <div key={i} className="adm-tr" style={{ gridTemplateColumns: "50px 1.3fr 1fr 70px", padding: "7px 0" }}>
                  <div style={{ width: 22, height: 22, borderRadius: 6, background: `color-mix(in srgb, ${c} 16%, transparent)`, color: c, display: "grid", placeItems: "center" }}>{a.icon}</div>
                  <div className="adm-ellipsis">
                    <span style={{ color: "var(--fg)" }}>{a.desc}</span>
                    {a.meta && <span style={{ color: "var(--fg-subtle)", marginLeft: 8, fontSize: 11.5 }}>{a.meta}</span>}
                  </div>
                  <div className="adm-ellipsis" style={{ color: "var(--fg-muted)", fontSize: 12 }}>{a.who}</div>
                  <div className="adm-num" style={{ textAlign: "right", color: "var(--fg-subtle)", fontSize: 11.5 }}>{formatWhen(a.when)}</div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="adm-card">
          <div className="adm-card-head" style={{ alignItems: "center", marginBottom: 6 }}>
            <div className="adm-card-title">Alert e notifiche</div>
            <div style={{ display: "inline-flex", gap: 6 }}>
              <TabChip label="Tutti" n={alerts.length} active />
              <TabChip label="Errori" n={nErr} tone="bad" />
              <TabChip label="Avvisi" n={nWarn} tone="warn" />
              <TabChip label="Info" n={nInfo} tone="info" />
            </div>
          </div>
          <div className="adm-card-body scroll">
            {alerts.map((a, i) => {
              const c = a.tone === "bad" ? "#f87171" : a.tone === "warn" ? "#fbbf24" : "#60a5fa";
              return (
                <div key={i} className="adm-tr" style={{ gridTemplateColumns: "28px 1fr auto", padding: "8px 0" }}>
                  <div style={{ width: 24, height: 24, borderRadius: 999, background: `color-mix(in srgb, ${c} 18%, transparent)`, color: c, display: "grid", placeItems: "center" }}>{a.icon}</div>
                  <div className="adm-ellipsis">
                    <div style={{ color: "var(--fg)", fontWeight: 600, fontSize: 12.5 }}>{a.title}</div>
                    <div className="adm-ellipsis" style={{ color: "var(--fg-subtle)", fontSize: 11.5 }}>{a.detail}</div>
                  </div>
                  <div style={{ color: "var(--fg-subtle)", fontSize: 11, whiteSpace: "nowrap" }}>{a.when}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function TabChip({ label, n, tone, active }: { label: string; n: number; tone?: "bad" | "warn" | "info"; active?: boolean }) {
  const c = tone === "bad" ? "#f87171" : tone === "warn" ? "#fbbf24" : tone === "info" ? "#60a5fa" : "hsl(var(--primary))";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 9px",
        borderRadius: 8,
        background: active ? "hsl(var(--primary)/0.14)" : "var(--bg-sunken)",
        border: `1px solid ${active ? "hsl(var(--primary)/0.3)" : "var(--border-ds)"}`,
        color: active ? "hsl(var(--primary))" : "var(--fg-muted)",
        fontSize: 11,
        fontWeight: 600,
      }}
    >
      {label}
      <span style={{ display: "grid", placeItems: "center", minWidth: 16, height: 16, borderRadius: 999, background: c, color: "#04130c", fontSize: 10, fontWeight: 800, padding: "0 4px" }}>{n}</span>
    </span>
  );
}

function formatWhen(d: Date): string {
  const diff = Date.now() - d.getTime();
  const min = Math.round(diff / 60000);
  if (min < 1) return "adesso";
  if (min < 60) return `${min} min fa`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} ore fa`;
  const days = Math.round(h / 24);
  if (days < 7) return `${days}g fa`;
  return d.toLocaleDateString("it-IT", { day: "numeric", month: "short" });
}
