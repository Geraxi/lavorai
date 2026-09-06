import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { AppTopbar } from "@/components/design/topbar";
import { Icon } from "@/components/design/icon";
import { CompanyLogo, companyColor } from "@/components/design/company-logo";
import { ThemeToggle } from "@/components/design/theme-toggle";
import { OnboardingChecklist } from "@/components/onboarding-checklist";
import { WelcomeModal } from "@/components/welcome-modal";
import { DashboardLiveRefresh } from "@/components/dashboard-live-refresh";
import { PostLoginCheckout } from "@/components/post-login-checkout";
import { AutoApplyToggle } from "@/components/auto-apply-toggle";
import { NewSearchButton } from "@/components/new-search-button";
import { DashboardGlobeMap } from "@/components/dashboard-globe-map";
import { getDashboardGlobeData, type GlobeJob } from "@/lib/dashboard-globe-data";
import { getCurrentUser } from "@/lib/session";
import { getOnboardingState } from "@/lib/onboarding";
import { prisma } from "@/lib/db";

export const metadata: Metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

/**
 * Dashboard utente, tutta in un viewport (nessuno scroll di pagina).
 * Sinistra: globo hero con saluto, filtri, pin e card. Destra: riepilogo
 * candidature, opportunità consigliate, prossimi colloqui. Numeri reali.
 */
export default async function DashboardPage() {
  const t = await getTranslations("dashboardPage");
  const user = await getCurrentUser();
  if (!user) return null;

  const delivered = { userId: user.id, status: "success", submittedVia: { not: null } } as const;
  const [globe, onboarding, sentCount, viewedCount, offersCount, interviews] = await Promise.all([
    getDashboardGlobeData(user.id),
    getOnboardingState(user.id),
    prisma.application.count({ where: delivered }),
    prisma.application.count({ where: { ...delivered, OR: [{ userStatus: "vista" }, { userStatus: null, viewedAt: { not: null } }, { lastReplyKind: "risposta" }] } }),
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

  const greeting = (
    <>
      <h1 className="fit-h1">{t("greeting", { name: greetingName })} 👋</h1>
      <p className="dg-head-lead">LavorAI sta cercando opportunità per te in tutto il mondo.</p>
      <p className="dg-head-sub">Esplora dove stiamo trovando le migliori opportunità per il tuo profilo.</p>
    </>
  );

  return (
    <>
      <WelcomeModal show={showWelcome} />
      <PostLoginCheckout />
      <DashboardLiveRefresh />
      <AppTopbar title={t("title")} actions={<><ThemeToggle /><AutoApplyToggle /><NewSearchButton /></>} />

      <div className="fit-page dg-page">
        <DashboardGlobeMap markers={globe.markers} stats={globe.stats} greeting={greeting} />

        <aside className="dg-side">
          <div className="dg-summary" role="list">
            <Link role="listitem" href="/applications" className="dg-sum"><span className="fit-num">{sentCount}</span><small>Candidature inviate</small></Link>
            <Link role="listitem" href="/applications" className="dg-sum"><span className="fit-num">{viewedCount}</span><small>In valutazione</small></Link>
            <Link role="listitem" href="/interview" className="dg-sum"><span className="fit-num">{interviews.length}</span><small>Colloqui</small></Link>
            <Link role="listitem" href="/applications" className="dg-sum"><span className="fit-num">{offersCount}</span><small>Offerte</small></Link>
          </div>

          {!allDone && <OnboardingChecklist state={onboarding} />}

          <div className="fit-card dg-side-card">
            <div className="fit-card-head">
              <div className="fit-card-title"><Icon name="sparkles" size={15} /> Opportunità consigliate</div>
              <Link href="/jobs" className="fit-link">Vedi tutte <Icon name="arrow-right" size={12} /></Link>
            </div>
            <div className="fit-body fit-scroll">
              {recommended.length === 0 ? (
                <Empty text="Appena il tuo profilo e le preferenze sono pronti, qui compaiono gli annunci più compatibili." cta={{ href: "/preferences", label: "Imposta le preferenze" }} />
              ) : (
                recommended.slice(0, 4).map((j) => {
                  const company = j.company ?? "Azienda";
                  return (
                    <Link key={j.id} href={j.href} className="fit-row" style={{ gridTemplateColumns: "30px 1fr auto", textDecoration: "none", color: "inherit" }}>
                      <CompanyLogo company={company} color={companyColor(company)} size={30} rounded={8} />
                      <div style={{ minWidth: 0 }}>
                        <div className="fit-ellipsis" style={{ fontWeight: 600, fontSize: 12.5 }}>{j.title}</div>
                        <div className="fit-ellipsis" style={{ fontSize: 11.5, color: "var(--fg-muted)" }}>{company}{j.location ? ` · ${j.location}` : ""}</div>
                      </div>
                      <span className="dg-chip" style={{ ["--c" as string]: "#2ED69A" }}>{j.match != null ? `${Math.round(j.match)}%` : "Aperta"}</span>
                    </Link>
                  );
                })
              )}
            </div>
          </div>

          <div className="fit-card dg-side-card">
            <div className="fit-card-head">
              <div className="fit-card-title"><Icon name="calendar" size={15} /> Prossimi colloqui</div>
              <Link href="/interview" className="fit-link">Vedi tutti <Icon name="arrow-right" size={12} /></Link>
            </div>
            <div className="fit-body fit-scroll">
              {interviews.length === 0 ? (
                <Empty text="Nessun colloquio in programma. Quando un recruiter ti invita, lo vedrai qui." />
              ) : (
                interviews.map((a) => {
                  const when = a.interviewSessions[0]?.startedAt ?? a.lastReplyAt ?? a.createdAt;
                  const company = a.job.company ?? "Azienda";
                  return (
                    <Link key={a.id} href="/interview" className="fit-row" style={{ gridTemplateColumns: "30px 1fr auto", textDecoration: "none", color: "inherit" }}>
                      <CompanyLogo company={company} color={companyColor(company)} size={30} rounded={8} />
                      <div style={{ minWidth: 0 }}>
                        <div className="fit-ellipsis" style={{ fontWeight: 600, fontSize: 12.5 }}>{company}</div>
                        <div className="fit-ellipsis" style={{ fontSize: 11.5, color: "var(--fg-muted)" }}>{a.job.title} · Video call</div>
                      </div>
                      <div style={{ textAlign: "right", fontSize: 11.5, color: "var(--fg-muted)", whiteSpace: "nowrap" }}>
                        <div style={{ fontWeight: 600, color: "var(--fg)" }}>{when.getDate()} {when.toLocaleDateString("it-IT", { month: "short" }).replace(".", "")}</div>
                        <div style={{ fontSize: 10.5, color: "var(--fg-subtle)" }}>{a.interviewSessions[0]?.startedAt ? when.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" }) : "da fissare"}</div>
                      </div>
                    </Link>
                  );
                })
              )}
            </div>
          </div>
        </aside>
      </div>
    </>
  );
}

function Empty({ text, cta }: { text: string; cta?: { href: string; label: string } }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 8, padding: "6px 0 2px", fontSize: 12, color: "var(--fg-muted)" }}>
      <span>{text}</span>
      {cta && <Link href={cta.href} className="ds-btn ds-btn-sm ds-btn-primary">{cta.label}</Link>}
    </div>
  );
}
