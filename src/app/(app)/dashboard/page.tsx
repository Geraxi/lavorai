import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { AppTopbar } from "@/components/design/topbar";
import { Icon } from "@/components/design/icon";
import { CompanyLogo, companyColor } from "@/components/design/company-logo";
import { StatusChip } from "@/components/design/status-chip";
import { ThemeToggle } from "@/components/design/theme-toggle";
import { OnboardingChecklist } from "@/components/onboarding-checklist";
import { WelcomeModal } from "@/components/welcome-modal";
import { DashboardLiveRefresh } from "@/components/dashboard-live-refresh";
import { PostLoginCheckout } from "@/components/post-login-checkout";
import { AutoApplyToggle } from "@/components/auto-apply-toggle";
import { NewSearchButton } from "@/components/new-search-button";
import { DashboardGlobeMap } from "@/components/dashboard-globe-map";
import type { CityMarker } from "@/components/dashboard-globe";
import { getUIApplications } from "@/lib/ui-applications";
import { getCurrentUser } from "@/lib/session";
import { getOnboardingState } from "@/lib/onboarding";
import { matchCity } from "@/lib/city-centroids";
import { prisma } from "@/lib/db";

export const metadata: Metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

/**
 * Dashboard utente: globo 3D ruotabile al centro con i pin per città
 * (posizioni aperte / candidature inviate / posizioni pronte), KPI a sinistra,
 * promo + controlli a destra, tre liste in basso. Tutti i numeri sono reali.
 */
export default async function DashboardPage() {
  const t = await getTranslations("dashboardPage");
  const user = await getCurrentUser();
  if (!user) return null;

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const since30 = new Date(now.getTime() - 30 * 86400_000);
  const delivered = { userId: user.id, status: "success", submittedVia: { not: null } } as const;

  const [applications, onboarding, openJobs, sentApps, readyApps, interviews, sentMonth, readyCount, openCount] = await Promise.all([
    getUIApplications(user.id),
    getOnboardingState(user.id),
    prisma.job.findMany({ where: { closedAt: null, cachedAt: { gte: since30 } }, select: { location: true, remote: true }, take: 6000 }),
    prisma.application.findMany({ where: delivered, select: { job: { select: { location: true } } }, take: 2000 }),
    prisma.application.findMany({ where: { userId: user.id, status: { in: ["ready_to_apply", "awaiting_consent"] } }, select: { id: true, createdAt: true, job: { select: { title: true, company: true, location: true } } }, orderBy: { createdAt: "desc" }, take: 200 }),
    prisma.application.findMany({
      where: { userId: user.id, OR: [{ userStatus: "colloquio" }, { lastReplyKind: "colloquio" }, { interviewSessions: { some: {} } }] },
      orderBy: { lastReplyAt: "desc" },
      take: 3,
      select: { id: true, createdAt: true, lastReplyAt: true, job: { select: { title: true, company: true } }, interviewSessions: { select: { startedAt: true }, orderBy: { createdAt: "desc" }, take: 1 } },
    }),
    prisma.application.count({ where: { ...delivered, createdAt: { gte: monthStart } } }),
    prisma.application.count({ where: { userId: user.id, status: { in: ["ready_to_apply", "awaiting_consent"] } } }),
    prisma.job.count({ where: { closedAt: null, cachedAt: { gte: since30 } } }),
  ]);

  // Aggregazione per città (pin del globo)
  const byCity = new Map<string, CityMarker>();
  const bump = (loc: string | null | undefined, k: "open" | "sent" | "ready") => {
    const c = matchCity(loc);
    if (!c) return;
    const m = byCity.get(c.key) ?? { key: c.key, name: c.name, lat: c.lat, lng: c.lng, open: 0, sent: 0, ready: 0 };
    m[k]++;
    byCity.set(c.key, m);
  };
  for (const j of openJobs) bump(j.location, "open");
  for (const a of sentApps) bump(a.job.location, "sent");
  for (const a of readyApps) bump(a.job.location, "ready");
  const markers = [...byCity.values()];

  const greetingName = (user.name ?? user.email.split("@")[0]).split(/\s+/)[0];
  const showWelcome = !user.welcomeSeenAt;
  const allDone = onboarding.hasUploadedCv && onboarding.hasSetPreferences && onboarding.hasFirstApplication;

  return (
    <>
      <WelcomeModal show={showWelcome} />
      <PostLoginCheckout />
      <DashboardLiveRefresh />
      <AppTopbar title={t("title")} actions={<><ThemeToggle /><AutoApplyToggle /></>} />

      <div className="fit-page" style={{ gridTemplateColumns: "250px minmax(0,1fr) 232px", gridTemplateRows: "minmax(0,1fr) auto", gap: 16 }}>
        {/* Colonna sinistra: saluto + KPI */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12, minHeight: 0 }}>
          <div style={{ marginBottom: 4 }}>
            <h1 className="fit-h1">{t("greeting", { name: greetingName })} 👋</h1>
            <p className="fit-hero-sub" style={{ lineHeight: 1.5 }}>Il mondo è pieno di opportunità. Tu concentrati sul percorso, noi ti aiutiamo a trovarle.</p>
          </div>
          <KpiCard href="/jobs" icon="map-pin" color="#22c55e" n={openCount} label="Posizioni aperte" sub="nel mondo" />
          <KpiCard href="/applications" icon="send" color="#3b82f6" n={sentMonth} label="Candidature inviate" sub="questo mese" />
          <KpiCard href="/applications" icon="star" color="#f59e0b" n={readyCount} label="Posizioni pronte" sub="da approvare o inviare" />
          <KpiCard href="/interview" icon="user" color="#a78bfa" n={interviews.length} label="Colloqui in programma" sub="prossimi 14 giorni" />
        </div>

        {/* Globo */}
        <div style={{ minHeight: 480, minWidth: 0, position: "relative" }}>
          <DashboardGlobeMap markers={markers} height={580} />
        </div>

        {/* Colonna destra */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12, minHeight: 0 }}>
          <div className="fit-card" style={{ padding: 14, gap: 10 }}>
            <div style={{ fontSize: 12.5, color: "var(--fg-muted)", lineHeight: 1.45 }}>Avvia un nuovo round su un ruolo specifico: l'AI cerca, prepara il CV e candida.</div>
            <NewSearchButton />
          </div>
          {!allDone ? (
            <OnboardingChecklist state={onboarding} />
          ) : (
            <div className="fit-card" style={{ padding: 0, overflow: "hidden", flex: "0 0 auto" }}>
              <div style={{ height: 120, background: "radial-gradient(120% 80% at 30% 20%, rgba(34,197,94,0.35), transparent 60%), linear-gradient(180deg, #0f2a1f, #0a1a2f)", position: "relative" }}>
                <Icon name="globe" size={40} style={{ position: "absolute", right: 16, bottom: 12, color: "rgba(255,255,255,0.25)" }} />
              </div>
              <div style={{ padding: "14px 16px 16px" }}>
                <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: "-0.01em" }}>Più opportunità, più libertà.</div>
                <p style={{ fontSize: 12.5, color: "var(--fg-muted)", lineHeight: 1.5, margin: "6px 0 10px" }}>Stiamo costruendo un mondo del lavoro più aperto. Tu ne fai parte.</p>
                <Link href="/discover" className="fit-link">Scopri <Icon name="arrow-right" size={12} /></Link>
              </div>
            </div>
          )}
        </div>

        {/* Riga inferiore */}
        <div style={{ gridColumn: "1 / -1", display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 14 }}>
          <div className="fit-card">
            <div className="fit-card-head">
              <div className="fit-card-title"><Icon name="file" size={15} /> Candidature recenti</div>
              <Link href="/applications" className="fit-link">Vedi tutte <Icon name="arrow-right" size={12} /></Link>
            </div>
            {applications.length === 0 ? (
              <Empty text="Nessuna candidatura ancora. Attiva l'auto-apply e la prima parte entro poco." cta={{ href: "/preferences", label: "Imposta le preferenze" }} />
            ) : (
              applications.slice(0, 3).map((a) => (
                <Link key={a.id} href="/applications" className="fit-row" style={{ gridTemplateColumns: "34px 1fr auto auto", textDecoration: "none", color: "inherit" }}>
                  <CompanyLogo company={a.company} color={a.color} size={34} rounded={9} />
                  <div style={{ minWidth: 0 }}>
                    <div className="fit-ellipsis" style={{ fontWeight: 600 }}>{a.role}</div>
                    <div className="fit-ellipsis" style={{ fontSize: 12, color: "var(--fg-muted)" }}>{a.company} · {a.location}</div>
                  </div>
                  <StatusChip status={a.status} />
                  <span style={{ fontSize: 11.5, color: "var(--fg-subtle)", whiteSpace: "nowrap" }}>{a.applied}</span>
                </Link>
              ))
            )}
          </div>

          <div className="fit-card">
            <div className="fit-card-head">
              <div className="fit-card-title"><Icon name="star" size={15} /> Posizioni pronte</div>
              <Link href="/applications" className="fit-link">Vedi tutte <Icon name="arrow-right" size={12} /></Link>
            </div>
            {readyApps.length === 0 ? (
              <Empty text="Nessuna posizione in attesa: quando l'AI prepara un CV per un annuncio, compare qui." />
            ) : (
              readyApps.slice(0, 3).map((a) => {
                const company = a.job.company ?? "Azienda";
                return (
                  <Link key={a.id} href="/applications" className="fit-row" style={{ gridTemplateColumns: "34px 1fr auto auto", textDecoration: "none", color: "inherit" }}>
                    <CompanyLogo company={company} color={companyColor(company)} size={34} rounded={9} />
                    <div style={{ minWidth: 0 }}>
                      <div className="fit-ellipsis" style={{ fontWeight: 600 }}>{a.job.title}</div>
                      <div className="fit-ellipsis" style={{ fontSize: 12, color: "var(--fg-muted)" }}>{company}{a.job.location ? ` · ${a.job.location}` : ""}</div>
                    </div>
                    <span className="ds-chip ds-chip-amber">Pronta</span>
                    <span style={{ fontSize: 11.5, color: "var(--fg-subtle)", whiteSpace: "nowrap" }}>{relTime(a.createdAt)}</span>
                  </Link>
                );
              })
            )}
          </div>

          <div className="fit-card">
            <div className="fit-card-head">
              <div className="fit-card-title"><Icon name="calendar" size={15} /> Prossimi colloqui</div>
              <Link href="/interview" className="fit-link">Vedi tutti <Icon name="arrow-right" size={12} /></Link>
            </div>
            {interviews.length === 0 ? (
              <Empty text="Nessun colloquio in programma. Quando un recruiter ti invita, lo vedrai qui." />
            ) : (
              interviews.map((a) => {
                const when = a.interviewSessions[0]?.startedAt ?? a.lastReplyAt ?? a.createdAt;
                const company = a.job.company ?? "Azienda";
                return (
                  <Link key={a.id} href="/interview" className="fit-row" style={{ gridTemplateColumns: "34px 1fr auto", textDecoration: "none", color: "inherit" }}>
                    <CompanyLogo company={company} color={companyColor(company)} size={34} rounded={9} />
                    <div style={{ minWidth: 0 }}>
                      <div className="fit-ellipsis" style={{ fontWeight: 600 }}>{company}</div>
                      <div className="fit-ellipsis" style={{ fontSize: 12, color: "var(--fg-muted)" }}>{a.job.title} · Video call</div>
                    </div>
                    <div style={{ textAlign: "right", fontSize: 12, color: "var(--fg-muted)", whiteSpace: "nowrap" }}>
                      <div style={{ fontWeight: 600, color: "var(--fg)" }}>{when.getDate()} {when.toLocaleDateString("it-IT", { month: "short" }).replace(".", "")}</div>
                      <div style={{ fontSize: 11, color: "var(--fg-subtle)" }}>{a.interviewSessions[0]?.startedAt ? when.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" }) : "da fissare"}</div>
                    </div>
                  </Link>
                );
              })
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function KpiCard({ href, icon, color, n, label, sub }: { href: string; icon: "map-pin" | "send" | "star" | "user"; color: string; n: number; label: string; sub: string }) {
  return (
    <Link href={href} className="fit-card" style={{ padding: "14px 16px", flexDirection: "row", alignItems: "center", gap: 12, textDecoration: "none", color: "inherit" }}>
      <span style={{ width: 34, height: 34, borderRadius: 10, background: `color-mix(in srgb, ${color} 16%, transparent)`, color, display: "grid", placeItems: "center", flexShrink: 0 }}><Icon name={icon} size={16} /></span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="fit-num" style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1 }}>{n.toLocaleString("it-IT")}</div>
        <div style={{ fontSize: 12.5, color: "var(--fg)", marginTop: 4 }}>{label}</div>
        <div style={{ fontSize: 11.5, color: "var(--fg-subtle)" }}>{sub}</div>
      </div>
      <Icon name="chevron-right" size={14} style={{ color: "var(--fg-subtle)" }} />
    </Link>
  );
}

function Empty({ text, cta }: { text: string; cta?: { href: string; label: string } }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 8, padding: "10px 0 4px", fontSize: 12.5, color: "var(--fg-muted)" }}>
      <span>{text}</span>
      {cta && <Link href={cta.href} className="ds-btn ds-btn-sm ds-btn-primary">{cta.label}</Link>}
    </div>
  );
}

function relTime(d: Date) {
  const min = Math.round((Date.now() - d.getTime()) / 60_000);
  if (min < 60) return `${Math.max(1, min)} min fa`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h}h fa`;
  const g = Math.round(h / 24);
  return g === 1 ? "ieri" : `${g}g fa`;
}
