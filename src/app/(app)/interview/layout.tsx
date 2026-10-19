import Link from "next/link";
import { CalendarCheck, ChevronRight } from "lucide-react";
import { checkPremiumPage } from "@/lib/premium-gate";
import { PremiumGate } from "@/components/premium-gate";
import { AppTopbar } from "@/components/design/topbar";
import { Avatar } from "@/components/ui-premium/avatar";
import { EmptyState } from "@/components/ui-premium/empty-state";
import { getInterviewApplications, getInterviewInvites } from "@/lib/dashboard-metrics-shared";

/**
 * Colloqui. Everyone sees their interview invites (same count as the
 * Dashboard KPI); the Interview Copilot tools under /interview/* stay Pro+.
 */
export default async function InterviewLayout({ children }: { children: React.ReactNode }) {
  const gate = await checkPremiumPage("interview_copilot");
  if (gate.allowed) return <>{children}</>;
  if (!gate.user) return <PremiumGate feature="interview_copilot" isLoggedIn={false} />;
  const [count, items] = await Promise.all([getInterviewInvites(gate.user.id), getInterviewApplications(gate.user.id)]);
  const fmt = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "short", timeZone: "Europe/Rome" });
  return (
    <>
      <AppTopbar title="Colloqui" breadcrumb="Lavoro" />
      <div className="pm-page">
        <header className="pm-page-head">
          <div>
            <h1>Colloqui</h1>
            <p className="pm-muted">Inviti a colloquio ricevuti o segnati da te nelle candidature.</p>
          </div>
        </header>
        <section className="pm-card" aria-labelledby="iv-list-title">
          <header className="pm-card-head">
            <h2 id="iv-list-title"><CalendarCheck size={15} strokeWidth={1.75} aria-hidden /> I tuoi colloqui <span className="pm-count" data-metric="interviews">{count}</span></h2>
            <Link href="/applications" className="pm-link">Candidature <ChevronRight size={14} aria-hidden /></Link>
          </header>
          {items.length === 0 ? (
            <EmptyState icon={CalendarCheck} title="Nessun invito a colloquio per ora" text="Quando un recruiter ti invita, o segni una candidatura come colloquio, la trovi qui." cta={{ href: "/applications", label: "Vai alle candidature" }} />
          ) : (
            <ul className="pm-list">
              {items.map((iv) => (
                <li key={iv.id}>
                  <Link href={`/applications/${iv.id}`} className="pm-row">
                    <Avatar name={iv.job.company ?? iv.job.title} />
                    <span className="pm-row-text">
                      <strong>{iv.job.company ?? "Azienda"}</strong>
                      <small>{[iv.job.title, iv.job.location].filter(Boolean).join(" · ")}</small>
                    </span>
                    <span className="pm-pill tone-neutral iv-source">{iv.userStatus === "colloquio" ? "Segnato da te" : "Invito del recruiter"}</span>
                    {iv.lastReplyAt && <time className="pm-time" dateTime={iv.lastReplyAt.toISOString()}>{fmt.format(iv.lastReplyAt)}</time>}
                    <ChevronRight size={16} className="pm-row-go" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
        <PremiumGate feature="interview_copilot" isLoggedIn />
      </div>
    </>
  );
}
