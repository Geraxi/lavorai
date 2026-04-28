import type { Metadata } from "next";
import Link from "next/link";
import { AppTopbar } from "@/components/design/topbar";
import { Icon } from "@/components/design/icon";
import { Kpi } from "@/components/design/kpi";
import {
  SectionBody,
  SectionCard,
  SectionHead,
} from "@/components/design/section-card";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/db";

export const metadata: Metadata = { title: "Analisi" };
export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const thirtyStart = new Date(todayStart.getTime() - 29 * 86400_000);

  // Solo candidature consegnate (success + submittedVia non nullo).
  const deliveredWhere = {
    userId: user.id,
    status: "success",
    submittedVia: { not: null },
  } as const;

  const [
    totalApps,
    thisMonth,
    prevMonth,
    viewedTotal,
    last30Apps,
    bySubmittedVia,
    byCompanyRaw,
    bySource,
    activeSessions,
  ] = await Promise.all([
    prisma.application.count({ where: deliveredWhere }),
    prisma.application.count({
      where: { ...deliveredWhere, createdAt: { gte: monthStart } },
    }),
    prisma.application.count({
      where: { ...deliveredWhere, createdAt: { gte: prevMonthStart, lt: monthStart } },
    }),
    prisma.application.count({
      where: { ...deliveredWhere, viewedAt: { not: null } },
    }),
    prisma.application.findMany({
      where: { ...deliveredWhere, createdAt: { gte: thirtyStart } },
      select: { createdAt: true, viewedAt: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.application.groupBy({
      by: ["submittedVia"],
      where: deliveredWhere,
      _count: true,
    }),
    prisma.application.findMany({
      where: deliveredWhere,
      select: { job: { select: { company: true } } },
    }),
    prisma.application.groupBy({
      by: ["portal"],
      where: deliveredWhere,
      _count: true,
    }),
    prisma.applicationSession.findMany({
      where: {
        userId: user.id,
        status: { in: ["active", "auto", "paused"] },
      },
      select: {
        id: true,
        title: true,
        label: true,
        status: true,
        sentCount: true,
        targetCount: true,
      },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const isEmpty = totalApps === 0;

  // Delta mese su mese
  const monthDelta =
    prevMonth === 0
      ? thisMonth > 0
        ? "+100% vs mese prec."
        : "—"
      : `${thisMonth >= prevMonth ? "+" : ""}${Math.round(
          ((thisMonth - prevMonth) / prevMonth) * 100,
        )}% vs mese prec.`;

  // Tasso risposta (apertura recruiter via pixel/webhook)
  const responseRate =
    totalApps === 0
      ? "—"
      : `${Math.round((viewedTotal / totalApps) * 100)}%`;

  // Tempo medio prima apertura — derivato dai viewedAt non null
  const respondedTimes = last30Apps
    .filter((a) => a.viewedAt)
    .map((a) => a.viewedAt!.getTime() - a.createdAt.getTime());
  const avgRespMs =
    respondedTimes.length > 0
      ? respondedTimes.reduce((s, n) => s + n, 0) / respondedTimes.length
      : null;
  const avgRespLabel =
    avgRespMs == null
      ? "—"
      : avgRespMs < 3600_000
        ? `${Math.round(avgRespMs / 60_000)} min`
        : avgRespMs < 86400_000
          ? `${Math.round(avgRespMs / 3600_000)} h`
          : `${Math.round(avgRespMs / 86400_000)} g`;

  // Buckets giornalieri ultimi 30
  const daily30: number[] = Array.from({ length: 30 }, () => 0);
  for (const a of last30Apps) {
    const idx = Math.floor(
      (a.createdAt.getTime() - thirtyStart.getTime()) / 86400_000,
    );
    if (idx >= 0 && idx < 30) daily30[idx]++;
  }
  const daily30Max = Math.max(1, ...daily30);

  // Top aziende
  const companyCounts = new Map<string, number>();
  for (const a of byCompanyRaw) {
    const c = a.job.company?.trim() || "Sconosciuta";
    companyCounts.set(c, (companyCounts.get(c) ?? 0) + 1);
  }
  const topCompanies = Array.from(companyCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);
  const topCompanyMax = Math.max(1, ...topCompanies.map(([, n]) => n));

  // Canali di invio
  const channels = bySubmittedVia
    .map((r) => ({ k: r.submittedVia ?? "altro", n: r._count }))
    .sort((a, b) => b.n - a.n);
  const channelMax = Math.max(1, ...channels.map((c) => c.n));

  // Tempo risparmiato
  const savedMin = totalApps * 15;
  const savedLabel =
    savedMin < 60
      ? `${savedMin}m`
      : `${Math.floor(savedMin / 60)}h${savedMin % 60 ? ` ${savedMin % 60}m` : ""}`;

  return (
    <>
      <AppTopbar title="Analisi" breadcrumb="Lavoro" />
      <div
        style={{
          padding: "24px 32px 80px",
          maxWidth: 1480,
          width: "100%",
          margin: "0 auto",
        }}
      >
        <div className="mb-6">
          <h1
            style={{
              fontSize: 22,
              fontWeight: 600,
              letterSpacing: "-0.022em",
              margin: 0,
            }}
          >
            Analisi
          </h1>
          <p
            style={{ fontSize: 13.5, color: "var(--fg-muted)", marginTop: 4 }}
          >
            {isEmpty
              ? "Le tue metriche appariranno qui appena invii la prima candidatura."
              : "Come stanno andando le tue candidature · ultimi 30 giorni"}
          </p>
        </div>

        <div className="ds-kpi-grid">
          <Kpi
            index={0}
            label="Candidature"
            value={String(totalApps)}
            delta={isEmpty ? "Nessuna ancora" : monthDelta}
            up={!isEmpty}
            sparkData={isEmpty ? undefined : daily30}
          />
          <Kpi
            index={1}
            label="Tasso risposta"
            value={responseRate}
            delta={
              viewedTotal > 0
                ? `${viewedTotal} su ${totalApps} aperte`
                : "Nessuna ancora"
            }
            up={viewedTotal > 0}
          />
          <Kpi
            index={2}
            label="Tempo medio risposta"
            value={avgRespLabel}
            delta={
              respondedTimes.length > 0
                ? `${respondedTimes.length} risposte`
                : "Nessuna ancora"
            }
            mono
          />
          <Kpi
            index={3}
            label="Tempo risparmiato"
            value={isEmpty ? "0m" : savedLabel}
            delta={isEmpty ? "Attiva auto-apply" : "stima 15 min/candidatura"}
            up={!isEmpty}
            mono
          />
        </div>

        {isEmpty ? (
          <SectionCard>
            <SectionHead
              icon={<Icon name="chart" size={14} />}
              title="Nessun dato ancora"
            />
            <SectionBody>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  textAlign: "center",
                  padding: "48px 24px",
                  gap: 10,
                }}
              >
                <div
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: 14,
                    background: "var(--bg-sunken)",
                    border: "1px solid var(--border-ds)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "var(--fg-subtle)",
                    marginBottom: 4,
                  }}
                >
                  <Icon name="chart" size={22} />
                </div>
                <div
                  style={{
                    fontSize: 15,
                    fontWeight: 600,
                    letterSpacing: "-0.01em",
                  }}
                >
                  Inizia a candidarti
                </div>
                <div
                  style={{
                    fontSize: 13,
                    color: "var(--fg-muted)",
                    maxWidth: 360,
                    lineHeight: 1.5,
                  }}
                >
                  Appena invii la prima candidatura, qui vedrai trend giornaliero,
                  top aziende, canali di invio e progresso dei round.
                </div>
                <Link
                  href="/jobs"
                  className="ds-btn ds-btn-primary"
                  style={{ marginTop: 10 }}
                >
                  Apri job board
                </Link>
              </div>
            </SectionBody>
          </SectionCard>
        ) : (
          <div style={{ marginTop: 24, display: "flex", flexDirection: "column", gap: 20 }}>
            {/* Trend giornaliero */}
            <SectionCard>
              <SectionHead
                icon={<Icon name="chart" size={14} />}
                title="Andamento ultimi 30 giorni"
              />
              <SectionBody>
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-end",
                    gap: 4,
                    height: 120,
                    padding: "8px 0 4px",
                  }}
                >
                  {daily30.map((n, i) => {
                    const h = Math.max(2, (n / daily30Max) * 110);
                    return (
                      <div
                        key={i}
                        title={`${n} candidature`}
                        style={{
                          flex: 1,
                          height: `${h}px`,
                          background:
                            n === 0
                              ? "var(--bg-sunken)"
                              : "linear-gradient(180deg, hsl(var(--primary)/0.9), hsl(var(--primary)/0.4))",
                          borderRadius: 3,
                          minHeight: 2,
                          transition: "background 0.2s",
                        }}
                      />
                    );
                  })}
                </div>
                <div
                  style={{
                    marginTop: 8,
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: 11,
                    color: "var(--fg-subtle)",
                  }}
                  className="mono"
                >
                  <span>30g fa</span>
                  <span>15g fa</span>
                  <span>oggi</span>
                </div>
              </SectionBody>
            </SectionCard>

            {/* 2 colonne: top aziende + canali */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 20,
              }}
            >
              <SectionCard>
                <SectionHead
                  icon={<Icon name="briefcase" size={14} />}
                  title="Top aziende"
                />
                <SectionBody>
                  {topCompanies.length === 0 ? (
                    <div style={{ fontSize: 13, color: "var(--fg-muted)" }}>
                      Nessun dato.
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {topCompanies.map(([name, n]) => (
                        <div key={name} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              fontSize: 13,
                            }}
                          >
                            <span style={{ fontWeight: 500 }}>{name}</span>
                            <span className="mono" style={{ color: "var(--fg-muted)" }}>
                              {n}
                            </span>
                          </div>
                          <div
                            style={{
                              height: 4,
                              borderRadius: 999,
                              background: "var(--bg-sunken)",
                              overflow: "hidden",
                            }}
                          >
                            <div
                              style={{
                                width: `${(n / topCompanyMax) * 100}%`,
                                height: "100%",
                                background: "var(--primary-ds)",
                                transition: "width 0.4s",
                              }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </SectionBody>
              </SectionCard>

              <SectionCard>
                <SectionHead
                  icon={<Icon name="send" size={14} />}
                  title="Canali di invio"
                />
                <SectionBody>
                  {channels.length === 0 ? (
                    <div style={{ fontSize: 13, color: "var(--fg-muted)" }}>
                      Nessun dato.
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {channels.map((c) => (
                        <div
                          key={c.k}
                          style={{ display: "flex", flexDirection: "column", gap: 4 }}
                        >
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              fontSize: 13,
                            }}
                          >
                            <span style={{ fontWeight: 500 }}>
                              {channelLabel(c.k)}
                            </span>
                            <span className="mono" style={{ color: "var(--fg-muted)" }}>
                              {c.n}
                            </span>
                          </div>
                          <div
                            style={{
                              height: 4,
                              borderRadius: 999,
                              background: "var(--bg-sunken)",
                              overflow: "hidden",
                            }}
                          >
                            <div
                              style={{
                                width: `${(c.n / channelMax) * 100}%`,
                                height: "100%",
                                background: "var(--primary-ds)",
                                transition: "width 0.4s",
                              }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </SectionBody>
              </SectionCard>
            </div>

            {/* Round attivi snapshot */}
            <SectionCard>
              <SectionHead
                icon={<Icon name="target" size={14} />}
                title="Round attivi"
              />
              <SectionBody>
                {activeSessions.length === 0 ? (
                  <div style={{ fontSize: 13, color: "var(--fg-muted)" }}>
                    Nessun round attivo. Avviane uno dalla dashboard.
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                    {activeSessions.map((s) => {
                      const pct = Math.min(
                        100,
                        Math.round((s.sentCount / Math.max(1, s.targetCount)) * 100),
                      );
                      return (
                        <div key={s.id} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              fontSize: 13,
                            }}
                          >
                            <span style={{ fontWeight: 500 }}>
                              {s.title ?? s.label}
                            </span>
                            <span className="mono" style={{ color: "var(--fg-muted)", fontSize: 12 }}>
                              {s.sentCount} / {s.targetCount} ·{" "}
                              {s.status === "paused" ? "in pausa" : "attivo"}
                            </span>
                          </div>
                          <div
                            style={{
                              height: 4,
                              borderRadius: 999,
                              background: "var(--bg-sunken)",
                              overflow: "hidden",
                            }}
                          >
                            <div
                              style={{
                                width: `${pct}%`,
                                height: "100%",
                                background:
                                  s.status === "paused"
                                    ? "var(--fg-subtle)"
                                    : "var(--primary-ds)",
                                transition: "width 0.4s",
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </SectionBody>
            </SectionCard>

            {/* Per portale (debug-utile) */}
            <SectionCard>
              <SectionHead
                icon={<Icon name="globe" size={14} />}
                title="Per portale ATS"
              />
              <SectionBody>
                {bySource.length === 0 ? (
                  <div style={{ fontSize: 13, color: "var(--fg-muted)" }}>
                    Nessun dato.
                  </div>
                ) : (
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                      gap: 12,
                    }}
                  >
                    {bySource
                      .filter((r) => r.portal)
                      .sort((a, b) => b._count - a._count)
                      .map((r) => (
                        <div
                          key={r.portal}
                          style={{
                            padding: 14,
                            borderRadius: 10,
                            background: "var(--bg-elev)",
                            border: "1px solid var(--border-ds)",
                          }}
                        >
                          <div
                            style={{
                              fontSize: 11,
                              textTransform: "uppercase",
                              letterSpacing: "0.16em",
                              color: "var(--fg-muted)",
                            }}
                            className="mono"
                          >
                            {r.portal ?? "altro"}
                          </div>
                          <div
                            style={{
                              fontSize: 22,
                              fontWeight: 600,
                              letterSpacing: "-0.02em",
                              marginTop: 4,
                            }}
                          >
                            {r._count}
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </SectionBody>
            </SectionCard>
          </div>
        )}
      </div>
    </>
  );
}

function channelLabel(k: string): string {
  if (k === "portal_greenhouse") return "Greenhouse (form ATS)";
  if (k === "portal_lever") return "Lever (form ATS)";
  if (k === "portal_workable") return "Workable (form ATS)";
  if (k === "email_recruiter") return "Email recruiter (Resend)";
  if (k === "mock_demo") return "Demo (sandbox)";
  return k;
}
