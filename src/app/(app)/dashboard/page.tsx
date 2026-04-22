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
import { ThemeToggle } from "@/components/design/theme-toggle";
import { OnboardingChecklist } from "@/components/onboarding-checklist";
import { WelcomeModal } from "@/components/welcome-modal";
import { PostLoginCheckout } from "@/components/post-login-checkout";
import { getUIApplications } from "@/lib/ui-applications";
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
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const week1Start = new Date(todayStart.getTime() - 7 * 86400_000);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const thirtyStart = new Date(todayStart.getTime() - 29 * 86400_000);

  const [totalCount, todayCount, successCount, failedCount, last7Count, thisMonthCount, prevMonthCount, last30] = await Promise.all([
    prisma.application.count({ where: { userId: user.id } }),
    prisma.application.count({ where: { userId: user.id, createdAt: { gte: todayStart } } }),
    prisma.application.count({ where: { userId: user.id, status: "success" } }),
    prisma.application.count({ where: { userId: user.id, status: "failed" } }),
    prisma.application.count({ where: { userId: user.id, createdAt: { gte: week1Start } } }),
    prisma.application.count({ where: { userId: user.id, createdAt: { gte: monthStart } } }),
    prisma.application.count({
      where: { userId: user.id, createdAt: { gte: prevMonthStart, lt: monthStart } },
    }),
    prisma.application.findMany({
      where: { userId: user.id, createdAt: { gte: thirtyStart } },
      select: { createdAt: true },
    }),
  ]);

  // 30d daily buckets (oldest first)
  const daily30: number[] = Array.from({ length: 30 }, () => 0);
  for (const a of last30) {
    const idx = Math.floor(
      (a.createdAt.getTime() - thirtyStart.getTime()) / 86400_000,
    );
    if (idx >= 0 && idx < 30) daily30[idx]++;
  }
  const daily30Max = Math.max(1, ...daily30);

  const isEmpty = totalCount === 0;
  const successRate =
    totalCount === 0
      ? "—"
      : `${Math.round((successCount / totalCount) * 100)}%`;
  // Stima tempo risparmiato: ~15 minuti per candidatura
  const savedMinutes = totalCount * 15;
  const savedLabel =
    savedMinutes < 60
      ? `${savedMinutes}m`
      : `${Math.floor(savedMinutes / 60)}h${
          savedMinutes % 60 > 0 ? ` ${savedMinutes % 60}m` : ""
        }`;
  const monthDelta =
    prevMonthCount === 0
      ? thisMonthCount > 0
        ? "+100%"
        : "—"
      : `${thisMonthCount >= prevMonthCount ? "+" : ""}${Math.round(
          ((thisMonthCount - prevMonthCount) / prevMonthCount) * 100,
        )}%`;

  const allChecklistDone =
    onboarding.hasUploadedCv &&
    onboarding.hasSetPreferences &&
    onboarding.hasBrowsedJobs &&
    onboarding.hasFirstApplication;

  return (
    <>
      <WelcomeModal show={showWelcome} />
      <PostLoginCheckout />
      <AppTopbar
        title="Dashboard"
        actions={
          <>
            <ThemeToggle />
            <Link href="/jobs" className="ds-btn">
              <Icon name="plus" size={14} /> Nuova ricerca
            </Link>
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
            value={String(totalCount)}
            delta={isEmpty ? "Nessuna ancora" : `+${todayCount} oggi`}
            up={!isEmpty}
            sparkData={isEmpty ? undefined : daily30}
          />
          <Kpi
            index={1}
            label="Ultimi 7 giorni"
            value={String(last7Count)}
            delta={isEmpty ? "In attesa dati" : `${thisMonthCount} questo mese`}
            up={!isEmpty}
          />
          <Kpi
            index={2}
            label="Tasso successo"
            value={successRate}
            delta={
              isEmpty
                ? "In attesa dati"
                : `${successCount} riuscite · ${failedCount} fallite`
            }
            up={successCount > failedCount}
            sparkColor="var(--primary-ds)"
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
                  <Link href="/applications" className="ds-btn ds-btn-sm">
                    Vedi tutto <Icon name="arrow-right" size={12} />
                  </Link>
                }
              />
              <SectionBody flush>
                {applications.length === 0 ? (
                  <EmptyBlock
                    icon="briefcase"
                    title="Nessuna candidatura ancora"
                    body="Sfoglia il job board e lascia che LavorAI si candidi per te."
                    ctaHref="/jobs"
                    ctaLabel="Candidati"
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
                      <span
                        style={{
                          color: monthDelta.startsWith("+")
                            ? "var(--primary-ds)"
                            : "var(--fg-subtle)",
                        }}
                      >
                        {monthDelta}
                      </span>{" "}
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
                      {daily30.map((v, i) => (
                        <div
                          key={i}
                          className={`ds-chart-bar${i >= daily30.length - 7 ? " accent" : ""}`}
                          style={{
                            height: `${Math.max(4, (v / daily30Max) * 100)}%`,
                            opacity: v === 0 ? 0.35 : 1,
                          }}
                          title={`${v} candidature`}
                        />
                      ))}
                    </div>
                    <div className="ds-chart-x">
                      <span>30g fa</span>
                      <span>21g fa</span>
                      <span>14g fa</span>
                      <span>7g fa</span>
                      <span>oggi</span>
                    </div>
                  </>
                )}
              </SectionBody>
            </SectionCard>
          </div>

          <div className="flex flex-col" style={{ gap: 20 }}>
            <SectionCard>
              <SectionHead
                icon={<Icon name="sparkles" size={14} />}
                title="Prossime azioni"
              />
              <SectionBody flush>
                <NextActions
                  hasCv={onboarding.hasUploadedCv}
                  hasPrefs={onboarding.hasSetPreferences}
                  hasApplications={totalCount > 0}
                  hasBrowsedJobs={onboarding.hasBrowsedJobs}
                />
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

function NextActions({
  hasCv,
  hasPrefs,
  hasApplications,
  hasBrowsedJobs,
}: {
  hasCv: boolean;
  hasPrefs: boolean;
  hasApplications: boolean;
  hasBrowsedJobs: boolean;
}) {
  const actions: Array<{
    href: string;
    icon: "file" | "target" | "briefcase" | "sparkles";
    title: string;
    meta: string;
    badge: string;
    badgeColor?: "red";
  }> = [];

  if (!hasCv) {
    actions.push({
      href: "/onboarding",
      icon: "file",
      title: "Carica il tuo CV",
      meta: "Serve per poter candidarti in automatico",
      badge: "richiesto",
      badgeColor: "red",
    });
  }
  if (!hasPrefs) {
    actions.push({
      href: "/preferences",
      icon: "target",
      title: "Imposta le preferenze",
      meta: "Ruoli, sedi e RAL che ti interessano",
      badge: "richiesto",
      badgeColor: "red",
    });
  }
  if (hasCv && !hasBrowsedJobs) {
    actions.push({
      href: "/jobs",
      icon: "briefcase",
      title: "Sfoglia il job board",
      meta: "Posizioni vere filtrate sulle tue preferenze",
      badge: "suggerito",
    });
  }
  if (hasCv && hasPrefs && !hasApplications) {
    actions.push({
      href: "/jobs",
      icon: "sparkles",
      title: "Invia la prima candidatura",
      meta: "Scegli un annuncio e clicca Candidati",
      badge: "inizia",
    });
  }
  if (hasApplications) {
    actions.push({
      href: "/cv",
      icon: "file",
      title: "Affina il tuo CV",
      meta: "Aggiungi bullet e skill per un match migliore",
      badge: "suggerito",
    });
    actions.push({
      href: "/jobs",
      icon: "briefcase",
      title: "Cerca altre posizioni",
      meta: "Nuovi annunci compatibili ogni giorno",
      badge: "",
    });
  }

  if (actions.length === 0) {
    return (
      <div
        style={{
          padding: "28px 20px",
          textAlign: "center",
          color: "var(--fg-muted)",
          fontSize: 13,
        }}
      >
        Tutto a posto per ora.
      </div>
    );
  }

  return (
    <>
      {actions.map((a, i) => (
        <Link
          key={i}
          href={a.href}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "12px 16px",
            borderBottom:
              i === actions.length - 1 ? "none" : "1px solid var(--border-ds)",
            color: "inherit",
            textDecoration: "none",
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
            <Icon name={a.icon} size={14} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 500 }}>{a.title}</div>
            <div
              style={{
                fontSize: 11.5,
                color: "var(--fg-muted)",
                marginTop: 1,
              }}
            >
              {a.meta}
            </div>
          </div>
          {a.badge ? (
            <span
              className={`ds-chip${a.badgeColor === "red" ? " ds-chip-red" : ""}`}
            >
              {a.badge}
            </span>
          ) : null}
        </Link>
      ))}
    </>
  );
}
