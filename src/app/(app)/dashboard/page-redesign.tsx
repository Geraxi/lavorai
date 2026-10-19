/**
 * Redesigned Dashboard — October 2026
 * 
 * Information hierarchy (top-down):
 * 1. Account status (one-line summary)
 * 2. Attention items (blocking actions first)
 * 3. Key metrics (4 cards: confirmed, replies, interviews, offers)
 * 4. Activity timeline (recent 7d events)
 * 5. Application progress (compact horizontal bar)
 * 6. Opportunities (card carousel, not globe)
 * 7. CV panel (prominent, left sidebar)
 * 
 * Changes from original:
 * - Removed globe map (move to /discover or /analytics)
 * - Removed position distribution chart (redundant)
 * - Removed geography breakdown (not actionable)
 * - Moved CV from right rail to prominent left sidebar
 * - Added activity timeline (what's happening)
 * - Consolidated metrics (no duplication)
 * - Mobile-first single column layout
 */

import { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { AppTopbar } from "@/components/design/topbar";
import { Icon } from "@/components/design/icon";
import { CompanyLogo, companyColor } from "@/components/design/company-logo";
import { WelcomeModal } from "@/components/welcome-modal";
import { PostLoginCheckout } from "@/components/post-login-checkout";
import { getCurrentUser } from "@/lib/session";
import { getOnboardingState } from "@/lib/onboarding";
import { prisma } from "@/lib/db";
import { deliveryEvidence, isConfirmedDelivery } from "@/lib/application-evidence";
import { rowToProfile } from "@/lib/cv-profile-types";
import { getAttentionQueue } from "@/lib/attention-repository";

export const metadata: Metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [t, locale, user] = await Promise.all([
    getTranslations("dashboardPage"),
    getLocale(),
    getCurrentUser(),
  ]);
  const en = locale === "en";
  const tr = (italian: string, english: string) => (en ? english : italian);

  if (!user) return null;

  // Parallel data fetching
  const [
    onboarding,
    deliveryCounts,
    responseCount,
    interviewsCount,
    offersCount,
    recentApplications,
    attention,
    topJobs,
    cvProfileRow,
    latestCv,
  ] = await Promise.all([
    getOnboardingState(user.id),
    dashboardDeliveryCounts(user.id),
    
    prisma.application.count({
      where: {
        userId: user.id,
        OR: [
          { replies: { some: { isHuman: true, isSecurityCode: false, kind: { in: ["risposta", "colloquio", "rifiutata"] } } } },
          { gmailMessages: { some: { userId: user.id, isHuman: true, kind: { in: ["risposta", "colloquio", "rifiutata"] } } } },
        ],
      },
    }),
    
    prisma.application.count({
      where: {
        userId: user.id,
        OR: [{ userStatus: "colloquio" }, { lastReplyKind: "colloquio" }],
      },
    }),
    
    prisma.application.count({
      where: { userId: user.id, userStatus: "offerta" },
    }),
    
    // Recent applications (last 7d, for activity timeline)
    prisma.application.findMany({
      where: {
        userId: user.id,
        createdAt: { gte: new Date(Date.now() - 7 * 86400_000) },
        status: { not: "diagnostic" },
      },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        status: true,
        submittedAt: true,
        createdAt: true,
        lastReplyAt: true,
        lastReplyKind: true,
        userStatus: true,
        job: { select: { title: true, company: true } },
      },
    }),
    
    getAttentionQueue(user.id, locale).catch(() => null),
    
    // Top 5 open jobs (simplified, no globe)
    prisma.job.findMany({
      where: {
        closedAt: null,
        cachedAt: { gte: new Date(Date.now() - 30 * 86400_000) },
        dismissals: { none: { userId: user.id } },
      },
      orderBy: { cachedAt: "desc" },
      take: 5,
      select: {
        id: true,
        title: true,
        company: true,
        location: true,
        salaryMin: true,
        salaryMax: true,
        remote: true,
      },
    }),
    
    prisma.cVProfile.findUnique({ where: { userId: user.id } }),
    
    prisma.cVDocument.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      select: { originalFilename: true, createdAt: true },
    }),
  ]);

  const cvProfile = cvProfileRow ? rowToProfile(cvProfileRow) : null;
  const greetingName = (user.name ?? user.email.split("@")[0]).split(/\s+/)[0];
  const showWelcome = !user.welcomeSeenAt;

  // Account status (one-line summary)
  const statusParts: string[] = [];
  if (deliveryCounts.confirmed > 0) {
    statusParts.push(
      tr(
        `${deliveryCounts.confirmed} ${deliveryCounts.confirmed === 1 ? "invio confermato" : "invii confermati"}`,
        `${deliveryCounts.confirmed} confirmed ${deliveryCounts.confirmed === 1 ? "submission" : "submissions"}`
      )
    );
  }
  if (responseCount > 0) {
    statusParts.push(
      tr(
        `${responseCount} ${responseCount === 1 ? "risposta ricevuta" : "risposte ricevute"}`,
        `${responseCount} ${responseCount === 1 ? "reply received" : "replies received"}`
      )
    );
  }
  if (interviewsCount > 0) {
    statusParts.push(
      tr(
        `${interviewsCount} ${interviewsCount === 1 ? "colloquio" : "colloqui"}`,
        `${interviewsCount} ${interviewsCount === 1 ? "interview" : "interviews"}`
      )
    );
  }
  const accountStatus = statusParts.length > 0
    ? statusParts.join(", ")
    : tr("Nessuna candidatura ancora", "No applications yet");

  return (
    <>
      <WelcomeModal show={showWelcome} />
      <PostLoginCheckout />
      <AppTopbar title={t("title")} />
      
      <div className="dashboard-redesign">
        {/* Hero: Greeting + status */}
        <header className="dashboard-hero">
          <h1>{tr(`Ciao, ${greetingName}`, `Hi, ${greetingName}`)}</h1>
          <p className="dashboard-status">{accountStatus}</p>
        </header>

        <div className="dashboard-grid">
          {/* Left sidebar: CV (persistent, always visible) */}
          <aside className="dashboard-sidebar">
            <section className="workspace-panel dashboard-cv-sidebar">
              <div className="fit-card-head">
                <h2>
                  <Icon name="file" size={14} />
                  {tr("Il tuo CV", "Your CV")}
                </h2>
                <Link href="/cv" className="fit-link">
                  {tr("Modifica", "Edit")} <Icon name="arrow-right" size={12} />
                </Link>
              </div>
              {!cvProfile && !latestCv ? (
                <Empty
                  text={tr(
                    "Carica il CV: è la base di ogni candidatura su misura.",
                    "Upload your CV: it is the base of every tailored application."
                  )}
                  cta={{ href: "/onboarding", label: tr("Carica il CV", "Upload CV") }}
                />
              ) : (
                <>
                  <Link href="/cv" className="dashboard-cv-thumbnail" aria-label={tr("Apri e modifica il tuo CV", "Open and edit your CV")}>
                    <div className="dashboard-cv-name">
                      {[cvProfile?.firstName, cvProfile?.lastName].filter(Boolean).join(" ") || greetingName}
                    </div>
                    {cvProfile?.title && <div className="dashboard-cv-title">{cvProfile.title}</div>}
                    {cvProfile?.summary && (
                      <p className="dashboard-cv-summary">{cvProfile.summary.slice(0, 120)}...</p>
                    )}
                  </Link>
                  {cvProfile && cvProfile.experiences.length > 0 && (
                    <div className="dashboard-cv-experience">
                      <h4>{tr("Esperienza", "Experience")}</h4>
                      <ul>
                        {cvProfile.experiences.slice(0, 2).map((exp, i) => (
                          <li key={i}>
                            <strong>{exp.role || tr("Ruolo", "Role")}</strong>
                            <span>{exp.company}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {cvProfile && cvProfile.skills.length > 0 && (
                    <div className="dashboard-cv-skills">
                      {cvProfile.skills.slice(0, 6).map((skill) => (
                        <span key={skill.name} className="dashboard-cv-skill-tag">
                          {skill.name}
                        </span>
                      ))}
                    </div>
                  )}
                  {latestCv && (
                    <p className="workspace-muted dashboard-cv-file">
                      {latestCv.originalFilename} ·{" "}
                      {tr("caricato il", "uploaded")}{" "}
                      {latestCv.createdAt.toLocaleDateString(en ? "en-GB" : "it-IT", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </p>
                  )}
                </>
              )}
            </section>

            {/* Onboarding checklist (hide when complete) */}
            {!onboarding.complete && (
              <section className="workspace-panel">
                <h3>{tr("Primi passi", "Getting started")}</h3>
                <ul className="dashboard-checklist">
                  {!onboarding.cvUploaded && (
                    <li>
                      <Link href="/onboarding">
                        <Icon name="circle" size={12} />
                        {tr("Carica il CV", "Upload CV")}
                      </Link>
                    </li>
                  )}
                  {!onboarding.preferencesSet && (
                    <li>
                      <Link href="/preferences">
                        <Icon name="circle" size={12} />
                        {tr("Imposta preferenze", "Set preferences")}
                      </Link>
                    </li>
                  )}
                  {!onboarding.firstApplicationReviewed && (
                    <li>
                      <Link href="/applications">
                        <Icon name="circle" size={12} />
                        {tr("Rivedi prima candidatura", "Review first application")}
                      </Link>
                    </li>
                  )}
                </ul>
              </section>
            )}
          </aside>

          {/* Main content */}
          <div className="dashboard-main">
            {/* Attention items (blocking actions) */}
            {attention && attention.items.length > 0 && (
              <section className="workspace-panel dashboard-attention">
                <div className="fit-card-head">
                  <h2>
                    <Icon name="bell" size={14} />
                    {tr("Richiede la tua attenzione", "Needs your attention")}
                    {attention.unread > 0 && (
                      <span className="dashboard-attention-badge">{attention.unread}</span>
                    )}
                  </h2>
                  <Link href="/inbox" className="fit-link">
                    {tr("Vedi tutto", "View all")} <Icon name="arrow-right" size={12} />
                  </Link>
                </div>
                <ul className="dashboard-attention-list">
                  {attention.items.slice(0, 5).map((item) => (
                    <li key={item.id}>
                      <Link href={item.href}>
                        {item.unread && <span className="dashboard-unread-dot" />}
                        <div>
                          <strong>{item.title}</strong>
                          <p className="workspace-muted">{item.detail}</p>
                        </div>
                        {item.date && (
                          <time className="workspace-muted">
                            {item.date.toLocaleDateString(en ? "en-GB" : "it-IT", {
                              day: "numeric",
                              month: "short",
                            })}
                          </time>
                        )}
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* Key metrics (4 cards) */}
            <section className="dashboard-metrics">
              <Link href="/applications" className="dashboard-metric-card">
                <Icon name="check-circle" size={16} />
                <strong>{deliveryCounts.confirmed}</strong>
                <span>{tr("Invii confermati", "Confirmed submissions")}</span>
              </Link>
              <Link href="/inbox" className="dashboard-metric-card">
                <Icon name="mail" size={16} />
                <strong>{responseCount}</strong>
                <span>{tr("Con risposte", "With replies")}</span>
              </Link>
              <Link href="/interview" className="dashboard-metric-card">
                <Icon name="video" size={16} />
                <strong>{interviewsCount}</strong>
                <span>{tr("Colloqui", "Interviews")}</span>
              </Link>
              <Link href="/applications" className="dashboard-metric-card">
                <Icon name="star" size={16} />
                <strong>{offersCount}</strong>
                <span>{tr("Offerte", "Offers")}</span>
              </Link>
            </section>

            {/* Activity timeline (recent 7d) */}
            {recentApplications.length > 0 && (
              <section className="workspace-panel dashboard-activity">
                <div className="fit-card-head">
                  <h2>
                    <Icon name="clock" size={14} />
                    {tr("Attività recente", "Recent activity")}
                  </h2>
                  <Link href="/applications" className="fit-link">
                    {tr("Vedi tutte", "View all")} <Icon name="arrow-right" size={12} />
                  </Link>
                </div>
                <ul className="dashboard-activity-list">
                  {recentApplications.map((app) => {
                    const date = app.lastReplyAt ?? app.submittedAt ?? app.createdAt;
                    let event = tr("Candidatura creata", "Application created");
                    let icon = "file-plus";
                    
                    if (app.lastReplyKind === "colloquio" || app.userStatus === "colloquio") {
                      event = tr("Invito a colloquio", "Interview invite");
                      icon = "video";
                    } else if (app.lastReplyKind === "rifiutata") {
                      event = tr("Risposta ricevuta", "Reply received");
                      icon = "mail";
                    } else if (app.lastReplyKind === "risposta") {
                      event = tr("Risposta ricevuta", "Reply received");
                      icon = "mail";
                    } else if (app.submittedAt) {
                      event = tr("Candidatura inviata", "Application submitted");
                      icon = "send";
                    }

                    return (
                      <li key={app.id}>
                        <Link href={`/applications?id=${encodeURIComponent(app.id)}`}>
                          <Icon name={icon as any} size={14} />
                          <div>
                            <strong>
                              {app.job.company ?? tr("Azienda", "Company")} · {app.job.title}
                            </strong>
                            <p className="workspace-muted">{event}</p>
                          </div>
                          <time className="workspace-muted">
                            {date.toLocaleDateString(en ? "en-GB" : "it-IT", {
                              day: "numeric",
                              month: "short",
                            })}
                          </time>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}

            {/* Application progress (compact) */}
            <section className="workspace-panel dashboard-progress-compact">
              <div className="fit-card-head">
                <h2>
                  <Icon name="trending-up" size={14} />
                  {tr("Avanzamento", "Progress")}
                </h2>
                <Link href="/applications" className="fit-link">
                  {tr("Dettagli", "Details")} <Icon name="arrow-right" size={12} />
                </Link>
              </div>
              <div className="dashboard-progress-summary">
                <div className="dashboard-progress-stat">
                  <strong>{deliveryCounts.confirmed}</strong>
                  <span>{tr("inviate", "submitted")}</span>
                </div>
                <div className="dashboard-progress-stat">
                  <strong>{responseCount}</strong>
                  <span>{tr("risposte", "replies")}</span>
                </div>
                <div className="dashboard-progress-stat">
                  <strong>{interviewsCount}</strong>
                  <span>{tr("colloqui", "interviews")}</span>
                </div>
              </div>
            </section>

            {/* Opportunities (card carousel) */}
            <section className="workspace-panel dashboard-opportunities">
              <div className="fit-card-head">
                <h2>
                  <Icon name="briefcase" size={14} />
                  {tr("Opportunità consigliate", "Recommended opportunities")}
                </h2>
                <Link href="/discover" className="fit-link">
                  {tr("Vedi tutte", "View all")} <Icon name="arrow-right" size={12} />
                </Link>
              </div>
              {topJobs.length === 0 ? (
                <Empty
                  text={tr(
                    "Completa profilo e preferenze per trovare annunci compatibili.",
                    "Complete your profile and preferences to find matching jobs."
                  )}
                  cta={{ href: "/preferences", label: tr("Imposta preferenze", "Set preferences") }}
                />
              ) : (
                <div className="dashboard-opportunities-grid">
                  {topJobs.map((job) => {
                    const company = job.company ?? tr("Azienda", "Company");
                    return (
                      <Link key={job.id} href={`/jobs/${job.id}`} className="dashboard-opportunity-card">
                        <CompanyLogo company={company} color={companyColor(company)} size={32} rounded={8} />
                        <div>
                          <h3>{job.title}</h3>
                          <p className="workspace-muted">
                            {company}
                            {job.location && ` · ${job.location}`}
                            {job.remote && ` · ${tr("Remoto", "Remote")}`}
                          </p>
                          {job.salaryMin && job.salaryMax && (
                            <p className="workspace-muted">
                              €{(job.salaryMin / 1000).toFixed(0)}-{(job.salaryMax / 1000).toFixed(0)}k
                            </p>
                          )}
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        </div>
      </div>
    </>
  );
}

/** Evidence-backed delivery counts (same as original) */
async function dashboardDeliveryCounts(
  userId: string
): Promise<{ confirmed: number; providerAccepted: number; unverified: number }> {
  let confirmed = 0;
  let providerAccepted = 0;
  let unverified = 0;
  let cursor: string | undefined;

  while (true) {
    const applications = await prisma.application.findMany({
      where: { userId },
      orderBy: { id: "asc" },
      take: 200,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        userId: true,
        status: true,
        submittedVia: true,
        submitConfirmation: true,
        submissionReceiptJson: true,
        emailAttempts: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { status: true, providerEmailId: true, acceptedAt: true },
        },
      },
    });

    for (const application of applications) {
      if (application.userId !== userId) continue;
      const evidence = deliveryEvidence(application);
      if (isConfirmedDelivery(evidence)) confirmed++;
      else if (evidence === "provider_accepted") providerAccepted++;
      else if (application.status === "success") unverified++;
    }

    if (applications.length < 200) break;
    cursor = applications[applications.length - 1].id;
  }

  return { confirmed, providerAccepted, unverified };
}

function Empty({ text, cta }: { text: string; cta?: { href: string; label: string } }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        gap: 8,
        padding: "6px 0 2px",
        fontSize: 12,
        color: "var(--fg-muted)",
      }}
    >
      <span>{text}</span>
      {cta && (
        <Link href={cta.href} className="ds-btn ds-btn-sm ds-btn-primary">
          {cta.label}
        </Link>
      )}
    </div>
  );
}
