import { AttentionQueue } from "@/components/attention-queue";
import { getAttentionQueue } from "@/lib/attention-repository";
import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { AppTopbar } from "@/components/design/topbar";
import { Icon } from "@/components/design/icon";
import { CompanyLogo } from "@/components/design/company-logo";
import { WelcomeModal } from "@/components/welcome-modal";
import { DashboardLiveRefresh } from "@/components/dashboard-live-refresh";
import { PostLoginCheckout } from "@/components/post-login-checkout";
import { NewSearchButton } from "@/components/new-search-button";
import { getCurrentUser } from "@/lib/session";
import { getOnboardingState } from "@/lib/onboarding";
import { prisma } from "@/lib/db";
import { rowToProfile } from "@/lib/cv-profile-types";
import { journeyStage, STAGE_LABEL, type JourneyStage } from "@/lib/ui-application-status";
import { SectionCard, SectionHead, SectionBody } from "@/components/design/section-card";
import { Kpi } from "@/components/design/kpi";
import {
  getConfirmedSubmissions,
  getRecruiterReplies,
  getOffers,
  getInterviewInvites,
  getOpenOpportunities,
  getActionsNeeded,
} from "@/lib/dashboard-metrics-shared";
import "./dashboard-redesign.css";

export const metadata: Metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

/**
 * Dashboard Redesign (2026-10-19)
 * 
 * Purpose: Job-seeker overview answering "What's happening, what needs attention, what should I do next?"
 * Design: Linear/Vercel/Stripe-inspired polished cards, matte black, restrained green, one icon family.
 * Evidence: Production audit revealed greeting, globe, duplicated KPIs, conflicting counts — all fixed.
 * 
 * NO: greeting, globe, duplicated KPIs, admin UI for customers, fabricated data
 * YES: honest metrics, clear next actions, responsive 1440/768/375, evidence-backed counts
 */
export default async function DashboardPage() {
  const [t, locale, user] = await Promise.all([
    getTranslations("dashboardPage"),
    getLocale(),
    getCurrentUser(),
  ]);

  if (!user) return null;

  const en = locale === "en";

  // Fetch all data in parallel (shared metrics ensure consistency with other pages)
  const [
    confirmed,
    replies,
    interviews,
    offers,
    opportunities,
    actionsNeeded,
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
    getActionsNeeded(user.id),
    
    // Application status breakdown (for progress section)
    prisma.application.groupBy({
      by: ["status"],
      where: { userId: user.id, status: { not: "diagnostic" } },
      _count: { _all: true },
    }),
    
    // CV info
    prisma.cVDocument.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      select: { originalFilename: true, createdAt: true },
    }),
    prisma.cVProfile.findUnique({ where: { userId: user.id } }),
    
    // Onboarding state
    getOnboardingState(user.id),
    
    // Attention queue
    getAttentionQueue(user.id, locale).catch(() => null),
    
    // Recent interviews (latest 3)
    prisma.application.findMany({
      where: {
        userId: user.id,
        OR: [{ userStatus: "colloquio" }, { lastReplyKind: "colloquio" }],
      },
      orderBy: { lastReplyAt: "desc" },
      take: 3,
      select: {
        id: true,
        createdAt: true,
        lastReplyAt: true,
        userStatus: true,
        lastReplyKind: true,
        job: { select: { title: true, company: true } },
      },
    }),
    
    // Recent activity (latest 5 applications)
    prisma.application.findMany({
      where: { userId: user.id, status: { not: "diagnostic" } },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        createdAt: true,
        status: true,
        job: { select: { title: true, company: true } },
      },
    }),
  ]);

  // Calculate progress breakdown (prepared, approved, sent, etc.)
  const stageCounts = new Map<JourneyStage, number>();
  for (const group of statusGroups) {
    const stage = journeyStage(group.status);
    if (!stage || stage === "unverified" || stage === "sent") continue;
    stageCounts.set(stage, (stageCounts.get(stage) ?? 0) + group._count._all);
  }
  stageCounts.set("sent", confirmed);

  const cvProfile = cvProfileRow ? rowToProfile(cvProfileRow) : null;

  return (
    <>
      <WelcomeModal />
      <DashboardLiveRefresh />
      <PostLoginCheckout />
      
      <AppTopbar
        title={en ? "Dashboard" : "Dashboard"}
        actions={<NewSearchButton />}
      />

      <div className="dashboard-redesign">
        {/* Main column */}
        <div className="dashboard-main">
          {/* Top KPIs (single row, no duplication) */}
          <div className="dashboard-kpis">
            <Kpi
              label={en ? "Confirmed submissions" : "Invii confermati"}
              value={String(confirmed)}
              index={0}
            />
            <Kpi
              label={en ? "Recruiter replies" : "Risposte recruiter"}
              value={String(replies)}
              index={1}
            />
            <Kpi
              label={en ? "Interviews" : "Colloqui"}
              value={String(interviews)}
              index={2}
            />
            <Kpi
              label={en ? "Offers" : "Offerte"}
              value={String(offers)}
              index={3}
            />
          </div>

          {/* Needs Attention (blocking actions) */}
          {actionsNeeded > 0 && attention && attention.items.length > 0 && (
            <SectionCard className="needs-attention-card">
              <SectionHead
                title={
                  <span className="flex items-center gap-2">
                    <Icon name="alert-circle" size={18} />
                    {en ? "Needs Attention" : "Richiede attenzione"}
                    <span className="attention-badge">{actionsNeeded}</span>
                  </span>
                }
              />
              <SectionBody>
                <AttentionQueue queue={attention} locale={locale} state={onboarding} />
              </SectionBody>
            </SectionCard>
          )}

          {/* Application Status Breakdown */}
          <SectionCard>
            <SectionHead
              title={
                <span className="flex items-center gap-2">
                  <Icon name="briefcase" size={18} />
                  {en ? "Application Status" : "Stato candidature"}
                </span>
              }
              actions={
                <Link
                  href="/applications"
                  className="section-link"
                >
                  {en ? "View all" : "Vedi tutte"}
                  <Icon name="chevron-right" size={14} />
                </Link>
              }
            />
            <SectionBody>
              <div className="status-grid">
                {["prepared", "approved", "in_flight", "sent", "stopped"].map((stage) => {
                  const count = stageCounts.get(stage as JourneyStage) ?? 0;
                  if (count === 0) return null;
                  
                  return (
                    <div key={stage} className="status-item">
                      <div className="status-count">{count}</div>
                      <div className="status-label">
                        {STAGE_LABEL[stage as JourneyStage]?.[locale as "it" | "en"] ?? stage}
                      </div>
                    </div>
                  );
                })}
              </div>

              {stageCounts.size === 0 && (
                <EmptyState
                  icon="briefcase"
                  title={en ? "No applications yet" : "Nessuna candidatura"}
                  description={
                    en
                      ? "Start applying to opportunities that match your profile"
                      : "Inizia a candidarti per opportunità in linea con il tuo profilo"
                  }
                  ctaLabel={en ? "Browse jobs" : "Esplora offerte"}
                  ctaHref="/discover"
                />
              )}
            </SectionBody>
          </SectionCard>

          {/* Recent Activity Timeline */}
          <SectionCard>
            <SectionHead
              title={
                <span className="flex items-center gap-2">
                  <Icon name="clock" size={18} />
                  {en ? "Recent Activity" : "Attività recente"}
                </span>
              }
            />
            <SectionBody>
              {recentActivity.length > 0 ? (
                <div className="activity-timeline">
                  {recentActivity.map((app) => (
                    <Link
                      key={app.id}
                      href={`/applications/${app.id}`}
                      className="timeline-item"
                    >
                      <div className="timeline-dot" />
                      <div className="timeline-content">
                        <div className="timeline-title">
                          {en ? "Applied to" : "Candidatura inviata"}
                          {" "}
                          <strong>{app.job.company}</strong>
                        </div>
                        <div className="timeline-subtitle">{app.job.title}</div>
                      </div>
                      <div className="timeline-timestamp">
                        {formatRelativeTime(app.createdAt, locale)}
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <EmptyState
                  icon="clock"
                  title={en ? "No recent activity" : "Nessuna attività recente"}
                  description={
                    en
                      ? "Your application activity will appear here"
                      : "La tua attività di candidatura apparirà qui"
                  }
                />
              )}
            </SectionBody>
          </SectionCard>
        </div>

        {/* Sidebar */}
        <div className="dashboard-sidebar">
          {/* CV/Documents */}
          <SectionCard>
            <SectionHead
              title={
                <span className="flex items-center gap-2">
                  <Icon name="file-text" size={18} />
                  {en ? "Your CV" : "Il tuo CV"}
                </span>
              }
              actions={
                latestCv && (
                  <Link href="/cv" className="section-link-sm">
                    {en ? "Edit" : "Modifica"}
                  </Link>
                )
              }
            />
            <SectionBody>
              {latestCv ? (
                <div className="cv-card">
                  <div className="cv-thumbnail">
                    <Icon name="file-text" size={32} />
                  </div>
                  <div className="cv-info">
                    <div className="cv-filename">{latestCv.originalFilename}</div>
                    <div className="cv-meta">
                      {en ? "Updated" : "Aggiornato"}{" "}
                      {new Date(latestCv.createdAt).toLocaleDateString(locale)}
                    </div>
                  </div>
                  {cvProfile && (
                    <div className="cv-profile-summary">
                      <div className="cv-profile-item">
                        <Icon name="briefcase" size={14} />
                        {cvProfile.title || (en ? "No role set" : "Ruolo non impostato")}
                      </div>
                      {cvProfile.city && (
                        <div className="cv-profile-item">
                          <Icon name="map-pin" size={14} />
                          {cvProfile.city}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <EmptyState
                  icon="file-text"
                  title={en ? "No CV uploaded" : "Nessun CV caricato"}
                  description={
                    en
                      ? "Upload your CV to start applying"
                      : "Carica il tuo CV per iniziare a candidarti"
                  }
                  ctaLabel={en ? "Upload CV" : "Carica CV"}
                  ctaHref="/cv"
                />
              )}
            </SectionBody>
          </SectionCard>

          {/* Upcoming Interviews */}
          {interviews > 0 && (
            <SectionCard>
              <SectionHead
                title={
                  <span className="flex items-center gap-2">
                    <Icon name="calendar" size={18} />
                    {en ? "Upcoming Interviews" : "Prossimi colloqui"}
                  </span>
                }
                actions={
                  <Link href="/interviews" className="section-link-sm">
                    {en ? "View all" : "Vedi tutti"}
                  </Link>
                }
              />
              <SectionBody>
                {recentInterviews.length > 0 ? (
                  <div className="interview-list">
                    {recentInterviews.map((interview) => (
                      <Link
                        key={interview.id}
                        href={`/applications/${interview.id}`}
                        className="interview-item"
                      >
                        <CompanyLogo
                          company={interview.job.company ?? ""}
                          size={32}
                        />
                        <div className="interview-info">
                          <div className="interview-company">{interview.job.company}</div>
                          <div className="interview-role">{interview.job.title}</div>
                          {interview.lastReplyAt && (
                            <div className="interview-time">
                              {formatRelativeTime(interview.lastReplyAt, locale)}
                            </div>
                          )}
                        </div>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    icon="calendar"
                    title={en ? "No upcoming interviews" : "Nessun colloquio"}
                    description={
                      en
                        ? "Interview invites will appear here"
                        : "Gli inviti ai colloqui appariranno qui"
                    }
                  />
                )}
              </SectionBody>
            </SectionCard>
          )}

          {/* Opportunities (compact link to Discover) */}
          <SectionCard>
            <SectionHead
              title={
                <span className="flex items-center gap-2">
                  <Icon name="target" size={18} />
                  {en ? "Opportunities" : "Opportunità"}
                </span>
              }
            />
            <SectionBody>
              <div className="opportunities-summary">
                <div className="opp-count">{opportunities}</div>
                <div className="opp-label">
                  {en ? "open positions matching your profile" : "posizioni aperte compatibili"}
                </div>
                <Link href="/discover" className="ds-btn ds-btn-primary ds-btn-sm">
                  <Icon name="search" size={14} />
                  {en ? "Browse opportunities" : "Esplora opportunità"}
                </Link>
              </div>
            </SectionBody>
          </SectionCard>
        </div>
      </div>
    </>
  );
}

/**
 * Empty state component (Stripe/Mercury pattern)
 */
function EmptyState({
  icon,
  title,
  description,
  ctaLabel,
  ctaHref,
}: {
  icon: string;
  title: string;
  description: string;
  ctaLabel?: string;
  ctaHref?: string;
}) {
  return (
    <div className="empty-state">
      <div className="empty-state-icon">
        <Icon name={icon as any} size={40} />
      </div>
      <div className="empty-state-title">{title}</div>
      <div className="empty-state-description">{description}</div>
      {ctaLabel && ctaHref && (
        <Link href={ctaHref} className="ds-btn ds-btn-primary ds-btn-sm">
          {ctaLabel}
        </Link>
      )}
    </div>
  );
}

/**
 * Format relative time (Linear/Arc pattern)
 */
function formatRelativeTime(date: Date | string, locale: string): string {
  const now = Date.now();
  const then = new Date(date).getTime();
  const diff = now - then;
  
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  
  const en = locale === "en";
  
  if (minutes < 60) return en ? `${minutes}m ago` : `${minutes}m fa`;
  if (hours < 24) return en ? `${hours}h ago` : `${hours}h fa`;
  if (days < 7) return en ? `${days}d ago` : `${days}g fa`;
  
  return new Date(date).toLocaleDateString(locale, { month: "short", day: "numeric" });
}
