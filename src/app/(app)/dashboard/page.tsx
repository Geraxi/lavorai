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
import { deliveryEvidence, isConfirmedDelivery } from "@/lib/application-evidence";
import { journeyStage, STAGE_LABEL, type JourneyStage } from "@/lib/ui-application-status";
import {
  getConfirmedSubmissions,
  getRecruiterReplies,
  getOffers,
  getInterviewInvites,
  getOpenOpportunities,
} from "@/lib/dashboard-metrics-shared";
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

/** Display order of journey stages in the progress card. */
const STAGE_ORDER: JourneyStage[] = [
  "awaiting_approval",
  "manual",
  "preparing",
  "prepared",
  "approved",
  "in_flight",
  "sent",
  "unverified",
  "stopped",
];

type Tone = "green" | "amber" | "red" | "neutral";

const STAGE_TONE: Record<JourneyStage, Tone> = {
  preparing: "neutral",
  prepared: "neutral",
  awaiting_approval: "amber",
  approved: "neutral",
  manual: "amber",
  in_flight: "neutral",
  sent: "green",
  unverified: "amber",
  stopped: "red",
};

export default async function DashboardPage() {
  const [locale, user] = await Promise.all([getLocale(), getCurrentUser()]);
  if (!user) return null;

  const en = locale === "en";
  const tr = (it: string, english: string) => (en ? english : it);
  const lang = en ? "en" : "it";

  const [
    confirmed,
    replies,
    interviews,
    offers,
    opportunities,
    statusGroups,
    latestCv,
    cvProfileRow,
    onboarding,
    attention,
    recentInterviews,
    recentActivity,
  ] = await Promise.all([
    getConfirmedSubmissions(user.id),
    getRecruiterReplies(user.id),
    getInterviewInvites(user.id),
    getOffers(user.id),
    getOpenOpportunities(user.id),
    prisma.application.groupBy({
      by: ["status"],
      where: { userId: user.id, status: { not: "diagnostic" } },
      _count: { _all: true },
    }),
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
  ]);

  // ── Progress by journey stage ────────────────────────────────────────
  // "success" alone is NOT delivery: only evidence-backed sends count as
  // "sent"; the remaining success rows stay "outcome unverified".
  const stageCounts = new Map<JourneyStage, number>();
  let totalApplications = 0;
  for (const group of statusGroups) {
    totalApplications += group._count._all;
    const stage = journeyStage(group.status);
    if (!stage) continue;
    stageCounts.set(stage, (stageCounts.get(stage) ?? 0) + group._count._all);
  }
  const unverifiedRaw = stageCounts.get("unverified") ?? 0;
  stageCounts.set("sent", confirmed);
  stageCounts.set("unverified", Math.max(0, unverifiedRaw - confirmed));
  const stages = STAGE_ORDER.map((stage) => ({ stage, count: stageCounts.get(stage) ?? 0 })).filter((s) => s.count > 0);

  const activity = recentActivity.map((app) => {
    let stage = journeyStage(app.status);
    if (stage === "unverified" && isConfirmedDelivery(deliveryEvidence(app))) stage = "sent";
    return { ...app, stage };
  });

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

  const kpis: { key: string; label: string; value: number; hint: string; href: string; icon: LucideIcon }[] = [
    { key: "confirmed", label: tr("Invii confermati", "Confirmed sends"), value: confirmed, hint: tr("con prova di consegna", "with delivery evidence"), href: "/applications?filter=sent", icon: Send },
    { key: "replies", label: tr("Risposte recruiter", "Recruiter replies"), value: replies, hint: tr("candidature con risposta", "applications with a reply"), href: "/inbox", icon: MessageSquare },
    { key: "interviews", label: tr("Colloqui", "Interviews"), value: interviews, hint: tr("inviti ricevuti", "invites received"), href: "/interviews", icon: CalendarCheck },
    { key: "offers", label: tr("Offerte", "Offers"), value: offers, hint: tr("segnate da te", "marked by you"), href: "/applications?filter=offerta", icon: Trophy },
  ];

  return (
    <>
      <WelcomeModal show={false} />
      <DashboardLiveRefresh />
      <PostLoginCheckout />

      <AppTopbar title="Dashboard" actions={<NewSearchButton locale={locale} />} />

      <div className="dash">
        <section className="dash-kpis" aria-label={tr("Indicatori principali", "Key metrics")}>
          {kpis.map(({ key, label, value, hint, href, icon: KpiIcon }) => (
            <Link key={key} href={href} className="dash-kpi" data-kpi={key}>
              <div className="dash-kpi-top">
                <span className="dash-chip-icon"><KpiIcon size={14} strokeWidth={1.75} aria-hidden /></span>
                <span className="dash-kpi-label">{label}</span>
              </div>
              <div className="dash-kpi-value">{value.toLocaleString(en ? "en-GB" : "it-IT")}</div>
              <div className="dash-kpi-hint">{hint}</div>
            </Link>
          ))}
        </section>

        <div className="dash-grid">
          <div className="dash-main">
            {/* Next step (featured) */}
            <section className="dash-card dash-next" aria-labelledby="dash-next-title">
              <div className="dash-next-body">
                <div className="dash-next-text">
                  <div className="dash-eyebrow"><span className="dash-dot tone-green" aria-hidden /> {tr("Il prossimo passo", "Your next step")}</div>
                  <h2 id="dash-next-title">{attention === null ? tr("Attività non disponibili", "Activity unavailable") : next.title}</h2>
                  <p>{attention === null ? tr("Ricarica la pagina per riprovare.", "Reload the page to try again.") : next.detail}</p>
                </div>
                <Link href={attention === null ? "/dashboard" : next.href} className="dash-btn-primary">
                  {attention === null ? tr("Riprova", "Retry") : tr("Apri", "Open")} <ArrowRight size={14} strokeWidth={2} aria-hidden />
                </Link>
              </div>
            </section>

            {/* Remaining to-do items */}
            {rest.length > 0 && (
              <section className="dash-card" aria-labelledby="dash-todo-title">
                <header className="dash-card-head">
                  <h2 id="dash-todo-title"><CircleAlert size={15} strokeWidth={1.75} aria-hidden /> {tr("Richiede attenzione", "Needs attention")}</h2>
                  <Link href="/inbox" className="dash-link">{tr("Apri inbox", "Open inbox")} <ChevronRight size={14} strokeWidth={1.75} aria-hidden /></Link>
                </header>
                <ul className="dash-list">
                  {rest.map((item) => (
                    <li key={item.id}>
                      <Link href={item.href} className="dash-row">
                        <span className="dash-row-text">
                          <strong>{item.title}</strong>
                          <small>{item.detail}</small>
                        </span>
                        {item.unread === true && <Pill tone="amber">{tr("Non letto", "Unread")}</Pill>}
                        <ChevronRight size={15} strokeWidth={1.75} aria-hidden className="dash-row-go" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* Progress */}
            <section className="dash-card" aria-labelledby="dash-progress-title">
              <header className="dash-card-head">
                <h2 id="dash-progress-title"><Briefcase size={15} strokeWidth={1.75} aria-hidden /> {tr("Avanzamento candidature", "Application progress")}</h2>
                <Link href="/applications" className="dash-link">{tr("Vedi tutte", "View all")} <ChevronRight size={14} strokeWidth={1.75} aria-hidden /></Link>
              </header>
              {stages.length > 0 ? (
                <>
                  <div className="dash-stages">
                    {stages.map(({ stage, count }) => (
                      <Link key={stage} href="/applications" className={`dash-stage tone-${STAGE_TONE[stage]}`} data-stage={stage} data-count={count}>
                        <span className="dash-stage-label"><span className={`dash-dot tone-${STAGE_TONE[stage]}`} aria-hidden />{STAGE_LABEL[stage][lang]}</span>
                        <span className="dash-stage-count">{count}</span>
                        <span className="dash-stage-hint">{STAGE_LABEL[stage].hint[lang]}</span>
                      </Link>
                    ))}
                  </div>
                  <p className="dash-muted dash-foot">
                    {totalApplications} {tr("candidature in totale · contiamo come inviate solo quelle con ricevuta ATS o consegna email", "applications in total · only those with an ATS receipt or email delivery count as sent")}
                  </p>
                </>
              ) : (
                <Empty icon={Briefcase} title={tr("Nessuna candidatura", "No applications yet")} text={tr("Quando prepariamo o inviamo una candidatura, la vedi qui per stato.", "When we prepare or send an application, it shows up here by status.")} cta={{ href: "/discover", label: tr("Esplora offerte", "Browse jobs") }} />
              )}
            </section>

            {/* Activity */}
            <section className="dash-card" aria-labelledby="dash-activity-title">
              <header className="dash-card-head">
                <h2 id="dash-activity-title"><Clock size={15} strokeWidth={1.75} aria-hidden /> {tr("Attività recente", "Recent activity")}</h2>
              </header>
              {activity.length > 0 ? (
                <ol className="dash-timeline">
                  {activity.map((app) => (
                    <li key={app.id}>
                      <Link href={`/applications/${app.id}`} className="dash-tl-row">
                        <span className={`dash-tl-dot tone-${app.stage ? STAGE_TONE[app.stage] : "neutral"}`} aria-hidden />
                        <Avatar name={app.job.company ?? ""} />
                        <span className="dash-row-text">
                          <strong>{app.job.company}</strong>
                          <small>{app.job.title}</small>
                        </span>
                        {app.stage && <Pill tone={STAGE_TONE[app.stage]}>{STAGE_LABEL[app.stage][lang]}</Pill>}
                        <time className="dash-time" dateTime={app.createdAt.toISOString()}>{formatRelativeTime(app.createdAt, locale)}</time>
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
            <section className="dash-card" aria-labelledby="dash-cv-title">
              <header className="dash-card-head">
                <h2 id="dash-cv-title"><FileText size={15} strokeWidth={1.75} aria-hidden /> {tr("Il tuo CV", "Your CV")}</h2>
                {hasCv && <Link href="/cv" className="dash-link">{tr("Modifica", "Edit")} <ChevronRight size={14} strokeWidth={1.75} aria-hidden /></Link>}
              </header>
              {hasCv ? (
                <div className="dash-pad">
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
                    <p className="dash-muted dash-cv-file">
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
            <section className="dash-card" aria-labelledby="dash-profile-title">
              <header className="dash-card-head">
                <h2 id="dash-profile-title"><UserRound size={15} strokeWidth={1.75} aria-hidden /> {tr("Il tuo profilo", "Your profile")}</h2>
                <span className="dash-count">{profileDone}/{profileChecklist.length}</span>
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
            <section className="dash-card" aria-labelledby="dash-interviews-title">
              <header className="dash-card-head">
                <h2 id="dash-interviews-title"><CalendarCheck size={15} strokeWidth={1.75} aria-hidden /> {tr("Colloqui", "Interviews")}</h2>
                {interviews > 0 && <Link href="/interviews" className="dash-link">{tr("Vedi tutti", "View all")} <ChevronRight size={14} strokeWidth={1.75} aria-hidden /></Link>}
              </header>
              {recentInterviews.length > 0 ? (
                <ul className="dash-list">
                  {recentInterviews.map((iv) => (
                    <li key={iv.id}>
                      <Link href={`/applications/${iv.id}`} className="dash-row">
                        <Avatar name={iv.job.company ?? ""} />
                        <span className="dash-row-text">
                          <strong>{iv.job.company}</strong>
                          <small>{iv.job.title}</small>
                        </span>
                        {iv.lastReplyAt && <time className="dash-time" dateTime={iv.lastReplyAt.toISOString()}>{formatRelativeTime(iv.lastReplyAt, locale)}</time>}
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="dash-muted dash-pad">{tr("Nessun invito a colloquio per ora. Gli inviti dei recruiter compaiono qui.", "No interview invites yet. Recruiter invites show up here.")}</p>
              )}
            </section>

            {/* Discover */}
            <section className="dash-card" aria-labelledby="dash-discover-title">
              <header className="dash-card-head">
                <h2 id="dash-discover-title"><Compass size={15} strokeWidth={1.75} aria-hidden /> {tr("Scopri", "Discover")}</h2>
              </header>
              <div className="dash-pad dash-discover">
                <div>
                  <div className="dash-discover-count">{opportunities.toLocaleString(en ? "en-GB" : "it-IT")}</div>
                  <div className="dash-muted">{tr("offerte aperte aggiornate negli ultimi 30 giorni", "open roles refreshed in the last 30 days")}</div>
                </div>
                <Link href="/discover" className="dash-btn-ghost">{tr("Esplora", "Browse")} <ArrowRight size={14} strokeWidth={1.75} aria-hidden /></Link>
              </div>
            </section>
          </aside>
        </div>
      </div>
    </>
  );
}

function Pill({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return <span className={`dash-pill tone-${tone}`}><span className="dash-dot" aria-hidden />{children}</span>;
}

function Avatar({ name }: { name: string }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "·";
  return <span className="dash-avatar" aria-hidden>{initials}</span>;
}

function Empty({ icon: EmptyIcon, title, text, cta }: { icon: LucideIcon; title: string; text: string; cta?: { href: string; label: string } }) {
  return (
    <div className="dash-empty">
      <span className="dash-empty-icon"><EmptyIcon size={18} strokeWidth={1.75} aria-hidden /></span>
      <strong>{title}</strong>
      <p>{text}</p>
      {cta && <Link href={cta.href} className="dash-btn-ghost">{cta.label}</Link>}
    </div>
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
