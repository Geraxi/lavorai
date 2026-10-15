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

export const metadata: Metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

/**
 * User dashboard with evidence-backed metrics, opportunities and interview activity.
 * Content stacks on narrow screens; all metrics use the signed-in user's records.
 */
export default async function DashboardPage() {
  const t = await getTranslations("dashboardPage");
  const locale = await getLocale();
  const en = locale === "en";
  const tr = (italian: string, english: string) => en ? english : italian;
  const user = await getCurrentUser();
  if (!user) return null;

  const [globe, onboarding, deliveryCounts, responseCount, offersCount, interviews] = await Promise.all([
    getDashboardGlobeData(user.id),
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
      where: { userId: user.id, OR: [{ userStatus: "colloquio" }, { lastReplyKind: "colloquio" }, { interviewSessions: { some: {} } }] },
      orderBy: { lastReplyAt: "desc" },
      take: 3,
      select: { id: true, createdAt: true, lastReplyAt: true, job: { select: { title: true, company: true } }, interviewSessions: { select: { startedAt: true }, orderBy: { createdAt: "desc" }, take: 1 } },
    }),
  ]);

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
  const allDone = onboarding.hasUploadedCv && onboarding.hasSetPreferences && onboarding.hasFirstApplication;
  const readiness = await getAutoApplyReadiness(user.id, globe.stats.counts.open);

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
        <div className="workspace-page">
          <header className="workspace-heading">
            <div>
              <div className="workspace-eyebrow">{tr("Il tuo spazio di lavoro", "Your workspace")} / LavorAI</div>
              <h1>{t("greeting", { name: greetingName })}</h1>
              <p>{tr("Opportunità, risposte e prossimi passi in un unico posto.", "Opportunities, replies and next steps in one place.")}</p>
            </div>
            <AutoApplyToggle locale={locale} />
          </header>
          <div className="workspace-metrics" role="list">
            <Link role="listitem" href="/applications" className="workspace-metric"><strong>{deliveryCounts.confirmed}</strong><small>{tr("Invii confermati", "Confirmed submissions")}</small>{deliveryCounts.providerAccepted > 0 && <small>{deliveryCounts.providerAccepted} {tr("email accettate dal provider, consegna da confermare", "provider-accepted emails, delivery unconfirmed")}</small>}</Link>
            <Link role="listitem" href="/inbox" className="workspace-metric" title={tr("Candidature con risposte classificate come recruiter. Aperture email e ricevute automatiche escluse.", "Applications with recruiter-classified replies. Email opens and automatic receipts excluded.")}><strong>{responseCount}</strong><small>{tr("Con risposte recruiter", "With recruiter replies")}</small></Link>
            <Link role="listitem" href="/interview" className="workspace-metric"><strong>{interviews.length}</strong><small>{tr("Attività colloqui recenti (max 3)", "Recent interview activity (up to 3)")}</small></Link>
            <Link role="listitem" href="/applications" className="workspace-metric"><strong>{offersCount}</strong><small>{tr("Offerte dichiarate", "Reported offers")}</small></Link>
          </div>
          <div className="workspace-dashboard-grid">
            <div className="workspace-stack">
              <section className="workspace-panel">
                <div className="fit-card-head">
                  <h2><Icon name="globe" size={14} /> {tr("Panoramica globale", "Global overview")}</h2>
                  <Link href="/discover" className="workspace-chip">{globe.stats.counts.open} {tr("opportunità sulla mappa", "mapped opportunities")}</Link>
                </div>
                <DashboardGlobeMap markers={globe.markers} stats={globe.stats} />
                <div className="workspace-geography">
                  {countries.map(([country, count]) => <a key={country} href={`/jobs?where=${encodeURIComponent(new Intl.DisplayNames(["en"], { type: "region" }).of(country) ?? country)}`}><span>{new Intl.DisplayNames([locale], { type: "region" }).of(country) ?? country}</span><strong>{count}</strong></a>)}
                </div>
              </section>
              <DashboardRegionPanel markers={globe.markers} />
              <section className="workspace-panel">
                <div className="fit-card-head">
                  <h2>{tr("Opportunità selezionate", "Selected opportunities")}</h2>
                  <Link href="/jobs" className="fit-link">{tr("Vedi tutte", "View all")} <Icon name="arrow-right" size={12} /></Link>
                </div>
                {recommended.length === 0 ? <Empty text={tr("Completa profilo e preferenze per trovare annunci compatibili.", "Complete your profile and preferences to find matching jobs.")} cta={{ href: "/preferences", label: tr("Imposta le preferenze", "Set preferences") }} />
                  : recommended.slice(0, 4).map((j) => {
                    const company = j.company ?? tr("Azienda", "Company");
                    return <Link key={j.id} href={j.href} className="fit-row" style={{ gridTemplateColumns: "36px minmax(0,1fr) auto", textDecoration: "none", color: "inherit" }}>
                      <CompanyLogo company={company} color={companyColor(company)} size={32} rounded={8} />
                      <div style={{ minWidth: 0 }}><div className="fit-ellipsis" style={{ fontWeight: 600 }}>{j.title}</div><div className="fit-ellipsis workspace-muted">{company}{j.location ? ` · ${j.location}` : ""}</div></div>
                      <span className="workspace-chip">{j.match != null ? `${Math.round(j.match)}%` : tr("Aperta", "Open")}</span>
                    </Link>;
                  })}
              </section>
            </div>
            <aside className="workspace-stack">
              <section className="workspace-panel">
                <div className="workspace-eyebrow">{tr("Preparati al prossimo passo", "Prepare your next step")}</div>
                <h2>{tr("Attività colloqui", "Interview activity")}</h2>
                <p className="workspace-muted">{tr("Inviti rilevati, stati dichiarati e sessioni di preparazione. Le date non sono appuntamenti confermati.", "Detected invitations, reported statuses and practice sessions. These dates are not confirmed appointments.")}</p>
                {interviews.length === 0 ? <Empty text={tr("Nessuna attività colloquio registrata.", "No interview activity recorded yet.")} /> : interviews.map((a) => {
                  const when = a.lastReplyAt ?? a.createdAt;
                  return <Link key={a.id} href={`/applications?id=${encodeURIComponent(a.id)}`} className="fit-row" style={{ gridTemplateColumns: "1fr auto", color: "inherit" }}>
                    <div><strong>{a.job.company ?? tr("Azienda", "Company")}</strong><p className="workspace-muted">{a.job.title}</p></div>
                    <small className="workspace-muted">{when.toLocaleDateString(en ? "en-GB" : "it-IT", { day: "numeric", month: "short" })}</small>
                  </Link>;
                })}
                <Link href="/interview" className="ds-btn ds-btn-primary" style={{ marginTop: 14 }}><Icon name="sparkles" size={13} /> {tr("Prepara un colloquio", "Practice an interview")}</Link>
              </section>
              <AutoApplyReadinessCard readiness={readiness} locale={locale} />
              {!allDone && <OnboardingChecklist state={onboarding} locale={locale} />}
              <section className="workspace-panel">
                <h2>{tr("Risposte e aggiornamenti", "Replies and updates")}</h2>
                <p className="workspace-muted">{tr("Leggi i messaggi ricevuti e aggiorna lo stato delle tue candidature.", "Read received messages and update your application status.")}</p>
                <Link href="/inbox" className="ds-btn" style={{ marginTop: 14 }}><Icon name="inbox" size={13} /> {tr("Apri inbox", "Open inbox")}</Link>
              </section>
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
async function dashboardDeliveryCounts(userId: string): Promise<{ confirmed: number; providerAccepted: number }> {
  let confirmed = 0; let providerAccepted = 0; let cursor: string | undefined;
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
    }
    if (applications.length < 200) break;
    cursor = applications[applications.length - 1].id;
  }
  return { confirmed, providerAccepted };
}

function Empty({ text, cta }: { text: string; cta?: { href: string; label: string } }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 8, padding: "6px 0 2px", fontSize: 12, color: "var(--fg-muted)" }}>
      <span>{text}</span>
      {cta && <Link href={cta.href} className="ds-btn ds-btn-sm ds-btn-primary">{cta.label}</Link>}
    </div>
  );
}
