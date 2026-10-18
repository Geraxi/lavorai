import { AttentionQueue } from "@/components/attention-queue";
import { getAttentionQueue } from "@/lib/attention-repository";
import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { AppTopbar } from "@/components/design/topbar";
import { Icon } from "@/components/design/icon";
import { CompanyLogo, companyColor } from "@/components/design/company-logo";
import { OnboardingChecklist } from "@/components/onboarding-checklist";
import { WelcomeModal } from "@/components/welcome-modal";
import { DashboardLiveRefresh } from "@/components/dashboard-live-refresh";
import { PostLoginCheckout } from "@/components/post-login-checkout";
import { AutoApplyToggle } from "@/components/auto-apply-toggle";
import { NewSearchButton } from "@/components/new-search-button";
import { DashboardGlobeMap } from "@/components/dashboard-globe-map";
import { DashboardFocusProvider } from "@/components/dashboard-focus";
import { DashboardRegionPanel } from "@/components/dashboard-region-panel";
import { AutoApplyReadinessCard } from "@/components/auto-apply-readiness";
import { getDashboardGlobeData, type GlobeJob } from "@/lib/dashboard-globe-data";
import { getAutoApplyReadiness } from "@/lib/auto-apply-readiness";
import { getCurrentUser } from "@/lib/session";
import { getOnboardingState } from "@/lib/onboarding";
import { prisma } from "@/lib/db";
import { deliveryEvidence, isConfirmedDelivery } from "@/lib/application-evidence";
import { rowToProfile } from "@/lib/cv-profile-types";
import { journeyStage, STAGE_LABEL, type JourneyStage } from "@/lib/ui-application-status";

export const metadata: Metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

/**
 * User dashboard with evidence-backed metrics, opportunities and interview activity.
 * Content stacks on narrow screens; all metrics use the signed-in user's records.
 */
export default async function DashboardPage() {
  const [t, locale, user] = await Promise.all([getTranslations("dashboardPage"), getLocale(), getCurrentUser()]);
  const en = locale === "en";
  const tr = (italian: string, english: string) => en ? english : italian;
  if (!user) return null;

  // Tutte le letture partono insieme: anche la readiness, che prima
  // aspettava la fine del globo per conoscere il numero di job aperti.
  const globePromise = getDashboardGlobeData(user.id);
  const openJobsPromise = globePromise.then((g) => g.stats.counts.open);
  openJobsPromise.catch(() => undefined); // l'errore emerge già da globePromise
  const [globe, onboarding, deliveryCounts, responseCount, offersCount, interviews, attention, readiness, statusGroups, latestCv, cvProfileRow] = await Promise.all([
    globePromise,
    getOnboardingState(user.id),
    dashboardDeliveryCounts(user.id),
    // Count applications with an actual recruiter-classified source row once,
    // even when the same response is present in both connected mail channels.
    prisma.application.count({ where: { userId: user.id, OR: [
      { replies: { some: { isHuman: true, isSecurityCode: false, kind: { in: ["risposta", "colloquio", "rifiutata"] } } } },
      { gmailMessages: { some: { userId: user.id, isHuman: true, kind: { in: ["risposta", "colloquio", "rifiutata"] } } } },
    ] } }),
    prisma.application.count({ where: { userId: user.id, userStatus: "offerta" } }),
    prisma.application.findMany({
      // Solo colloqui con evidenza: risposta recruiter classificata come
      // invito a colloquio, oppure stato dichiarato dall'utente. Le sessioni
      // di preparazione (interviewSessions) NON sono colloqui e non contano.
      where: { userId: user.id, OR: [{ userStatus: "colloquio" }, { lastReplyKind: "colloquio" }] },
      orderBy: { lastReplyAt: "desc" },
      take: 3,
      select: { id: true, createdAt: true, lastReplyAt: true, userStatus: true, lastReplyKind: true, job: { select: { title: true, company: true } } },
    }),
    getAttentionQueue(user.id, locale).catch(() => null),
    getAutoApplyReadiness(user.id, openJobsPromise),
    prisma.application.groupBy({ by: ["status"], where: { userId: user.id, status: { not: "diagnostic" } }, _count: { _all: true } }),
    prisma.cVDocument.findFirst({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, select: { originalFilename: true, createdAt: true } }),
    prisma.cVProfile.findUnique({ where: { userId: user.id } }),
  ]);

  // Avanzamento: stati esistenti raggruppati per tappa del percorso. Le
  // candidature "inviate" si contano SOLO con prova (deliveryCounts), mai
  // dallo status "success".
  const stageCounts = new Map<JourneyStage, number>();
  for (const group of statusGroups) {
    const stage = journeyStage(group.status);
    if (!stage || stage === "unverified" || stage === "sent") continue;
    stageCounts.set(stage, (stageCounts.get(stage) ?? 0) + group._count._all);
  }
  stageCounts.set("sent", deliveryCounts.confirmed);
  stageCounts.set("unverified", deliveryCounts.unverified);
  const progressStages: JourneyStage[] = ["awaiting_approval", "preparing", "manual", "in_flight", "sent", "unverified", "stopped"];
  const totalApplications = statusGroups.reduce((sum, group) => sum + group._count._all, 0);
  const cvProfile = cvProfileRow ? rowToProfile(cvProfileRow) : null;

  // Opportunità consigliate: migliori annunci aperti per match, una per azienda.
  const seen = new Set<string>();
  const recommended: GlobeJob[] = [];
  for (const m of globe.markers) for (const j of m.jobs) {
    if (j.kind !== "open") continue;
    const k = (j.company ?? j.id).toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    recommended.push(j);
  }
  recommended.sort((a, b) => (b.match ?? 0) - (a.match ?? 0));

  const greetingName = (user.name ?? user.email.split("@")[0]).split(/\s+/)[0];
  const showWelcome = !user.welcomeSeenAt;

  const countryCounts = new Map<string, number>();
  for (const marker of globe.markers) countryCounts.set(marker.country, (countryCounts.get(marker.country) ?? 0) + marker.counts.open);
  const countries = [...countryCounts].sort((a, b) => b[1] - a[1]).slice(0, 4);

  return (
    <>
      <WelcomeModal show={showWelcome} />
      <PostLoginCheckout />
      <DashboardLiveRefresh />
      <AppTopbar title={t("title")} actions={<NewSearchButton locale={locale} />} />
      <DashboardFocusProvider>
        <div className="workspace-page workspace-dashboard">
          <div className="dashboard-top-row"><header className="workspace-heading">
            <div>
              <h1>{t("greeting", { name: greetingName })}</h1>
              <p>{tr("Opportunità, risposte e prossimi passi in un unico posto.", "Opportunities, replies and next steps in one place.")}</p>
            </div>
          </header>
          <div className="workspace-metrics" role="list">
            <Link role="listitem" href="/applications" className="workspace-metric"><strong>{deliveryCounts.confirmed}</strong><small>{tr("Invii confermati", "Confirmed submissions")}</small>{deliveryCounts.providerAccepted > 0 && <small>{deliveryCounts.providerAccepted} {tr("email accettate dal provider, consegna da confermare", "provider-accepted emails, delivery unconfirmed")}</small>}</Link>
            <Link role="listitem" href="/inbox" className="workspace-metric" title={tr("Candidature con risposte classificate come recruiter. Aperture email e ricevute automatiche escluse.", "Applications with recruiter-classified replies. Email opens and automatic receipts excluded.")}><strong>{responseCount}</strong><small>{tr("Con risposte recruiter", "With recruiter replies")}</small></Link>
            <Link role="listitem" href="/interview" className="workspace-metric"><strong>{interviews.length}</strong><small>{tr("Inviti a colloquio (ultimi 3)", "Interview invites (latest 3)")}</small></Link>
            <Link role="listitem" href="/applications" className="workspace-metric"><strong>{offersCount}</strong><small>{tr("Offerte dichiarate", "Reported offers")}</small></Link>
          </div>
          </div>
          <div className="workspace-dashboard-grid">
            <div className="workspace-stack dashboard-primary">
              <section className="workspace-panel dashboard-overview">
                <div className="fit-card-head">
                  <h2><Icon name="globe" size={14} /> {tr("Panoramica globale", "Global overview")}</h2>
                  <div className="dashboard-overview-actions"><AutoApplyToggle locale={locale} /><Link href="/discover" className="workspace-chip">{globe.stats.counts.open} {tr("opportunità sulla mappa", "mapped opportunities")}</Link></div>
                </div>
                <div className="dashboard-overview-body"><div className="dashboard-map-column"><DashboardGlobeMap markers={globe.markers} stats={globe.stats} compact />
                <div className="workspace-geography">
                  {countries.map(([country, count]) => <a key={country} href={`/jobs?where=${encodeURIComponent(new Intl.DisplayNames(["en"], { type: "region" }).of(country) ?? country)}`}><span>{new Intl.DisplayNames([locale], { type: "region" }).of(country) ?? country}</span><strong>{count}</strong></a>)}
                </div>
                </div><div className="dashboard-overview-summary">
                  <div className="dashboard-counts" aria-label={tr("Distribuzione delle posizioni sulla mappa", "Mapped position breakdown")}>
                    <h3>{tr("Posizioni sulla mappa", "Positions on the map")}</h3>
                    {([
                      ["open", tr("Opportunità", "Opportunities")],
                      ["sent", tr("Inviate", "Submitted")],
                      ["desired", tr("Desiderate", "Preferred")],
                      ["saved", tr("Salvate", "Saved")],
                    ] as const).map(([kind, label]) => <div className="dashboard-count-row" key={kind}>
                      <span>{label}</span><strong>{globe.stats.counts[kind]}</strong>
                      <div className="dashboard-count-track"><i style={{ width: `${100 * globe.stats.counts[kind] / Math.max(1, ...Object.values(globe.stats.counts))}%` }} /></div>
                    </div>)}
                  </div>
                  <DashboardRegionPanel markers={globe.markers} />
                </div></div>
              </section>
              <section className="workspace-panel dashboard-progress" aria-labelledby="dashboard-progress-title">
                <div className="fit-card-head">
                  <h2 id="dashboard-progress-title"><Icon name="send" size={14} /> {tr("Avanzamento candidature", "Application progress")}</h2>
                  <Link href="/applications" className="fit-link">{tr("Tutte", "All")} <Icon name="arrow-right" size={12} /></Link>
                </div>
                {totalApplications === 0
                  ? <Empty text={tr("Nessuna candidatura ancora. Quando LavorAI ne prepara una, qui ne segui ogni passaggio fino all’invio.", "No applications yet. Once LavorAI prepares one, you can follow each step here until it is sent.")} cta={{ href: "/discover", label: tr("Vedi le opportunità", "See opportunities") }} />
                  : <ol className="dashboard-progress-list">
                    {progressStages.map((stage) => {
                      const count = stageCounts.get(stage) ?? 0;
                      const label = STAGE_LABEL[stage];
                      return <li key={stage} data-stage={stage} data-empty={count === 0 ? "" : undefined}>
                        <Link href={stage === "awaiting_approval" ? "/applications" : stage === "manual" ? "/questions" : "/applications"}>
                          <strong>{count}</strong>
                          <span>{en ? label.en : label.it}</span>
                          <small>{en ? label.hint.en : label.hint.it}</small>
                        </Link>
                      </li>;
                    })}
                  </ol>}
              </section>
              <AttentionQueue queue={attention} state={onboarding} locale={locale} />
              <section className="workspace-panel dashboard-opportunities">
                <div className="fit-card-head">
                  <h2>{tr("Opportunità selezionate", "Selected opportunities")}</h2>
                  <Link href="/jobs" className="fit-link">{tr("Vedi tutte", "View all")} <Icon name="arrow-right" size={12} /></Link>
                </div>
                {recommended.length === 0 ? <Empty text={tr("Completa profilo e preferenze per trovare annunci compatibili.", "Complete your profile and preferences to find matching jobs.")} cta={{ href: "/preferences", label: tr("Imposta le preferenze", "Set preferences") }} />
                  : recommended.slice(0, 1).map((j) => {
                    const company = j.company ?? tr("Azienda", "Company");
                    return <Link key={j.id} href={j.href} className="fit-row" style={{ gridTemplateColumns: "36px minmax(0,1fr) auto", textDecoration: "none", color: "inherit" }}>
                      <CompanyLogo company={company} color={companyColor(company)} size={32} rounded={8} />
                      <div style={{ minWidth: 0 }}><div className="fit-ellipsis" style={{ fontWeight: 600 }}>{j.title}</div><div className="fit-ellipsis workspace-muted">{company}{j.location ? ` · ${j.location}` : ""}</div></div>
                      <span className="workspace-chip">{j.match != null ? `${Math.round(j.match)}%` : tr("Aperta", "Open")}</span>
                    </Link>;
                  })}
              </section>
            </div>
            <aside className="workspace-stack dashboard-rail">
              <OnboardingChecklist state={onboarding} locale={locale} />
              <section className="workspace-panel dashboard-cv" aria-labelledby="dashboard-cv-title">
                <div className="fit-card-head">
                  <h2 id="dashboard-cv-title"><Icon name="file" size={14} /> {tr("Il tuo CV", "Your CV")}</h2>
                  <Link href="/cv" className="fit-link">{tr("Modifica", "Edit")} <Icon name="arrow-right" size={12} /></Link>
                </div>
                {!latestCv && !cvProfile
                  ? <Empty text={tr("Carica il CV: è la base di ogni candidatura su misura.", "Upload your CV: it is the base of every tailored application.")} cta={{ href: "/onboarding", label: tr("Carica il CV", "Upload CV") }} />
                  : <Link href="/cv" className="dashboard-cv-sheet" aria-label={tr("Apri e modifica il tuo CV", "Open and edit your CV")}>
                    <div className="dashboard-cv-name">{[cvProfile?.firstName, cvProfile?.lastName].filter(Boolean).join(" ") || greetingName}</div>
                    {cvProfile?.title ? <div className="dashboard-cv-title">{cvProfile.title}</div> : null}
                    {cvProfile?.summary ? <p className="dashboard-cv-summary">{cvProfile.summary}</p> : null}
                    {cvProfile && cvProfile.experiences.length > 0 && <ul className="dashboard-cv-exp">
                      {cvProfile.experiences.slice(0, 3).map((experience, index) => <li key={index}><strong>{experience.role || tr("Ruolo", "Role")}</strong><span>{[experience.company, [experience.startDate, experience.endDate].filter(Boolean).join(" – ")].filter(Boolean).join(" · ")}</span></li>)}
                    </ul>}
                    {cvProfile && cvProfile.skills.length > 0 && <div className="dashboard-cv-skills">{cvProfile.skills.slice(0, 6).map((skill) => <span key={skill.name}>{skill.name}</span>)}</div>}
                  </Link>}
                {latestCv && <p className="workspace-muted dashboard-cv-file">{latestCv.originalFilename} · {tr("caricato il", "uploaded")} {latestCv.createdAt.toLocaleDateString(en ? "en-GB" : "it-IT", { day: "numeric", month: "short", year: "numeric" })}</p>}
              </section>
              <section className="workspace-panel">
                <h2>{tr("Colloqui", "Interviews")}</h2>
                <p className="workspace-muted">{tr("Inviti riconosciuti nelle email dei recruiter o segnati da te. Le date indicano l’ultima risposta, non un appuntamento confermato.", "Invites recognised in recruiter emails or marked by you. Dates show the latest reply, not a confirmed appointment.")}</p>
                {interviews.length === 0 ? <Empty text={tr("Nessun invito a colloquio registrato.", "No interview invites recorded yet.")} /> : interviews.map((a) => {
                  const when = a.lastReplyAt ?? a.createdAt;
                  return <Link key={a.id} href={`/applications?id=${encodeURIComponent(a.id)}`} className="fit-row" style={{ gridTemplateColumns: "1fr auto", color: "inherit" }}>
                    <div><strong>{a.job.company ?? tr("Azienda", "Company")}</strong><p className="workspace-muted">{a.job.title} · {a.lastReplyKind === "colloquio" ? tr("da email recruiter", "from recruiter email") : tr("segnato da te", "marked by you")}</p></div>
                    <small className="workspace-muted">{when.toLocaleDateString(en ? "en-GB" : "it-IT", { day: "numeric", month: "short" })}</small>
                  </Link>;
                })}
                <Link href="/interview" className="ds-btn" style={{ marginTop: 14 }}><Icon name="sparkles" size={13} /> {tr("Prepara un colloquio", "Practice an interview")}</Link>
              </section>
              <AutoApplyReadinessCard readiness={readiness} locale={locale} />

            </aside>
          </div>
        </div>
      </DashboardFocusProvider>
    </>
  );
}

/** Read bounded pages, rather than loading every attempt or trusting legacy
 * status strings. Every page is owner-scoped and each application counts once.
 */
async function dashboardDeliveryCounts(userId: string): Promise<{ confirmed: number; providerAccepted: number; unverified: number }> {
  let confirmed = 0; let providerAccepted = 0; let unverified = 0; let cursor: string | undefined;
  while (true) {
    const applications = await prisma.application.findMany({
      where: { userId }, orderBy: { id: "asc" }, take: 200,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: { id: true, userId: true, status: true, submittedVia: true, submitConfirmation: true, submissionReceiptJson: true,
        emailAttempts: { orderBy: { createdAt: "desc" }, take: 1, select: { status: true, providerEmailId: true, acceptedAt: true } },
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
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 8, padding: "6px 0 2px", fontSize: 12, color: "var(--fg-muted)" }}>
      <span>{text}</span>
      {cta && <Link href={cta.href} className="ds-btn ds-btn-sm ds-btn-primary">{cta.label}</Link>}
    </div>
  );
}
