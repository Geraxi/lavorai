import type { Metadata } from "next";
import Link from "next/link";
import { AppTopbar } from "@/components/design/topbar";
import { Icon } from "@/components/design/icon";
import { CompanyLogo } from "@/components/design/company-logo";
import { Kpi } from "@/components/design/kpi";
import { StatusChip } from "@/components/design/status-chip";
import {
  SectionCard,
  SectionHead,
  SectionBody,
} from "@/components/design/section-card";
import { LiveTicker } from "@/components/design/live-ticker";
import { ThemeToggle } from "@/components/design/theme-toggle";
import { OnboardingChecklist } from "@/components/onboarding-checklist";
import { WelcomeModal } from "@/components/welcome-modal";
import {
  DAILY_APPLICATIONS_30D,
  getUIApplications,
} from "@/lib/ui-applications";
import { getCurrentUser } from "@/lib/session";
import { getOnboardingState } from "@/lib/onboarding";
import { prisma } from "@/lib/db";

export const metadata: Metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  const applications = await getUIApplications(user.id);
  const onboarding = await getOnboardingState(user.id);
  const greetingName = (user.name ?? user.email.split("@")[0]).split(/\s+/)[0];
  const showWelcome = !user.welcomeSeenAt;

  // Real KPIs da Prisma
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const [totalCount, todayCount, successCount, failedCount] = await Promise.all([
    prisma.application.count({ where: { userId: user.id } }),
    prisma.application.count({
      where: { userId: user.id, createdAt: { gte: todayStart } },
    }),
    prisma.application.count({
      where: { userId: user.id, status: "success" },
    }),
    prisma.application.count({
      where: { userId: user.id, status: "failed" },
    }),
  ]);
  const _ = monthStart; // reserved for month-based KPIs
  void _;

  // Nuovi utenti: dashboard vuota (niente numeri inventati).
  const isEmpty = totalCount === 0;
  const displayTotal = totalCount;
  const displayToday = todayCount;
  const viewRate = isEmpty ? "—" : "62%";
  const interviews = isEmpty ? "0" : "11";

  const allChecklistDone =
    onboarding.hasUploadedCv &&
    onboarding.hasSetPreferences &&
    onboarding.hasBrowsedJobs &&
    onboarding.hasFirstApplication;

  return (
    <>
      <WelcomeModal show={showWelcome} />
      <AppTopbar
        title="Dashboard"
        actions={
          <>
            <ThemeToggle />
            <button className="ds-btn" type="button">
              <Icon name="plus" size={14} /> Nuova ricerca
            </button>
          </>
        }
      />
      <div style={{ padding: "24px 32px 80px", maxWidth: 1480, width: "100%", margin: "0 auto" }}>
        <div className="mb-6">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h1
                style={{
                  fontSize: 22,
                  fontWeight: 600,
                  letterSpacing: "-0.022em",
                  margin: 0,
                }}
              >
                Buongiorno, {greetingName} 👋
              </h1>
              <p
                style={{
                  fontSize: 13.5,
                  color: "var(--fg-muted)",
                  marginTop: 4,
                }}
              >
                {totalCount > 0 ? (
                  <>
                    Hai inviato <strong style={{ color: "var(--fg)" }}>{totalCount} candidature</strong>{" "}
                    · {successCount} riuscite, {failedCount} fallite.
                  </>
                ) : (
                  <>
                    Benvenuto! Vai al{" "}
                    <Link
                      href="/jobs"
                      style={{ color: "var(--fg)", textDecoration: "underline" }}
                    >
                      Job board
                    </Link>{" "}
                    per inviare la tua prima candidatura.
                  </>
                )}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="ds-toggle-group">
                <button className="active" type="button">Oggi</button>
                <button type="button">7g</button>
                <button type="button">30g</button>
                <button type="button">Tutto</button>
              </div>
              <button className="ds-btn" type="button">
                <Icon name="download" size={13} /> Esporta
              </button>
            </div>
          </div>
        </div>

        {!allChecklistDone && (
          <div className="mb-6">
            <OnboardingChecklist state={onboarding} />
          </div>
        )}

        <div className="ds-kpi-grid">
          <Kpi
            index={0}
            label="Candidature totali"
            value={String(displayTotal)}
            delta={isEmpty ? "Nessuna ancora" : `+${displayToday} oggi`}
            up={!isEmpty}
            sparkData={isEmpty ? undefined : DAILY_APPLICATIONS_30D}
          />
          <Kpi
            index={1}
            label="Tasso di visualizzazione"
            value={viewRate}
            delta={isEmpty ? "In attesa dati" : "+4.2% vs settim."}
            up={!isEmpty}
            sparkData={isEmpty ? undefined : [45, 48, 52, 55, 58, 62]}
            sparkColor="var(--primary-ds)"
          />
          <Kpi
            index={2}
            label="Colloqui programmati"
            value={interviews}
            delta={isEmpty ? "Nessuno in calendario" : "3 questa settim."}
            up={!isEmpty}
            sparkData={isEmpty ? undefined : [2, 3, 3, 5, 7, 9, 11]}
            sparkColor="var(--amber)"
          />
          <Kpi
            index={3}
            label="Tempo risparmiato"
            value={isEmpty ? "0h" : "38h"}
            delta={isEmpty ? "Attiva auto-apply" : "≈ €1.140 valore"}
            up={!isEmpty}
            mono
          />
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 340px",
            gap: 20,
          }}
        >
          <div className="flex flex-col" style={{ gap: 20 }}>
            <SectionCard>
              <SectionHead
                icon={<Icon name="briefcase" size={15} />}
                title={
                  <>
                    Candidature recenti
                    <span className="ds-chip">{applications.length}</span>
                  </>
                }
                actions={
                  <>
                    <button className="ds-btn ds-btn-sm ds-btn-ghost" type="button">
                      <Icon name="filter" size={12} /> Filtra
                    </button>
                    <Link href="/applications" className="ds-btn ds-btn-sm">
                      Vedi tutto <Icon name="arrow-right" size={12} />
                    </Link>
                  </>
                }
              />
              <SectionBody flush>
                {applications.length === 0 ? (
                  <EmptyBlock
                    icon="briefcase"
                    title="Nessuna candidatura ancora"
                    body="Sfoglia il job board e lascia che LavorAI si candidi per te."
                    ctaHref="/jobs"
                    ctaLabel="Prova demo"
                  />
                ) : (
                <table className="ds-tbl">
                  <thead>
                    <tr>
                      <th style={{ width: "32%" }}>Azienda · Ruolo</th>
                      <th>Luogo</th>
                      <th>RAL</th>
                      <th>Match</th>
                      <th>Stato</th>
                      <th>Inviata</th>
                      <th style={{ width: 40 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {applications.slice(0, 8).map((a) => (
                      <tr key={a.id}>
                        <td>
                          <div className="flex items-center gap-2.5">
                            <CompanyLogo company={a.company} color={a.color} />
                            <div>
                              <div style={{ fontWeight: 500 }}>{a.company}</div>
                              <div
                                style={{ fontSize: 12, color: "var(--fg-muted)" }}
                              >
                                {a.role}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td style={{ color: "var(--fg-muted)" }}>
                          {a.location} · {a.mode}
                        </td>
                        <td className="mono" style={{ fontSize: 12 }}>
                          {a.salary}
                        </td>
                        <td>
                          <div className="flex items-center gap-2">
                            <div
                              style={{
                                width: 46,
                                height: 4,
                                background: "var(--bg-sunken)",
                                borderRadius: 3,
                                overflow: "hidden",
                              }}
                            >
                              <div
                                style={{
                                  width: `${a.match}%`,
                                  height: "100%",
                                  background:
                                    a.match >= 85
                                      ? "var(--primary-ds)"
                                      : a.match >= 75
                                        ? "var(--amber)"
                                        : "var(--fg-subtle)",
                                }}
                              />
                            </div>
                            <span className="mono" style={{ fontSize: 11 }}>
                              {a.match}
                            </span>
                          </div>
                        </td>
                        <td>
                          <StatusChip status={a.status} />
                        </td>
                        <td style={{ color: "var(--fg-muted)", fontSize: 12 }}>
                          {a.applied}
                        </td>
                        <td>
                          <Icon
                            name="chevron-right"
                            size={14}
                            style={{ color: "var(--fg-subtle)" }}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                )}
              </SectionBody>
            </SectionCard>

            <SectionCard>
              <SectionHead
                icon={<Icon name="chart" size={15} />}
                title="Candidature · ultimi 30 giorni"
                actions={
                  isEmpty ? null : (
                    <span
                      className="mono"
                      style={{ fontSize: 11.5, color: "var(--fg-muted)" }}
                    >
                      <span style={{ color: "var(--primary-ds)" }}>▲ 34%</span>{" "}
                      <span style={{ color: "var(--fg-subtle)" }}>
                        vs mese prec.
                      </span>
                    </span>
                  )
                }
              />
              <SectionBody>
                {isEmpty ? (
                  <EmptyBlock
                    icon="chart"
                    title="Ancora nessun dato"
                    body="Il grafico si popolerà con le tue candidature — di solito bastano pochi giorni."
                  />
                ) : (
                  <>
                    <div className="ds-chart-bars">
                      {DAILY_APPLICATIONS_30D.map((v, i) => (
                        <div
                          key={i}
                          className={`ds-chart-bar${i >= DAILY_APPLICATIONS_30D.length - 7 ? " accent" : ""}`}
                          style={{ height: `${(v / 22) * 100}%` }}
                          title={`${v} candidature`}
                        />
                      ))}
                    </div>
                    <div className="ds-chart-x">
                      <span>20 mar</span>
                      <span>27 mar</span>
                      <span>3 apr</span>
                      <span>10 apr</span>
                      <span>oggi</span>
                    </div>
                  </>
                )}
              </SectionBody>
            </SectionCard>
          </div>

          <div className="flex flex-col" style={{ gap: 20 }}>
            {!isEmpty && <LiveTicker />}

            <SectionCard>
              <SectionHead
                icon={<Icon name="sparkles" size={14} />}
                title="Prossime azioni"
              />
              <SectionBody flush>
                {isEmpty ? (
                  <EmptyBlock
                    title="Tutto tranquillo"
                    body="Quando ricevi risposte da recruiter o ci sono cose da fare, appariranno qui."
                    compact
                  />
                ) : (
                  <>
                    <ActionRow
                      icon="calendar"
                      title="Colloquio con Nexi"
                      meta="Domani 15:00 · Google Meet"
                      badge="domani"
                    />
                    <ActionRow
                      icon="edit"
                      title="Rispondi a Everli"
                      meta="Offerta ricevuta — 2 giorni per rispondere"
                      badge="urgente"
                      badgeColor="red"
                    />
                    <ActionRow
                      icon="file"
                      title="Completa CV"
                      meta="Mancano certificazioni — +12% match"
                      badge="suggerito"
                    />
                    <ActionRow
                      icon="target"
                      title="Amplia zone"
                      meta="Includi Bologna per +488 annunci"
                      badge="suggerito"
                      last
                    />
                  </>
                )}
              </SectionBody>
            </SectionCard>
          </div>
        </div>
      </div>
    </>
  );
}

function EmptyBlock({
  icon,
  title,
  body,
  ctaHref,
  ctaLabel,
  compact,
}: {
  icon?: "briefcase" | "chart" | "sparkles";
  title: string;
  body: string;
  ctaHref?: string;
  ctaLabel?: string;
  compact?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        textAlign: "center",
        padding: compact ? "28px 20px" : "52px 28px",
        gap: 10,
      }}
    >
      {icon && (
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 12,
            background: "var(--bg-sunken)",
            border: "1px solid var(--border-ds)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--fg-subtle)",
            marginBottom: 4,
          }}
        >
          <Icon name={icon} size={18} />
        </div>
      )}
      <div style={{ fontSize: 14, fontWeight: 600, letterSpacing: "-0.01em" }}>
        {title}
      </div>
      <div
        style={{
          fontSize: 12.5,
          color: "var(--fg-muted)",
          maxWidth: 320,
          lineHeight: 1.5,
        }}
      >
        {body}
      </div>
      {ctaHref && ctaLabel && (
        <Link
          href={ctaHref}
          className="ds-btn ds-btn-primary"
          style={{ marginTop: 8 }}
        >
          {ctaLabel} <Icon name="arrow-right" size={13} />
        </Link>
      )}
    </div>
  );
}

function ActionRow({
  icon,
  title,
  meta,
  badge,
  badgeColor,
  last,
}: {
  icon: "calendar" | "edit" | "file" | "target";
  title: string;
  meta: string;
  badge: string;
  badgeColor?: "red";
  last?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "12px 16px",
        borderBottom: last ? "none" : "1px solid var(--border-ds)",
        cursor: "pointer",
      }}
    >
      <div
        style={{
          width: 30,
          height: 30,
          borderRadius: 6,
          background: "var(--bg-sunken)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--fg-muted)",
          flexShrink: 0,
        }}
      >
        <Icon name={icon} size={14} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500 }}>{title}</div>
        <div style={{ fontSize: 11.5, color: "var(--fg-muted)", marginTop: 1 }}>
          {meta}
        </div>
      </div>
      <span className={`ds-chip${badgeColor === "red" ? " ds-chip-red" : ""}`}>
        {badge}
      </span>
    </div>
  );
}
