import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
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
  const t = await getTranslations("dashboardPage");
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

  // 7-day daily count per la mini bar chart. Sostituisce i 4 MiniStat
  // affollati con una visualizzazione che dice "stai performando meglio
  // o peggio degli ultimi giorni" a colpo d'occhio.
  const sevenDaysAgo = new Date(todayStart);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
  const lastWeekApps = await prisma.application.findMany({
    where: {
      userId: user.id,
      status: "success",
      submittedVia: { not: null },
      createdAt: { gte: sevenDaysAgo },
    },
    select: { createdAt: true },
  });
  const dailyCounts = Array.from({ length: 7 }, (_, i) => {
    const day = new Date(sevenDaysAgo);
    day.setDate(day.getDate() + i);
    const next = new Date(day);
    next.setDate(next.getDate() + 1);
    const count = lastWeekApps.filter(
      (a) => a.createdAt >= day && a.createdAt < next,
    ).length;
    const dayLabel = day
      .toLocaleDateString("it-IT", { weekday: "short" })
      .slice(0, 3);
    return { day: dayLabel, count, isToday: i === 6 };
  });

  // Niente target mensile fittizio: il progresso reale è per-round
  // nel widget SessionsStatus sotto. Qui mostriamo solo il counter.
  const autoMode = prefs?.autoApplyMode ?? "manual";
  const isLive = autoMode === "auto" || autoMode === "hybrid";
  const dailyCap = prefs?.dailyCap ?? 25;

  // Ultima attività auto-apply: timestamp dell'ultima candidatura creata.
  // Usata per mostrare "Ultima esecuzione: 2 ore fa" sotto l'header così
  // l'utente vede a colpo d'occhio che il sistema sta lavorando.
  const lastApp = await prisma.application.findFirst({
    where: { userId: user.id },
    select: { createdAt: true },
    orderBy: { createdAt: "desc" },
  });
  // Prossima run: prossima delle 3 ore tattiche (08/12/16 UTC).
  const nextRun = (() => {
    const nowUtc = new Date();
    const hour = nowUtc.getUTCHours();
    const tactical = [8, 12, 16];
    const next = tactical.find((h) => h > hour) ?? tactical[0];
    const nextDate = new Date(nowUtc);
    if (next <= hour) nextDate.setUTCDate(nextDate.getUTCDate() + 1);
    nextDate.setUTCHours(next, 0, 0, 0);
    return nextDate;
  })();

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
        title={t("title")}
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
            {t("greeting", { name: greetingName })}
          </h1>
          <p
            style={{
              fontSize: 13.5,
              color: "var(--fg-muted)",
              marginTop: 4,
            }}
          >
            {deliveredMonth > 0
              ? viewedMonth > 0
                ? t("subtitleWithViews", {
                    sent: deliveredMonth,
                    viewed: viewedMonth,
                  })
                : t("subtitleSentOnly", { sent: deliveredMonth })
              : t("subtitleEmpty")}
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
                {isLive ? t("autoApplyActive") : t("autoApplyPaused")}
              </div>

              {/* Activity timeline: ultima esecuzione + prossima run tattica.
                  Mostra all'utente che il sistema sta lavorando con ritmo
                  prevedibile (3 batch/giorno alle 08/12/16 UTC). */}
              {isLive && (
                <ActivityIndicator
                  lastRunAt={lastApp?.createdAt ?? null}
                  nextRunAt={nextRun}
                  lastLabel={t("activityLastRun")}
                  nextLabel={t("activityNextRun")}
                  neverLabel={t("activityNever")}
                />
              )}

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
                {t("appsThisMonth")}
              </div>
            </div>

            {/* Mini bar chart 7 giorni — sostituisce le 4 MiniStat
                inline che affollavano la riga. A colpo d'occhio: trend
                settimanale + posizione di oggi rispetto agli altri giorni. */}
            <WeeklyChart
              data={dailyCounts}
              ariaLabel={t("weeklyChartAriaLabel")}
            />
          </div>

          {/* Daily cap progress bar — visuale del consumo del cap
              giornaliero. Sostituisce la lettura mentale "deliveredToday
              / dailyCap". */}
          <DailyCapBar
            sent={deliveredToday}
            cap={dailyCap}
            label={t("dailyCapLabel", { sent: deliveredToday, cap: dailyCap })}
          />

          {/* Pipeline secondaria — più piccola, sotto la cap bar */}
          <div
            style={{
              display: "flex",
              gap: 22,
              marginTop: 18,
              flexWrap: "wrap",
              fontSize: 12,
              color: "var(--fg-muted)",
            }}
          >
            <PipelineStat label={t("statQueued")} value={pendingCount} />
            <PipelineStat
              label={t("statSending")}
              value={applyingCount}
              live
            />
            {/* "Viste" mostrato solo quando > 0: il dato arriva quando il
                recruiter clicca il tracking link `lavorai.it/r/<token>`
                dentro la cover letter dall'ATS. Mostrare uno 0 statico
                quando non c'è ancora alcun click dà un segnale fuorviante. */}
            {viewedMonth > 0 && (
              <PipelineStat
                label={t("statOpened")}
                value={viewedMonth}
              />
            )}
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
                {applications.slice(0, 5).map((a) => (
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

/**
 * 7-day bar chart compatto delle candidature inviate. Sostituisce
 * 4 MiniStat lineari con UNA visualizzazione che dice trend + posizione
 * di oggi a colpo d'occhio. Pure-CSS (nessuna libreria charting → 0 KB
 * di overhead).
 */
function WeeklyChart({
  data,
  ariaLabel,
}: {
  data: Array<{ day: string; count: number; isToday: boolean }>;
  ariaLabel: string;
}) {
  const max = Math.max(1, ...data.map((d) => d.count));
  return (
    <div
      role="img"
      aria-label={ariaLabel}
      style={{
        display: "flex",
        alignItems: "flex-end",
        gap: 6,
        height: 60,
        marginTop: 16,
        flexWrap: "nowrap",
      }}
    >
      {data.map((d, i) => {
        const heightPct = (d.count / max) * 100;
        return (
          <div
            key={i}
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 4,
              minWidth: 0,
            }}
          >
            <div
              style={{
                fontSize: 10,
                color: "var(--fg-subtle)",
                fontFeatureSettings: '"tnum"',
                opacity: d.count > 0 ? 1 : 0.4,
                lineHeight: 1,
              }}
            >
              {d.count}
            </div>
            <div
              title={`${d.day}: ${d.count}`}
              style={{
                width: "100%",
                maxWidth: 28,
                height: `${Math.max(2, heightPct * 0.4)}px`,
                minHeight: 2,
                background: d.isToday
                  ? "hsl(var(--primary))"
                  : d.count > 0
                    ? "hsl(var(--primary) / 0.35)"
                    : "var(--border-ds)",
                borderRadius: 3,
                transition: "background 0.2s",
              }}
            />
            <div
              style={{
                fontSize: 10,
                color: d.isToday ? "var(--fg)" : "var(--fg-subtle)",
                fontWeight: d.isToday ? 600 : 400,
                textTransform: "lowercase",
                lineHeight: 1,
              }}
            >
              {d.day}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Progress bar visiva dell'utilizzo del cap giornaliero. Più immediato
 * di "22 / 33 oggi" testuale.
 */
function DailyCapBar({
  sent,
  cap,
  label,
}: {
  sent: number;
  cap: number;
  label: string;
}) {
  const pct = Math.min(100, cap > 0 ? (sent / cap) * 100 : 0);
  return (
    <div style={{ marginTop: 24 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: 6,
          fontSize: 11.5,
          color: "var(--fg-muted)",
        }}
      >
        <span>{label}</span>
      </div>
      <div
        style={{
          height: 6,
          borderRadius: 999,
          background: "var(--border-ds)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${pct}%`,
            background: "hsl(var(--primary))",
            transition: "width 0.4s ease",
          }}
        />
      </div>
    </div>
  );
}

/**
 * Activity indicator: "Ultima run: 2 ore fa · Prossima: oggi 16:00".
 * Dà all'utente un ritmo prevedibile dell'auto-apply (3 batch/giorno).
 */
function ActivityIndicator({
  lastRunAt,
  nextRunAt,
  lastLabel,
  nextLabel,
  neverLabel,
}: {
  lastRunAt: Date | null;
  nextRunAt: Date;
  lastLabel: string;
  nextLabel: string;
  neverLabel: string;
}) {
  return (
    <div
      style={{
        marginTop: 10,
        fontSize: 11.5,
        color: "var(--fg-muted)",
        display: "flex",
        gap: 16,
        flexWrap: "wrap",
        alignItems: "center",
      }}
    >
      <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
        <span
          style={{
            width: 5,
            height: 5,
            borderRadius: "50%",
            background: lastRunAt ? "hsl(var(--primary))" : "var(--fg-subtle)",
            opacity: 0.7,
          }}
        />
        {lastLabel}:{" "}
        <strong style={{ color: "var(--fg)", fontWeight: 500 }}>
          {lastRunAt ? formatRelativeTime(lastRunAt) : neverLabel}
        </strong>
      </span>
      <span style={{ opacity: 0.4 }}>·</span>
      <span>
        {nextLabel}:{" "}
        <strong style={{ color: "var(--fg)", fontWeight: 500 }}>
          {formatNextRun(nextRunAt)}
        </strong>
      </span>
    </div>
  );
}

function formatRelativeTime(d: Date): string {
  const diffMin = Math.round((Date.now() - d.getTime()) / 60_000);
  if (diffMin < 1) return "ora";
  if (diffMin < 60) return `${diffMin} min fa`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `${diffH}h fa`;
  const diffD = Math.round(diffH / 24);
  return diffD === 1 ? "ieri" : `${diffD}g fa`;
}

function formatNextRun(d: Date): string {
  const isToday = d.toDateString() === new Date().toDateString();
  const hh = d.getHours().toString().padStart(2, "0");
  const mm = d.getMinutes().toString().padStart(2, "0");
  return isToday ? `oggi ${hh}:${mm}` : `domani ${hh}:${mm}`;
}

/**
 * Compact secondary pipeline stat — più piccolo del vecchio MiniStat,
 * sta su una riga senza occupare lo spazio del numero hero.
 */
function PipelineStat({
  label,
  value,
  live,
}: {
  label: string;
  value: number;
  live?: boolean;
}) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontFeatureSettings: '"tnum"',
      }}
    >
      <strong
        style={{ color: "var(--fg)", fontWeight: 600, fontSize: 13 }}
      >
        {value}
      </strong>
      {live && value > 0 && (
        <span
          style={{
            width: 5,
            height: 5,
            borderRadius: "50%",
            background: "hsl(38 92% 60%)",
            animation: "pulse-dot 1.6s ease-in-out infinite",
          }}
        />
      )}
      <span>{label.toLowerCase()}</span>
    </span>
  );
}
