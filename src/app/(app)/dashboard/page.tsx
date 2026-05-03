import type { Metadata } from "next";
import Link from "next/link";
import { AppTopbar } from "@/components/design/topbar";
import { Icon } from "@/components/design/icon";
import { CompanyLogo } from "@/components/design/company-logo";
import { StatusChip } from "@/components/design/status-chip";
import {
  SectionCard,
  SectionHead,
  SectionBody,
} from "@/components/design/section-card";
import { ThemeToggle } from "@/components/design/theme-toggle";
import { OnboardingChecklist } from "@/components/onboarding-checklist";
import { WelcomeModal } from "@/components/welcome-modal";
import { DashboardLiveRefresh } from "@/components/dashboard-live-refresh";
import { SessionsStatus } from "@/components/sessions-status";
import { PostLoginCheckout } from "@/components/post-login-checkout";
import { AutoApplyToggle } from "@/components/auto-apply-toggle";
import { getUIApplications } from "@/lib/ui-applications";
import { getCurrentUser } from "@/lib/session";
import { getOnboardingState } from "@/lib/onboarding";
import { prisma } from "@/lib/db";

export const metadata: Metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

/**
 * Dashboard come "Live System": un'unica vista col solo focus che conta
 * — auto-apply attivo, progresso del mese, lista candidature live.
 * Niente KPI grid, niente checklist se completata, niente fronzoli.
 */
export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  const [applications, onboarding, prefs] = await Promise.all([
    getUIApplications(user.id),
    getOnboardingState(user.id),
    prisma.userPreferences.findUnique({
      where: { userId: user.id },
      select: { autoApplyMode: true, dailyCap: true },
    }),
  ]);
  const greetingName = (user.name ?? user.email.split("@")[0]).split(/\s+/)[0];
  const showWelcome = !user.welcomeSeenAt;

  // Counts su tutta la pipeline (non solo delivered).
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const todayStart = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  );

  const [
    deliveredMonth,
    deliveredToday,
    viewedMonth,
    pendingCount,
    applyingCount,
    failedMonth,
  ] = await Promise.all([
    prisma.application.count({
      where: {
        userId: user.id,
        status: "success",
        submittedVia: { not: null },
        createdAt: { gte: monthStart },
      },
    }),
    prisma.application.count({
      where: {
        userId: user.id,
        status: "success",
        submittedVia: { not: null },
        createdAt: { gte: todayStart },
      },
    }),
    prisma.application.count({
      where: {
        userId: user.id,
        status: "success",
        submittedVia: { not: null },
        viewedAt: { not: null },
        createdAt: { gte: monthStart },
      },
    }),
    prisma.application.count({
      where: {
        userId: user.id,
        status: { in: ["awaiting_consent", "queued", "ready_to_apply"] },
      },
    }),
    prisma.application.count({
      where: {
        userId: user.id,
        status: { in: ["optimizing", "applying"] },
      },
    }),
    prisma.application.count({
      where: {
        userId: user.id,
        status: "failed",
        createdAt: { gte: monthStart },
      },
    }),
  ]);

  // Niente target mensile fittizio: il progresso reale è per-round
  // nel widget SessionsStatus sotto. Qui mostriamo solo il counter.
  const autoMode = prefs?.autoApplyMode ?? "manual";
  const isLive = autoMode === "auto" || autoMode === "hybrid";

  const allChecklistDone =
    onboarding.hasUploadedCv &&
    onboarding.hasSetPreferences &&
    onboarding.hasFirstApplication;

  return (
    <>
      <WelcomeModal show={showWelcome} />
      <PostLoginCheckout />
      <DashboardLiveRefresh />
      <AppTopbar
        title="Dashboard"
        actions={
          <>
            <ThemeToggle />
            <AutoApplyToggle />
          </>
        }
      />

      <div
        style={{
          padding: "24px 32px 80px",
          maxWidth: 1180,
          width: "100%",
          margin: "0 auto",
        }}
      >
        {/* Greeting compatto */}
        <div className="mb-6">
          <h1
            style={{
              fontSize: 22,
              fontWeight: 600,
              letterSpacing: "-0.022em",
              margin: 0,
            }}
          >
            Ciao, {greetingName}.
          </h1>
          <p
            style={{
              fontSize: 13.5,
              color: "var(--fg-muted)",
              marginTop: 4,
            }}
          >
            {deliveredMonth > 0
              ? `${deliveredMonth} ${deliveredMonth === 1 ? "candidatura inviata" : "candidature inviate"} questo mese${viewedMonth > 0 ? ` · ${viewedMonth} ${viewedMonth === 1 ? "aperta" : "aperte"}` : ""}.`
              : "Imposta i tuoi ruoli e attiva l'auto-apply per iniziare."}
          </p>
        </div>

        {/* Onboarding checklist solo se incompleto */}
        {!allChecklistDone && (
          <div className="mb-6">
            <OnboardingChecklist state={onboarding} />
          </div>
        )}

        {/* Round attivi + prompt round completati */}
        <div className="mb-6" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <SessionsStatus />
        </div>

        {/* PROGRESS HERO — il cuore della dashboard */}
        <div
          style={{
            position: "relative",
            padding: "26px 28px",
            borderRadius: 16,
            border: "1px solid var(--border-ds)",
            background:
              "linear-gradient(180deg, hsl(var(--primary)/0.08), transparent 90%)",
            marginBottom: 24,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: 16,
              flexWrap: "wrap",
            }}
          >
            <div style={{ flex: 1, minWidth: 240 }}>
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 11.5,
                  fontWeight: 500,
                  padding: "3px 10px",
                  borderRadius: 999,
                  background: isLive
                    ? "hsl(var(--primary)/0.15)"
                    : "var(--bg-sunken)",
                  color: isLive ? "hsl(var(--primary))" : "var(--fg-muted)",
                  border: isLive
                    ? "1px solid hsl(var(--primary)/0.3)"
                    : "1px solid var(--border-ds)",
                }}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: isLive
                      ? "hsl(var(--primary))"
                      : "var(--fg-subtle)",
                    animation: isLive
                      ? "pulse-dot 1.6s ease-in-out infinite"
                      : "none",
                  }}
                />
                {isLive ? "Auto-apply attivo" : "Auto-apply in pausa"}
              </div>

              <div
                style={{
                  marginTop: 12,
                  fontSize: 36,
                  fontWeight: 600,
                  letterSpacing: "-0.025em",
                  lineHeight: 1.05,
                  fontFeatureSettings: '"tnum"',
                }}
              >
                {deliveredMonth}
              </div>
              <div
                style={{
                  fontSize: 13,
                  color: "var(--fg-muted)",
                  marginTop: 2,
                }}
              >
                candidature inviate questo mese
              </div>
            </div>

            <div
              style={{
                display: "flex",
                gap: 18,
                marginTop: 4,
                flexWrap: "wrap",
              }}
            >
              <MiniStat label="Oggi" value={deliveredToday} />
              <MiniStat label="In coda" value={pendingCount} />
              <MiniStat label="In invio" value={applyingCount} live />
              <MiniStat label="Aperte" value={viewedMonth} />
            </div>
          </div>

        </div>

        {/* Live applications list */}
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
              applications.length > 0 ? (
                <Link href="/applications" className="ds-btn ds-btn-sm">
                  Vedi tutto
                </Link>
              ) : null
            }
          />
          <SectionBody flush>
            {applications.length === 0 ? (
              <div
                style={{
                  padding: "60px 24px",
                  textAlign: "center",
                }}
              >
                <Icon
                  name="briefcase"
                  size={28}
                  style={{ color: "var(--fg-subtle)" }}
                />
                <div
                  style={{
                    marginTop: 14,
                    fontWeight: 500,
                    fontSize: 14,
                  }}
                >
                  Nessuna candidatura ancora
                </div>
                <div
                  style={{
                    marginTop: 6,
                    fontSize: 13,
                    color: "var(--fg-muted)",
                    maxWidth: 360,
                    margin: "6px auto 0",
                  }}
                >
                  Imposta i tuoi ruoli in Preferenze e attiva l&apos;auto-apply.
                  La prima candidatura parte entro 30 minuti.
                </div>
                <Link
                  href="/preferences"
                  className="ds-btn ds-btn-primary"
                  style={{
                    marginTop: 18,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <Icon name="zap" size={13} /> Avvia l&apos;auto-apply
                </Link>
              </div>
            ) : (
              <div>
                {applications.slice(0, 8).map((a) => (
                  <Link
                    href={`/applications`}
                    key={a.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "14px 18px",
                      borderBottom: "1px solid var(--border-ds)",
                      textDecoration: "none",
                      color: "inherit",
                      transition: "background 0.15s",
                    }}
                    className="hover:bg-[var(--bg-elev)]"
                  >
                    <CompanyLogo company={a.company} color={a.color} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 14,
                          fontWeight: 500,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {a.company}
                      </div>
                      <div
                        style={{
                          fontSize: 12.5,
                          color: "var(--fg-muted)",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {a.role} · {a.location}
                      </div>
                    </div>
                    <div
                      className="hidden md:block"
                      style={{
                        fontSize: 12,
                        color: "var(--fg-muted)",
                        fontFeatureSettings: '"tnum"',
                        minWidth: 70,
                        textAlign: "right",
                      }}
                    >
                      {a.applied}
                    </div>
                    <div style={{ minWidth: 90, textAlign: "right" }}>
                      <StatusChip status={a.status} />
                    </div>
                    <Icon
                      name="chevron-right"
                      size={14}
                      style={{ color: "var(--fg-subtle)" }}
                    />
                  </Link>
                ))}
                {failedMonth > 0 && (
                  <div
                    style={{
                      padding: "12px 18px",
                      fontSize: 12.5,
                      color: "var(--fg-muted)",
                      borderBottom: "1px solid var(--border-ds)",
                      background: "var(--bg-elev)",
                    }}
                  >
                    {failedMonth} candidatur{failedMonth === 1 ? "a" : "e"}{" "}
                    fallit{failedMonth === 1 ? "a" : "e"} questo mese — non incluse
                    sopra.
                  </div>
                )}
              </div>
            )}
          </SectionBody>
        </SectionCard>
      </div>

      <style>{`
        @keyframes pulse-dot {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(1.4); }
        }
      `}</style>
    </>
  );
}

function MiniStat({
  label,
  value,
  live,
}: {
  label: string;
  value: number;
  live?: boolean;
}) {
  return (
    <div style={{ minWidth: 64 }}>
      <div
        style={{
          fontSize: 22,
          fontWeight: 600,
          letterSpacing: "-0.02em",
          fontFeatureSettings: '"tnum"',
          display: "inline-flex",
          alignItems: "baseline",
          gap: 6,
        }}
      >
        {value}
        {live && value > 0 && (
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: "hsl(38 92% 60%)",
              animation: "pulse-dot 1.6s ease-in-out infinite",
              alignSelf: "center",
            }}
          />
        )}
      </div>
      <div
        style={{
          fontSize: 11.5,
          color: "var(--fg-muted)",
          marginTop: 2,
        }}
      >
        {label}
      </div>
    </div>
  );
}
