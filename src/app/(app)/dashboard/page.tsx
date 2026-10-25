import type { Metadata } from "next";
import Link from "next/link";
import { getLocale } from "next-intl/server";
import {
  ArrowRight,
  Briefcase,
  CalendarCheck,
  Check,
  ChevronRight,
  CircleAlert,
  Clock,
  Compass,
  FileText,
  MapPin,
  MessageSquare,
  Send,
  TrendingUp,
  Trophy,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { getAttentionQueue } from "@/lib/attention-repository";
import { AppTopbar } from "@/components/design/topbar";
import { WelcomeModal } from "@/components/welcome-modal";
import { DashboardLiveRefresh } from "@/components/dashboard-live-refresh";
import { PostLoginCheckout } from "@/components/post-login-checkout";
import { NewSearchButton } from "@/components/new-search-button";
import { getCurrentUser } from "@/lib/session";
import { getOnboardingState } from "@/lib/onboarding";
import { prisma } from "@/lib/db";
import { rowToProfile } from "@/lib/cv-profile-types";
import { STAGE_LABEL } from "@/lib/ui-application-status";
import {
  applicationStage,
  getApplicationStageCounts,
  getRecruiterReplies,
  getOffers,
  getInterviewInvites,
  getMatchingOpportunityCount,
  getDashboardTimeSeries,
} from "@/lib/dashboard-metrics-shared";
import { Sparkline } from "@/components/ui-premium/sparkline";
import { TrendChart, TrendLegend } from "@/components/ui-premium/trend-chart";
import { KpiCard } from "@/components/ui-premium/kpi-card";
import { Pill } from "@/components/ui-premium/pill";
import { Avatar } from "@/components/ui-premium/avatar";
import { EmptyState as Empty } from "@/components/ui-premium/empty-state";
import { StatusBar } from "@/components/ui-premium/status-bar";
import { STAGE_ORDER, STAGE_TONE } from "@/components/ui-premium/tone";
import "./dashboard.css";

export const metadata: Metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

/**
 * Dashboard (redesign 2026-10).
 *
 * Answers "what's happening, what needs me, what's next" with evidence-backed
 * counts only: a full-width row of 4 KPIs, then a main column (to-do, progress,
 * activity) and a ~1/3 sidebar (CV, profile, interviews, discover).
 * No greeting, no globe, no fabricated numbers, no admin UI.
 */

export default async function DashboardPage() {
  const [locale, user] = await Promise.all([getLocale(), getCurrentUser()]);
  if (!user) return null;

  const en = locale === "en";
  const tr = (it: string, english: string) => (en ? english : it);
  const lang = en ? "en" : "it";

  const [
    stageData,
    replies,
    interviews,
    offers,
    opportunities,
    latestCv,
    cvProfileRow,
    onboarding,
    attention,
    recentInterviews,
    recentActivity,
    series,
  ] = await Promise.all([
    getApplicationStageCounts(user.id),
    getRecruiterReplies(user.id),
    getInterviewInvites(user.id),
    getOffers(user.id),
    getMatchingOpportunityCount(user.id),
    prisma.cVDocument.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      select: { originalFilename: true, createdAt: true },
    }),
    prisma.cVProfile.findUnique({ where: { userId: user.id } }),
    getOnboardingState(user.id),
    getAttentionQueue(user.id, locale).catch(() => null),
    prisma.application.findMany({
      where: { userId: user.id, OR: [{ userStatus: "colloquio" }, { lastReplyKind: "colloquio" }] },
      orderBy: { lastReplyAt: "desc" },
      take: 3,
      select: { id: true, lastReplyAt: true, job: { select: { title: true, company: true } } },
    }),
    prisma.application.findMany({
      where: { userId: user.id, status: { not: "diagnostic" } },
      orderBy: { createdAt: "desc" },
      take: 6,
      select: {
        id: true,
        createdAt: true,
        status: true,
        submittedVia: true,
        submitConfirmation: true,
        submissionReceiptJson: true,
        emailAttempts: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { status: true, providerEmailId: true, acceptedAt: true },
        },
        job: { select: { title: true, company: true } },
      },
    }),
    getDashboardTimeSeries(user.id).catch(() => null),
  ]);

  // ── Progress by journey stage ────────────────────────────────────────
  // Evidence-aware stages: "sent" is confirmed-with-proof only.
  // Legacy success+submittedAt rows are "sent_unverified", not "Esito da verificare".
  const { total: totalApplications, stages: stageCounts } = stageData;
  const confirmed = stageCounts.sent;
  const sentUnverified = stageCounts.sent_unverified;
  const stages = STAGE_ORDER.map((stage) => ({ stage, count: stageCounts[stage] })).filter((s) => s.count > 0);
  const trendHasData = !!series && series.weeks.some((w) => w.sent > 0 || w.replies > 0);

  const trendSeriesMeta = [
    { key: "sent" as const, label: tr("Invii confermati", "Confirmed sends"), tone: "green" as const },
    { key: "replies" as const, label: tr("Risposte recruiter", "Recruiter replies"), tone: "neutral" as const },
  ];

  const activity = recentActivity.map((app) => ({ ...app, stage: applicationStage(app) }));

  const cvProfile = cvProfileRow ? rowToProfile(cvProfileRow) : null;
  const hasCv = !!latestCv || !!cvProfile;
  const cvName = [cvProfile?.firstName, cvProfile?.lastName].filter(Boolean).join(" ") || user.name || "";

  const hasAccessCard = user.subscriptionStatus === "active" || user.subscriptionStatus === "trialing";
  const profileChecklist = [
    { label: tr("Email verificata", "Email verified"), done: !!user.emailVerified, href: "/settings" },
    { label: tr("CV caricato", "CV uploaded"), done: hasCv, href: "/cv" },
    { label: tr("Preferenze impostate", "Preferences set"), done: !!onboarding?.hasSetPreferences, href: "/preferences" },
    { label: tr("Metodo di pagamento", "Payment method"), done: hasAccessCard, href: "/settings" },
  ];
  const profileDone = profileChecklist.filter((i) => i.done).length;

  // ── To-do: real attention items, else the next onboarding step ───────
  const items = attention?.items ?? [];
  const rest = items.slice(1, 5);
  const fallbackNext = !onboarding?.hasVerifiedEmail
    ? { href: "/verify-email", title: tr("Verifica la tua email", "Verify your email"), detail: tr("Serve per inviare candidature a tuo nome.", "Needed to send applications on your behalf.") }
    : !onboarding?.hasUploadedCv
      ? { href: "/cv", title: tr("Carica il tuo CV", "Upload your CV"), detail: tr("È la base di ogni candidatura su misura.", "It is the base of every tailored application.") }
      : !onboarding?.hasSetPreferences
        ? { href: "/preferences", title: tr("Imposta le preferenze", "Set your preferences"), detail: tr("Ruoli, città e tipo di contratto.", "Roles, cities and contract type.") }
        : { href: "/discover", title: tr("Scegli il prossimo ruolo", "Choose your next role"), detail: tr("Esplora le offerte aperte.", "Explore open roles.") };
  const next = items[0] ?? fallbackNext;

  const kpis: { key: string; label: string; value: number; hint: string; href: string; icon: LucideIcon; daily: number[] | null; noHistory?: string }[] = [
    { key: "confirmed", label: tr("Invii confermati", "Confirmed sends"), value: confirmed, hint: tr("con prova di consegna", "with delivery evidence"), href: "/applications?filter=sent", icon: Send, daily: series?.daily.confirmed ?? null },
    { key: "sent_unverified", label: tr("Invii registrati, senza conferma", "Recorded sends, unconfirmed"), value: sentUnverified, hint: tr("inviate, senza ricevuta verificabile", "sent, without a verifiable receipt"), href: "/applications?filter=sent_unverified", icon: CircleAlert, daily: null },
    { key: "replies", label: tr("Risposte recruiter", "Recruiter replies"), value: replies, hint: tr("candidature con risposta", "applications with a reply"), href: "/inbox", icon: MessageSquare, daily: series?.daily.replies ?? null },
    { key: "interviews", label: tr("Colloqui", "Interviews"), value: interviews, hint: tr("inviti ricevuti", "invites received"), href: "/interview", icon: CalendarCheck, daily: series?.daily.interviews ?? null },
    { key: "offers", label: tr("Offerte", "Offers"), value: offers, hint: tr("segnate da te", "marked by you"), href: "/applications?filter=offerta", icon: Trophy, daily: null, noHistory: tr("storico non disponibile", "no history available") },
  ];

  return (
    <>
      <WelcomeModal show={false} />
      <DashboardLiveRefresh />
      <PostLoginCheckout />

      <AppTopbar title="Dashboard" actions={<NewSearchButton locale={locale} />} />

      <div className="dash">
        <section className="dash-kpis" aria-label={tr("Indicatori principali", "Key metrics")}>
          {kpis.map(({ key, label, value, hint, href, icon, daily, noHistory }) => (
            <KpiCard
              key={key}
              id={key}
              label={label}
              value={value}
              hint={hint}
              href={href}
              icon={icon}
              locale={locale}
              visual={
                <Sparkline
                  id={key}
                  daily={daily}
                  tone={key === "confirmed" ? "green" : "neutral"}
                  emptyLabel={noHistory ?? tr("storico insufficiente", "not enough history")}
                  ariaLabel={tr(`${label}: andamento cumulativo negli ultimi 30 giorni`, `${label}: cumulative trend over the last 30 days`)}
                />
              }
            />
          ))}
        </section>

        <div className="dash-grid">
          <div className="dash-main">
            {/* Next step (featured) */}
            <section className="pm-card pm-card-featured dash-next" aria-labelledby="dash-next-title">
              <div className="dash-next-body">
                <div className="dash-next-text">
                  <div className="pm-eyebrow"><span className="pm-dot tone-green" aria-hidden /> {tr("Il prossimo passo", "Your next step")}</div>
                  <h2 id="dash-next-title">{attention === null ? tr("Attività non disponibili", "Activity unavailable") : next.title}</h2>
                  <p>{attention === null ? tr("Ricarica la pagina per riprovare.", "Reload the page to try again.") : next.detail}</p>
                </div>
                <Link href={attention === null ? "/dashboard" : next.href} className="pm-btn-primary">
                  {attention === null ? tr("Riprova", "Retry") : tr("Apri", "Open")} <ArrowRight size={14} strokeWidth={2} aria-hidden />
                </Link>
              </div>
            </section>

            {/* Remaining to-do items */}
            {rest.length > 0 && (
              <section className="pm-card" aria-labelledby="dash-todo-title">
                <header className="pm-card-head">
                  <h2 id="dash-todo-title"><CircleAlert size={15} strokeWidth={1.75} aria-hidden /> {tr("Richiede attenzione", "Needs attention")}</h2>
                  <Link href="/inbox" className="pm-link">{tr("Apri inbox", "Open inbox")} <ChevronRight size={14} strokeWidth={1.75} aria-hidden /></Link>
                </header>
                <ul className="pm-list">
                  {rest.map((item) => (
                    <li key={item.id}>
                      <Link href={item.href} className="pm-row">
                        <span className="pm-row-text">
                          <strong>{item.title}</strong>
                          <small>{item.detail}</small>
                        </span>
                        {item.unread === true && <Pill tone="amber">{tr("Non letto", "Unread")}</Pill>}
                        <ChevronRight size={15} strokeWidth={1.75} aria-hidden className="pm-row-go" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* Progress */}
            <section className="pm-card" aria-labelledby="dash-progress-title">
              <header className="pm-card-head">
                <h2 id="dash-progress-title"><Briefcase size={15} strokeWidth={1.75} aria-hidden /> {tr("Avanzamento candidature", "Application progress")}</h2>
                <Link href="/applications" className="pm-link">{tr("Vedi tutte", "View all")} <ChevronRight size={14} strokeWidth={1.75} aria-hidden /></Link>
              </header>
              {stages.length > 0 ? (
                <>
                  <StatusBar segments={stages.map(({ stage, count }) => ({ key: stage, label: STAGE_LABEL[stage][lang], count, tone: STAGE_TONE[stage] }))} />
                  <div className="dash-stages">
                    {stages.map(({ stage, count }) => (
                      <Link key={stage} href="/applications" className={`dash-stage tone-${STAGE_TONE[stage]}`} data-stage={stage} data-count={count}>
                        <span className="dash-stage-label"><span className={`pm-dot tone-${STAGE_TONE[stage]}`} aria-hidden />{STAGE_LABEL[stage][lang]}</span>
                        <span className="dash-stage-count">{count}</span>
                        <span className="dash-stage-hint">{STAGE_LABEL[stage].hint[lang]}</span>
                      </Link>
                    ))}
                  </div>
                  <p className="pm-muted pm-foot">
                    {totalApplications} {tr("candidature in totale · contiamo come inviate solo quelle con ricevuta ATS o consegna email", "applications in total · only those with an ATS receipt or email delivery count as sent")}
                  </p>
                </>
              ) : (
                <Empty icon={Briefcase} title={tr("Nessuna candidatura", "No applications yet")} text={tr("Quando prepariamo o inviamo una candidatura, la vedi qui per stato.", "When we prepare or send an application, it shows up here by status.")} cta={{ href: "/discover", label: tr("Esplora offerte", "Browse jobs") }} />
              )}
            </section>

            {/* Weekly trend */}
            <section className="pm-card" aria-labelledby="dash-trend-title">
              <header className="pm-card-head">
                <h2 id="dash-trend-title"><TrendingUp size={15} strokeWidth={1.75} aria-hidden /> {tr("Andamento settimanale", "Weekly trend")}</h2>
                {trendHasData && <TrendLegend series={trendSeriesMeta} />}
              </header>
              {series === null ? (
                <p className="pm-muted pm-pad">{tr("Andamento non disponibile. Ricarica la pagina per riprovare.", "Trend unavailable. Reload the page to try again.")}</p>
              ) : trendHasData ? (
                <div className="pm-pad">
                  <TrendChart
                    buckets={series.weeks}
                    series={trendSeriesMeta.map((m) => ({ ...m, values: series.weeks.map((w) => w[m.key]) }))}
                    locale={locale}
                    ariaLabel={tr("Invii confermati e risposte recruiter per settimana, ultime 8 settimane", "Confirmed sends and recruiter replies per week, last 8 weeks")}
                  />
                  <p className="pm-muted pm-trend-note">{tr("Ultime 8 settimane (finestre di 7 giorni fino a oggi) · invii con prova di consegna e risposte dei recruiter", "Last 8 weeks (7-day windows up to today) · sends with delivery evidence and recruiter replies")}</p>
                </div>
              ) : (
                <Empty icon={TrendingUp} title={tr("Nessuno storico ancora", "No history yet")} text={tr("Quando arrivano invii confermati e risposte, qui vedi l’andamento delle ultime 8 settimane.", "Once confirmed sends and replies arrive, the last 8 weeks show up here.")} />
              )}
            </section>

            {/* Activity */}
            <section className="pm-card" aria-labelledby="dash-activity-title">
              <header className="pm-card-head">
                <h2 id="dash-activity-title"><Clock size={15} strokeWidth={1.75} aria-hidden /> {tr("Attività recente", "Recent activity")}</h2>
              </header>
              {activity.length > 0 ? (
                <ol className="pm-timeline">
                  {activity.map((app) => (
                    <li key={app.id}>
                      <Link href={`/applications/${app.id}`} className="pm-tl-row">
                        <span className={`pm-tl-dot tone-${app.stage ? STAGE_TONE[app.stage] : "neutral"}`} aria-hidden />
                        <Avatar name={app.job.company ?? ""} />
                        <span className="pm-row-text">
                          <strong>{app.job.company}</strong>
                          <small>{app.job.title}</small>
                        </span>
                        {app.stage && <Pill tone={STAGE_TONE[app.stage]}>{STAGE_LABEL[app.stage][lang]}</Pill>}
                        <time className="pm-time" dateTime={app.createdAt.toISOString()}>{formatRelativeTime(app.createdAt, locale)}</time>
                      </Link>
                    </li>
                  ))}
                </ol>
              ) : (
                <Empty icon={Clock} title={tr("Nessuna attività recente", "No recent activity")} text={tr("Qui compariranno le tue candidature più recenti.", "Your latest applications will appear here.")} />
              )}
            </section>
          </div>

          <aside className="dash-side" aria-label={tr("Profilo e documenti", "Profile and documents")}>
            {/* CV */}
            <section className="pm-card" aria-labelledby="dash-cv-title">
              <header className="pm-card-head">
                <h2 id="dash-cv-title"><FileText size={15} strokeWidth={1.75} aria-hidden /> {tr("Il tuo CV", "Your CV")}</h2>
                {hasCv && <Link href="/cv" className="pm-link">{tr("Modifica", "Edit")} <ChevronRight size={14} strokeWidth={1.75} aria-hidden /></Link>}
              </header>
              {hasCv ? (
                <div className="pm-pad">
                  <Link href="/cv" className="dash-cv-sheet" aria-label={tr("Apri e modifica il tuo CV", "Open and edit your CV")}>
                    {cvName && <div className="dash-cv-name">{cvName}</div>}
                    {(cvProfile?.title || cvProfile?.city) && (
                      <div className="dash-cv-role">
                        {cvProfile?.title}
                        {cvProfile?.title && cvProfile?.city ? " · " : ""}
                        {cvProfile?.city && <><MapPin size={11} strokeWidth={1.75} aria-hidden /> {cvProfile.city}</>}
                      </div>
                    )}
                    {cvProfile?.summary && <p className="dash-cv-summary">{cvProfile.summary}</p>}
                    {cvProfile && cvProfile.experiences.length > 0 && (
                      <ul className="dash-cv-exp">
                        {cvProfile.experiences.slice(0, 3).map((exp, i) => (
                          <li key={i}>
                            <strong>{exp.role || tr("Ruolo", "Role")}</strong>
                            <span>{[exp.company, [exp.startDate, exp.endDate].filter(Boolean).join(" – ")].filter(Boolean).join(" · ")}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                    {cvProfile && cvProfile.skills.length > 0 && (
                      <div className="dash-cv-skills">{cvProfile.skills.slice(0, 6).map((s) => <span key={s.name}>{s.name}</span>)}</div>
                    )}
                    <span className="dash-cv-lines" aria-hidden>{Array.from({ length: 14 }, (_, i) => <i key={i} />)}</span>
                    <span className="dash-cv-overlay" aria-hidden>{tr("Modifica", "Edit")}</span>
                  </Link>
                  {latestCv && (
                    <p className="pm-muted dash-cv-file">
                      {latestCv.originalFilename} · {tr("caricato il", "uploaded")}{" "}
                      {latestCv.createdAt.toLocaleDateString(en ? "en-GB" : "it-IT", { day: "numeric", month: "short", year: "numeric" })}
                    </p>
                  )}
                </div>
              ) : (
                <Empty icon={FileText} title={tr("Nessun CV caricato", "No CV uploaded")} text={tr("Carica il CV per iniziare a candidarti.", "Upload your CV to start applying.")} cta={{ href: "/cv", label: tr("Carica CV", "Upload CV") }} />
              )}
            </section>

            {/* Profile */}
            <section className="pm-card" aria-labelledby="dash-profile-title">
              <header className="pm-card-head">
                <h2 id="dash-profile-title"><UserRound size={15} strokeWidth={1.75} aria-hidden /> {tr("Il tuo profilo", "Your profile")}</h2>
                <span className="pm-count">{profileDone}/{profileChecklist.length}</span>
              </header>
              <div className="dash-meter" aria-hidden><span style={{ width: `${(profileDone / profileChecklist.length) * 100}%` }} /></div>
              <ul className="dash-checklist">
                {profileChecklist.map((item) => (
                  <li key={item.label}>
                    <Link href={item.href} className={`dash-check${item.done ? " is-done" : ""}`}>
                      <span className="dash-check-box">{item.done && <Check size={12} strokeWidth={2.25} aria-hidden />}</span>
                      <span>{item.label}</span>
                      {!item.done && <ChevronRight size={14} strokeWidth={1.75} aria-hidden className="dash-check-go" />}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>

            {/* Interviews */}
            <section className="pm-card" aria-labelledby="dash-interviews-title">
              <header className="pm-card-head">
                <h2 id="dash-interviews-title"><CalendarCheck size={15} strokeWidth={1.75} aria-hidden /> {tr("Colloqui", "Interviews")}</h2>
                {interviews > 0 && <Link href="/interview" className="pm-link">{tr("Vedi tutti", "View all")} <ChevronRight size={14} strokeWidth={1.75} aria-hidden /></Link>}
              </header>
              {recentInterviews.length > 0 ? (
                <ul className="pm-list">
                  {recentInterviews.map((iv) => (
                    <li key={iv.id}>
                      <Link href={`/applications/${iv.id}`} className="pm-row">
                        <Avatar name={iv.job.company ?? ""} />
                        <span className="pm-row-text">
                          <strong>{iv.job.company}</strong>
                          <small>{iv.job.title}</small>
                        </span>
                        {iv.lastReplyAt && <time className="pm-time" dateTime={iv.lastReplyAt.toISOString()}>{formatRelativeTime(iv.lastReplyAt, locale)}</time>}
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="pm-muted pm-pad">{tr("Nessun invito a colloquio per ora. Gli inviti dei recruiter compaiono qui.", "No interview invites yet. Recruiter invites show up here.")}</p>
              )}
            </section>

            {/* Discover */}
            <section className="pm-card" aria-labelledby="dash-discover-title">
              <header className="pm-card-head">
                <h2 id="dash-discover-title"><Compass size={15} strokeWidth={1.75} aria-hidden /> {tr("Scopri", "Discover")}</h2>
              </header>
              <div className="pm-pad dash-discover">
                <div>
                  <div className="dash-discover-count">{opportunities.toLocaleString(en ? "en-GB" : "it-IT")}</div>
                  <div className="pm-muted">{tr("offerte aperte in linea con le tue preferenze, ultimi 14 giorni", "open roles matching your preferences, last 14 days")}</div>
                </div>
                <Link href="/discover" className="pm-btn-ghost">{tr("Esplora", "Browse")} <ArrowRight size={14} strokeWidth={1.75} aria-hidden /></Link>
              </div>
            </section>
          </aside>
        </div>
      </div>
    </>
  );
}

function formatRelativeTime(date: Date | string, locale: string): string {
  const diff = Date.now() - new Date(date).getTime();
  const minutes = Math.max(0, Math.floor(diff / 60000));
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  const en = locale === "en";
  if (minutes < 60) return en ? `${minutes}m ago` : `${minutes} min fa`;
  if (hours < 24) return en ? `${hours}h ago` : `${hours} h fa`;
  if (days < 7) return en ? `${days}d ago` : `${days} g fa`;
  return new Date(date).toLocaleDateString(en ? "en-GB" : "it-IT", { month: "short", day: "numeric" });
}
