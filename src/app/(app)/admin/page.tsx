import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { isTestAccount } from "@/lib/admin";
import { Kpi, PageTitle, SectionCard, BarChart, ChartCard } from "./_ui";
import { RetryCreditFailuresButton } from "./_retry-button";

export const metadata: Metadata = { title: "Admin · Panoramica", robots: { index: false } };
export const dynamic = "force-dynamic";

/**
 * Admin / Panoramica — KPI top-level (utenti reali, paganti, candidature).
 * Auth gate è nel layout. Le altre sezioni vivono in sub-route /admin/*.
 */
export default async function AdminOverviewPage() {
  const now = Date.now();
  const since = (h: number) => new Date(now - h * 3600_000);

  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

  const [
    allUsersLite,
    payingUsers,
    verifiedUsers,
    totalApps,
    apps7d,
    deliveredMonth,
    activeSessions,
    creditFailuresRecent,
    pageViews24h,
    jobsTotal,
    jobsFresh24h,
    readyBacklog,
    suspectSends,
    activePopups,
    popupResponses,
    apps14dRows,
    pageViews14dRows,
  ] = await Promise.all([
    prisma.user.findMany({ select: { email: true, tier: true, emailVerified: true, createdAt: true } }),
    prisma.user.count({ where: { tier: { in: ["pro", "pro_plus"] } } }),
    prisma.user.count({ where: { emailVerified: { not: null } } }),
    prisma.application.count(),
    prisma.application.count({ where: { createdAt: { gte: since(24 * 7) } } }),
    prisma.application.count({
      where: { status: "success", submittedVia: { not: null }, createdAt: { gte: monthStart } },
    }),
    prisma.applicationSession.count({ where: { status: { in: ["active", "auto"] } } }),
    // Crediti esauriti ORA: contiamo solo gli ultimi 6h. Su finestra 7g
    // l'alert restava rosso per una settimana anche dopo aver ricaricato.
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
    prisma.pageView.count({ where: { ts: { gte: since(24) } } }),
    prisma.job.count(),
    prisma.job.count({ where: { cachedAt: { gte: since(24) } } }),
    prisma.application.count({ where: { status: "ready_to_apply" } }),
    // Invii "sospetti": marcati success ma senza prova hard di conferma
    // (submitConfirmation null o UNCONFIRMED). Segnale per la sezione Consegna.
    prisma.application.count({
      where: { status: "success", OR: [{ submitConfirmation: null }, { submitConfirmation: "UNCONFIRMED" }] },
    }),
    prisma.adminPopup.count({ where: { active: true } }),
    prisma.popupResponse.count(),
    // Serie temporali per i grafici "ultimi 14 giorni" — solo i timestamp,
    // bucketizzati per giorno lato JS.
    prisma.application.findMany({
      where: { createdAt: { gte: since(24 * 14) } },
      select: { createdAt: true, status: true },
    }),
    prisma.pageView.findMany({
      where: { ts: { gte: since(24 * 14) } },
      select: { ts: true },
    }),
  ]);

  const totalUsers = allUsersLite.length;
  const realUsers = allUsersLite.filter((u) => !isTestAccount(u.email));
  const realTotal = realUsers.length;
  const realPaying = realUsers.filter((u) => u.tier === "pro" || u.tier === "pro_plus").length;
  const real24h = realUsers.filter((u) => u.createdAt >= since(24)).length;
  const real7d = realUsers.filter((u) => u.createdAt >= since(24 * 7)).length;
  const real30d = realUsers.filter((u) => u.createdAt >= since(24 * 30)).length;

  // --- Serie giornaliere ultimi 14 giorni (per i grafici) ---
  const DAYS = 14;
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const dayKeys: string[] = [];
  for (let i = DAYS - 1; i >= 0; i--) {
    const d = new Date(dayStart);
    d.setDate(d.getDate() - i);
    dayKeys.push(d.toISOString().slice(0, 10));
  }
  const chartLabels = dayKeys.map((k) => k.slice(5)); // MM-DD
  const bucketByDay = (dates: Array<Date | string>): number[] => {
    const m = new Map(dayKeys.map((k) => [k, 0]));
    for (const dt of dates) {
      const k = new Date(dt).toISOString().slice(0, 10);
      const cur = m.get(k);
      if (cur !== undefined) m.set(k, cur + 1);
    }
    return dayKeys.map((k) => m.get(k) ?? 0);
  };

  const usersSeries = bucketByDay(
    realUsers.filter((u) => u.createdAt >= since(24 * DAYS)).map((u) => u.createdAt),
  );
  const appsSeries = bucketByDay(apps14dRows.map((a) => a.createdAt));
  const viewsSeries = bucketByDay(pageViews14dRows.map((p) => p.ts));
  const usersSeriesSum = usersSeries.reduce((a, b) => a + b, 0);
  const appsSeriesSum = appsSeries.reduce((a, b) => a + b, 0);
  const viewsSeriesSum = viewsSeries.reduce((a, b) => a + b, 0);

  // Esiti candidature ultimi 14g (distribuzione per stato).
  const statusCounts = apps14dRows.reduce<Record<string, number>>((acc, a) => {
    acc[a.status] = (acc[a.status] ?? 0) + 1;
    return acc;
  }, {});
  const outcomeOrder: Array<{ key: string; label: string; color: string }> = [
    { key: "success", label: "Consegnate", color: "hsl(var(--primary))" },
    { key: "ready_to_apply", label: "Da completare", color: "#fbbf24" },
    { key: "needs_answers", label: "Domande aperte", color: "#60a5fa" },
    { key: "failed", label: "Fallite", color: "#f87171" },
  ];
  const outcomeTotal = Object.values(statusCounts).reduce((a, b) => a + b, 0);

  return (
    <>
      <PageTitle title="Panoramica" sub={`Live · ${new Date().toLocaleString("it-IT")}`} />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px,1fr))", gap: 12, marginBottom: 20 }}>
        <Kpi label="Utenti reali" value={realTotal} sub={`${totalUsers} totali · ${totalUsers - realTotal} test esclusi`} tone={realTotal > 0 ? "good" : undefined} />
        <Kpi label="Reali: 24h / 7g / 30g" value={`${real24h} / ${real7d} / ${real30d}`} />
        <Kpi
          label="Paganti (reali)"
          value={realPaying}
          sub={realPaying === 0 ? "nessuna conversione" : `${Math.round((realPaying / Math.max(1, realTotal)) * 100)}% conversion`}
          tone={realPaying > 0 ? "good" : "warn"}
        />
        <Kpi label="Candidature totali" value={totalApps} sub={`${apps7d} ultimi 7g`} />
        <Kpi label="Consegnate (mese)" value={deliveredMonth} />
        <Kpi label="Sessioni attive" value={activeSessions} />
      </div>
      <div style={{ fontSize: 11.5, color: "var(--fg-subtle)", marginBottom: 20 }}>
        Verificati totali: {verifiedUsers}/{totalUsers} · Paganti totali (incl. interni): {payingUsers}
      </div>

      {creditFailuresRecent > 0 && (
        <div style={{ padding: "14px 16px", borderRadius: 12, background: "rgba(220,38,38,0.1)", border: "1px solid rgba(220,38,38,0.4)" }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#fca5a5" }}>
            Crediti AI esauriti — pipeline bloccata
          </div>
          <div style={{ fontSize: 12.5, color: "var(--fg-muted)", marginTop: 6, lineHeight: 1.6 }}>
            {creditFailuresRecent} candidature fallite nelle ultime 6h per crediti.
            Azione: console.anthropic.com → Billing.
          </div>
          <RetryCreditFailuresButton />
        </div>
      )}
      {/* Retry sempre disponibile anche se il counter è 0 (potrebbero
          esserci failed di >6h che non contano nel banner). */}
      {creditFailuresRecent === 0 && (
        <div style={{ padding: "10px 14px", borderRadius: 10, background: "rgba(255,255,255,0.02)", border: "1px solid var(--border-ds)", marginTop: 8 }}>
          <div style={{ fontSize: 12, color: "var(--fg-muted)", marginBottom: 4 }}>
            Retry manuale candidature failed per crediti (finestra 14gg)
          </div>
          <RetryCreditFailuresButton />
        </div>
      )}

      <div style={{ marginTop: 28 }}>
        <div style={{ fontSize: 11, color: "var(--fg-subtle)", textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 600, marginBottom: 12 }}>
          Andamento · ultimi 14 giorni
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px,1fr))", gap: 12 }}>
          <ChartCard title="Nuovi utenti reali / giorno" total={usersSeriesSum} totalTone={usersSeriesSum > 0 ? "good" : undefined} footer={`${chartLabels[0]} → ${chartLabels[chartLabels.length - 1]}`}>
            <BarChart data={usersSeries} labels={chartLabels} />
          </ChartCard>
          <ChartCard title="Candidature / giorno" total={appsSeriesSum} footer={`${chartLabels[0]} → ${chartLabels[chartLabels.length - 1]}`}>
            <BarChart data={appsSeries} labels={chartLabels} color="#60a5fa" />
          </ChartCard>
          <ChartCard title="Page view / giorno" total={viewsSeriesSum} footer={`${chartLabels[0]} → ${chartLabels[chartLabels.length - 1]}`}>
            <BarChart data={viewsSeries} labels={chartLabels} color="#a78bfa" />
          </ChartCard>
          <ChartCard title="Esiti candidature (14g)" total={outcomeTotal}>
            {outcomeTotal === 0 ? (
              <div style={{ fontSize: 12, color: "var(--fg-subtle)", padding: "24px 0", textAlign: "center" }}>Nessuna candidatura nel periodo</div>
            ) : (
              <>
                <div style={{ display: "flex", height: 14, borderRadius: 7, overflow: "hidden", background: "var(--bg-sunken)" }}>
                  {outcomeOrder.map((o) => {
                    const n = statusCounts[o.key] ?? 0;
                    if (n === 0) return null;
                    return <div key={o.key} title={`${o.label}: ${n}`} style={{ width: `${(n / outcomeTotal) * 100}%`, background: o.color }} />;
                  })}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 14px", marginTop: 10 }}>
                  {outcomeOrder.map((o) => {
                    const n = statusCounts[o.key] ?? 0;
                    if (n === 0) return null;
                    return (
                      <div key={o.key} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "var(--fg-muted)" }}>
                        <span style={{ width: 8, height: 8, borderRadius: 2, background: o.color, display: "inline-block" }} />
                        {o.label} <span style={{ color: "var(--fg)", fontWeight: 600 }}>{n}</span>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </ChartCard>
        </div>
      </div>

      <div style={{ marginTop: 28 }}>
        <div style={{ fontSize: 11, color: "var(--fg-subtle)", textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 600, marginBottom: 12 }}>
          Sezioni
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px,1fr))", gap: 12 }}>
          <SectionCard
            href="/admin/traffic"
            label="Traffico"
            metric={pageViews24h}
            metricSub="visite ultime 24h"
            desc="Page view, visitatori unici e sorgenti di traffico."
            tone={pageViews24h > 0 ? "good" : undefined}
          />
          <SectionCard
            href="/admin/delivery"
            label="Consegna"
            metric={`${deliveredMonth} / ${readyBacklog}`}
            metricSub="consegnate mese / in attesa"
            desc="Esito invii, conferme HTTP/DOM e candidature da completare."
            tone={suspectSends > 0 ? "warn" : deliveredMonth > 0 ? "good" : undefined}
          />
          <SectionCard
            href="/admin/users"
            label="Utenti"
            metric={realTotal}
            metricSub={`${realPaying} paganti · ${real7d} nuovi 7g`}
            desc="Elenco utenti reali, tier, verifica email e attività."
            tone={realTotal > 0 ? "good" : undefined}
          />
          <SectionCard
            href="/admin/jobs"
            label="Job pool"
            metric={jobsTotal}
            metricSub={`${jobsFresh24h} aggiornati 24h`}
            desc="Annunci in cache, sorgenti ATS/aggregatori e freschezza."
            tone={jobsFresh24h > 0 ? "good" : "warn"}
          />
          <SectionCard
            href="/admin/system"
            label="Salute AI"
            metric={creditFailuresRecent === 0 ? "OK" : `${creditFailuresRecent} fail`}
            metricSub="crediti AI ultime 6h"
            desc="Healthcheck AI, browser e stato dei crediti Anthropic."
            tone={creditFailuresRecent === 0 ? "good" : "warn"}
          />
          <SectionCard
            href="/admin/test"
            label="Test invio"
            desc="Trigger manuale di una candidatura reale per verificare la pipeline end-to-end."
          />
          <SectionCard
            href="/admin/nudges"
            label="Nudge"
            desc="Email di sollecito agli utenti bloccati su uno step dell'onboarding."
          />
          <SectionCard
            href="/admin/popups"
            label="Popup"
            metric={activePopups}
            metricSub={`${popupResponses} risposte totali`}
            desc="Sondaggi e messaggi in-app, con raccolta feedback."
            tone={activePopups > 0 ? "good" : undefined}
          />
          <SectionCard
            href="/admin/assistant"
            label="AI chat"
            desc="Assistente AI interno per interrogare dati e operazioni admin."
          />
        </div>
      </div>
    </>
  );
}
