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
import { getUIApplications } from "@/lib/ui-applications";
import { getCurrentUser } from "@/lib/session";
import { getOnboardingState } from "@/lib/onboarding";
import { prisma } from "@/lib/db";

export const metadata: Metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

/**
 * Dashboard fit-to-viewport (nessuno scroll di pagina):
 *   hero · banner AI (pipeline) · [Questa settimana | Prossimi colloqui]
 *   · [Candidature recenti | Messaggi e notifiche] · banner Scopri.
 * Tutti i numeri sono reali (Prisma), niente mock.
 */
export default async function DashboardPage() {
  const t = await getTranslations("dashboardPage");
  const user = await getCurrentUser();
  if (!user) return null;

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  // Settimana corrente lun→dom
  const weekStart = new Date(todayStart);
  weekStart.setDate(todayStart.getDate() - ((todayStart.getDay() + 6) % 7));
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  const sevenDaysAgo = new Date(todayStart.getTime() - 7 * 86400_000);

  const [applications, onboarding, prefs] = await Promise.all([
    getUIApplications(user.id),
    getOnboardingState(user.id),
    prisma.userPreferences.findUnique({
      where: { userId: user.id },
      select: { autoApplyMode: true, dailyCap: true },
    }),
  ]);

  const delivered = { userId: user.id, status: "success", submittedVia: { not: null } } as const;

  const [
    sentWeek,
    viewedWeek,
    interviewsWeek,
    offersWeek,
    sentToday,
    matchedTotal,
    cvPrepared,
    jobsFound,
    upcomingInterviews,
    replies,
    pendingQuestions,
    awaitingConsent,
  ] = await Promise.all([
    prisma.application.count({ where: { ...delivered, createdAt: { gte: weekStart } } }),
    prisma.application.count({ where: { ...delivered, viewedAt: { not: null }, lastReplyAt: null, createdAt: { gte: weekStart } } }),
    prisma.application.count({ where: { userId: user.id, OR: [{ userStatus: "colloquio" }, { lastReplyKind: "colloquio" }], createdAt: { gte: weekStart } } }),
    prisma.application.count({ where: { userId: user.id, userStatus: "offerta", createdAt: { gte: weekStart } } }),
    prisma.application.count({ where: { ...delivered, createdAt: { gte: todayStart } } }),
    prisma.application.count({ where: { userId: user.id } }),
    prisma.application.count({ where: { userId: user.id, status: { in: ["ready_to_apply", "awaiting_consent"] } } }),
    prisma.job.count({ where: { cachedAt: { gte: sevenDaysAgo } } }),
    prisma.application.findMany({
      where: { userId: user.id, OR: [{ userStatus: "colloquio" }, { lastReplyKind: "colloquio" }, { interviewSessions: { some: {} } }] },
      orderBy: { lastReplyAt: "desc" },
      take: 3,
      select: {
        id: true,
        createdAt: true,
        lastReplyAt: true,
        job: { select: { title: true, company: true } },
        interviewSessions: { select: { startedAt: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 1 },
      },
    }),
    prisma.applicationReply.findMany({
      where: { application: { userId: user.id }, isHuman: true },
      orderBy: { receivedAt: "desc" },
      take: 3,
      select: { id: true, kind: true, subject: true, receivedAt: true, application: { select: { job: { select: { company: true } } } } },
    }),
    prisma.userAnswer.count({ where: { userId: user.id, OR: [{ answer: null }, { answer: "" }] } }),
    prisma.application.count({ where: { userId: user.id, status: "awaiting_consent" } }),
  ]);

  const greetingName = (user.name ?? user.email.split("@")[0]).split(/\s+/)[0];
  const showWelcome = !user.welcomeSeenAt;
  const autoMode = prefs?.autoApplyMode ?? "manual";
  const isLive = autoMode === "auto" || autoMode === "hybrid";
  const allDone = onboarding.hasUploadedCv && onboarding.hasSetPreferences && onboarding.hasFirstApplication;

  // Prossima run tattica (08/12/16 UTC) → ora locale
  const nextRun = (() => {
    const h = now.getUTCHours();
    const slots = [8, 12, 16];
    const next = slots.find((s) => s > h) ?? slots[0];
    const d = new Date(now);
    if (next <= h) d.setUTCDate(d.getUTCDate() + 1);
    d.setUTCHours(next, 0, 0, 0);
    return d;
  })();

  // Notifiche: risposte reali dei recruiter + avvisi di sistema (reali).
  type Notice = { id: string; icon: "inbox" | "briefcase" | "bell" | "file" | "zap"; color: string; title: string; sub: string; href: string };
  const notices: Notice[] = [];
  for (const r of replies) {
    const company = r.application.job.company ?? "Recruiter";
    notices.push({
      id: r.id,
      icon: "inbox",
      color: r.kind === "colloquio" ? "#7E3FF2" : r.kind === "rifiutata" ? "#EF3E42" : "#FE5FA3",
      title: r.kind === "colloquio" ? "Invito a colloquio" : r.kind === "rifiutata" ? "Risposta ricevuta (rifiuto)" : "Feedback ricevuto",
      sub: `${company} · ${relTime(r.receivedAt)}`,
      href: "/applications",
    });
  }
  if (pendingQuestions > 0)
    notices.push({ id: "q", icon: "file", color: "#1F6BFF", title: `${pendingQuestions} ${pendingQuestions === 1 ? "domanda da rispondere" : "domande da rispondere"}`, sub: "Sblocca le candidature in attesa", href: "/questions" });
  if (awaitingConsent > 0)
    notices.push({ id: "c", icon: "zap", color: "#FFB400", title: `${awaitingConsent} ${awaitingConsent === 1 ? "candidatura da approvare" : "candidature da approvare"}`, sub: "Modalità review: conferma per inviare", href: "/applications" });
  if (!allDone)
    notices.push({ id: "p", icon: "bell", color: "#FF2954", title: "Promemoria: completa il tuo profilo", sub: "La tua visibilità può aumentare del 40%", href: onboarding.hasUploadedCv ? "/preferences" : "/cv" });
  const noticeList = notices.slice(0, 3);

  const weekTotal = Math.max(1, sentWeek);
  const seg = (n: number) => `${Math.min(100, (n / weekTotal) * 100)}%`;

  return (
    <>
      <WelcomeModal show={showWelcome} />
      <PostLoginCheckout />
      <DashboardLiveRefresh />
      <AppTopbar title={t("title")} actions={<ThemeToggle />} />

      <div className="fit-page" style={{ gridTemplateColumns: "1.35fr 1fr", gridTemplateRows: "auto auto minmax(0,1fr) minmax(0,1.15fr) auto" }}>
        {/* Hero */}
        <div style={{ gridColumn: "1 / -1", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
          <div>
            <h1 className="fit-h1">{t("greeting", { name: greetingName })} 👋</h1>
            <p className="fit-hero-sub">
              A <span style={{ color: "hsl(var(--primary))", fontWeight: 600 }}>LavorAI</span> sta lavorando per te. Più opportunità, più persone nel posto giusto.
            </p>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
            <AutoApplyToggle />
            <div style={{ fontSize: 12, color: "var(--fg-muted)" }}>
              {isLive ? <>Prossima ricerca {fmtNext(nextRun)}</> : "Auto-apply in pausa"}
            </div>
          </div>
        </div>

        {/* Banner AI / onboarding */}
        <div style={{ gridColumn: "1 / -1" }}>
          {!allDone ? (
            <OnboardingChecklist state={onboarding} />
          ) : (
            <div className="fit-card ds-glass-green" style={{ flexDirection: "row", alignItems: "center", gap: 20, padding: "18px 22px", position: "relative", overflow: "hidden" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 12, background: "hsl(var(--primary))", color: "#04130c", display: "grid", placeItems: "center", flexShrink: 0 }}>
                    <Icon name="zap" size={18} />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 16, fontWeight: 600, letterSpacing: "-0.01em" }}>L&apos;AI sta cercando e candidando per te</div>
                    <div style={{ fontSize: 12.5, color: "var(--fg-muted)", marginTop: 2 }}>Trova opportunità, adatta il tuo CV e invia candidature in automatico.</div>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 18, marginTop: 16, flexWrap: "wrap" }}>
                  <Step icon="search" label="Ricerca" sub={`${fmtN(jobsFound)} trovate`} />
                  <Arrow />
                  <Step icon="target" label="Match" sub={`${fmtN(matchedTotal)} compatibili`} />
                  <Arrow />
                  <Step icon="file" label="CV" sub={`${fmtN(cvPrepared)} preparate`} blue />
                  <Arrow />
                  <Step icon="send" label="Candidatura" sub={`${fmtN(sentToday)} inviate oggi`} />
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end", flexShrink: 0 }}>
                <Link href="/applications" className="ds-btn ds-btn-sm">Vedi attività <Icon name="arrow-right" size={13} /></Link>
                <NewSearchButton />
              </div>
            </div>
          )}
        </div>

        {/* Questa settimana */}
        <div className="fit-card">
          <div className="fit-card-head">
            <div>
              <div className="fit-card-title">Questa settimana</div>
              <div className="fit-card-sub">Il tuo progresso verso nuove opportunità.</div>
            </div>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--fg-muted)" }}>
              <Icon name="calendar" size={13} /> {fmtRange(weekStart, weekEnd)}
            </span>
          </div>
          <div className="fit-body" style={{ justifyContent: "center" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
              <Big n={sentWeek} label="Candidature inviate" />
              <Big n={viewedWeek} label="In valutazione" />
              <Big n={interviewsWeek} label="Colloqui" />
              <Big n={offersWeek} label="Offerte" />
            </div>
            <div style={{ position: "relative", height: 6, borderRadius: 999, background: "var(--bg-sunken)", marginTop: 18, overflow: "hidden" }}>
              <div style={{ position: "absolute", inset: 0, width: seg(sentWeek), background: "hsl(var(--primary))" }} />
              <div style={{ position: "absolute", inset: 0, width: seg(viewedWeek), background: "#1F6BFF" }} />
              <div style={{ position: "absolute", inset: 0, width: seg(interviewsWeek), background: "#7E3FF2" }} />
              <div style={{ position: "absolute", inset: 0, width: seg(offersWeek), background: "#FFB400" }} />
            </div>
            <div style={{ marginTop: 14 }}>
              <Link href="/analytics" className="fit-link">Vedi analisi <Icon name="arrow-right" size={12} /></Link>
            </div>
          </div>
        </div>

        {/* Prossimi colloqui */}
        <div className="fit-card">
          <div className="fit-card-head">
            <div className="fit-card-title"><Icon name="calendar" size={15} /> Prossimi colloqui</div>
            <Link href="/interview" className="fit-link">Vedi tutti <Icon name="arrow-right" size={12} /></Link>
          </div>
          <div className="fit-body fit-scroll">
            {upcomingInterviews.length === 0 ? (
              <Empty icon="calendar" text="Nessun colloquio in programma. Quando un recruiter ti invita, lo vedrai qui." />
            ) : (
              upcomingInterviews.map((a) => {
                const when = a.interviewSessions[0]?.startedAt ?? a.lastReplyAt ?? a.createdAt;
                const company = a.job.company ?? "Azienda";
                return (
                  <Link key={a.id} href="/interview" className="fit-row" style={{ gridTemplateColumns: "44px 32px 1fr auto", textDecoration: "none", color: "inherit" }}>
                    <div style={{ textAlign: "center", padding: "4px 0", borderRadius: 8, background: "var(--bg-sunken)", border: "1px solid var(--border-ds)", lineHeight: 1.1 }}>
                      <div style={{ fontSize: 9.5, textTransform: "uppercase", color: "var(--fg-subtle)", fontWeight: 600 }}>{when.toLocaleDateString("it-IT", { weekday: "short" }).replace(".", "")}</div>
                      <div style={{ fontSize: 11, fontWeight: 700 }}>{when.getDate()} {when.toLocaleDateString("it-IT", { month: "short" }).replace(".", "")}</div>
                    </div>
                    <CompanyLogo company={company} color={companyColor(company)} size={32} rounded={8} />
                    <div style={{ minWidth: 0 }}>
                      <div className="fit-ellipsis" style={{ fontWeight: 600 }}>{company}</div>
                      <div className="fit-ellipsis" style={{ fontSize: 12, color: "var(--fg-muted)" }}>{a.job.title}</div>
                    </div>
                    <div style={{ textAlign: "right", fontSize: 12, color: "var(--fg-muted)" }}>
                      <div>{a.interviewSessions[0]?.startedAt ? when.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" }) : "da fissare"}</div>
                      <div style={{ fontSize: 11, color: "var(--fg-subtle)" }}>Video call</div>
                    </div>
                  </Link>
                );
              })
            )}
          </div>
        </div>

        {/* Candidature recenti */}
        <div className="fit-card">
          <div className="fit-card-head">
            <div className="fit-card-title"><Icon name="file" size={15} /> Candidature recenti</div>
            <Link href="/applications" className="fit-link">Vedi tutte <Icon name="arrow-right" size={12} /></Link>
          </div>
          <div className="fit-body fit-scroll">
            {applications.length === 0 ? (
              <Empty icon="briefcase" text="Nessuna candidatura ancora. Imposta i ruoli in Preferenze e attiva l'auto-apply." cta={{ href: "/preferences", label: "Avvia l'auto-apply" }} />
            ) : (
              applications.slice(0, 5).map((a) => (
                <Link key={a.id} href="/applications" className="fit-row" style={{ gridTemplateColumns: "32px 1fr auto auto 14px", textDecoration: "none", color: "inherit" }}>
                  <CompanyLogo company={a.company} color={a.color} size={32} rounded={8} />
                  <div style={{ minWidth: 0 }}>
                    <div className="fit-ellipsis" style={{ fontWeight: 600 }}>{a.company}</div>
                    <div className="fit-ellipsis" style={{ fontSize: 12, color: "var(--fg-muted)" }}>{a.role} · {a.location}</div>
                  </div>
                  <div style={{ fontSize: 12, color: "var(--fg-muted)", whiteSpace: "nowrap" }}>{a.applied}</div>
                  <StatusChip status={a.status} />
                  <Icon name="chevron-right" size={14} style={{ color: "var(--fg-subtle)" }} />
                </Link>
              ))
            )}
          </div>
        </div>

        {/* Messaggi e notifiche */}
        <div className="fit-card">
          <div className="fit-card-head">
            <div className="fit-card-title">
              <Icon name="bell" size={15} /> Messaggi e notifiche
              {noticeList.length > 0 && <span style={{ fontSize: 11, fontWeight: 700, padding: "1px 7px", borderRadius: 999, background: "#EF3E42", color: "#fff" }}>{noticeList.length}</span>}
            </div>
            <Link href="/applications" className="fit-link">Vedi tutte <Icon name="arrow-right" size={12} /></Link>
          </div>
          <div className="fit-body fit-scroll">
            {noticeList.length === 0 ? (
              <Empty icon="inbox" text="Nessuna notifica. Le risposte dei recruiter arriveranno qui." />
            ) : (
              noticeList.map((n) => (
                <Link key={n.id} href={n.href} className="fit-row" style={{ gridTemplateColumns: "36px 1fr 14px", textDecoration: "none", color: "inherit" }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: n.color, color: "#fff", display: "grid", placeItems: "center" }}>
                    <Icon name={n.icon} size={16} />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div className="fit-ellipsis" style={{ fontWeight: 600 }}>{n.title}</div>
                    <div className="fit-ellipsis" style={{ fontSize: 12, color: "var(--fg-muted)" }}>{n.sub}</div>
                  </div>
                  <Icon name="chevron-right" size={14} style={{ color: "var(--fg-subtle)" }} />
                </Link>
              ))
            )}
          </div>
        </div>

        {/* Scopri */}
        <div className="fit-card ds-glass-green" style={{ gridColumn: "1 / -1", flexDirection: "row", alignItems: "center", gap: 16, padding: "16px 22px" }}>
          <div style={{ width: 44, height: 44, borderRadius: 999, background: "hsl(var(--primary)/0.15)", color: "hsl(var(--primary))", display: "grid", placeItems: "center", flexShrink: 0 }}>
            <Icon name="globe" size={20} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 600, letterSpacing: "-0.01em" }}>Scopri nuove opportunità</div>
            <div style={{ fontSize: 12.5, color: "var(--fg-muted)", marginTop: 2 }}>Esplora aziende e ruoli in linea con il tuo profilo, o cerca manualmente.</div>
          </div>
          <Link href="/discover" className="ds-btn ds-btn-primary">Esplora ora <Icon name="arrow-right" size={14} /></Link>
        </div>
      </div>
    </>
  );
}

function Step({ icon, label, sub, blue }: { icon: "search" | "target" | "file" | "send"; label: string; sub: string; blue?: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, minWidth: 96 }}>
      <div style={{ width: 44, height: 44, borderRadius: 999, background: blue ? "rgba(31,107,255,0.18)" : "hsl(var(--primary)/0.14)", color: blue ? "#5B9BFF" : "hsl(var(--primary))", display: "grid", placeItems: "center" }}>
        <Icon name={icon} size={18} />
      </div>
      <div style={{ fontSize: 13, fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 11.5, color: "var(--fg-muted)", marginTop: -3 }}>{sub}</div>
    </div>
  );
}
function Arrow() {
  return <Icon name="arrow-right" size={14} style={{ color: "var(--fg-subtle)", marginBottom: 34 }} />;
}
function Big({ n, label }: { n: number; label: string }) {
  return (
    <div>
      <div className="fit-num" style={{ fontSize: 30, fontWeight: 700, letterSpacing: "-0.03em", lineHeight: 1 }}>{n}</div>
      <div style={{ fontSize: 12, color: "var(--fg-muted)", marginTop: 6 }}>{label}</div>
    </div>
  );
}
function Empty({ icon, text, cta }: { icon: "calendar" | "briefcase" | "inbox"; text: string; cta?: { href: string; label: string } }) {
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", gap: 8, padding: 12 }}>
      <Icon name={icon} size={22} style={{ color: "var(--fg-subtle)" }} />
      <div style={{ fontSize: 12.5, color: "var(--fg-muted)", maxWidth: 320 }}>{text}</div>
      {cta && <Link href={cta.href} className="ds-btn ds-btn-sm ds-btn-primary">{cta.label}</Link>}
    </div>
  );
}
function fmtN(n: number) {
  return n.toLocaleString("it-IT");
}
function fmtRange(a: Date, b: Date) {
  const m = (d: Date) => d.toLocaleDateString("it-IT", { month: "short" }).replace(".", "");
  return a.getMonth() === b.getMonth() ? `${a.getDate()} – ${b.getDate()} ${m(b)}` : `${a.getDate()} ${m(a)} – ${b.getDate()} ${m(b)}`;
}
function fmtNext(d: Date) {
  const today = d.toDateString() === new Date().toDateString();
  const hh = `${d.getHours()}`.padStart(2, "0");
  const mm = `${d.getMinutes()}`.padStart(2, "0");
  return `${today ? "oggi" : "domani"} alle ${hh}:${mm}`;
}
function relTime(d: Date) {
  const min = Math.round((Date.now() - d.getTime()) / 60_000);
  if (min < 60) return `${Math.max(1, min)} min fa`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h}h fa`;
  const g = Math.round(h / 24);
  return g === 1 ? "ieri" : `${g}g fa`;
}
