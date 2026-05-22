import Link from "next/link";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { Icon } from "@/components/design/icon";
import { CompanyLogo, companyColor } from "@/components/design/company-logo";

/**
 * Hub Colloqui — punto di accesso a tutti gli strumenti di interview.
 *
 * Visibile a TUTTI (anche free) ma il Copilot vero è gated dal layout
 * del modulo /interview/. Mostriamo le applicazioni recenti come
 * entry-point: ogni candidatura ha un bottone "Apri Copilot live".
 *
 * NB: questo file vive dentro /interview/ ma è la pagina root del modulo.
 * Il layout.tsx del modulo applica il PremiumGate solo se l'utente non
 * è Pro+ — gli utenti loggati Pro+ vedono questa pagina, i free vedono
 * il paywall.
 */
export default async function InterviewHubPage() {
  const user = await getCurrentUser();
  if (!user) return null; // il layout dell'app gestisce auth

  const applications = await prisma.application.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 30,
    select: {
      id: true,
      status: true,
      userStatus: true,
      submittedVia: true,
      createdAt: true,
      job: {
        select: {
          title: true,
          company: true,
          location: true,
        },
      },
      interviewSessions: {
        select: { id: true, startedAt: true },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });

  const interviewing = applications.filter(
    (a) => a.userStatus === "colloquio" || a.interviewSessions.length > 0,
  );
  const others = applications.filter(
    (a) => a.userStatus !== "colloquio" && a.interviewSessions.length === 0,
  );

  return (
    <div style={{ padding: "32px 24px", maxWidth: 1200, margin: "0 auto" }}>
      {/* HERO */}
      <div style={{ marginBottom: 32 }}>
        <div
          style={{
            fontSize: 11,
            color: "var(--fg-subtle)",
            textTransform: "uppercase",
            letterSpacing: "0.14em",
            marginBottom: 8,
          }}
        >
          Modulo · Colloqui
        </div>
        <h1
          style={{
            fontSize: 32,
            fontWeight: 700,
            letterSpacing: "-0.025em",
            lineHeight: 1.15,
            margin: 0,
          }}
        >
          Preparati al{" "}
          <span style={{ color: "hsl(var(--primary))" }}>colloquio</span>
        </h1>
        <p
          style={{
            fontSize: 15.5,
            color: "var(--fg-muted)",
            lineHeight: 1.6,
            marginTop: 14,
            maxWidth: 720,
          }}
        >
          Allenati con il Mock Interview: domande simulate dall&apos;AI sul tuo
          CV e sul ruolo, con feedback turn-by-turn. Il Copilot live durante la
          call (teleprompter + audio capture) è in arrivo.
        </p>
      </div>

      {/* TWO MODE CARDS */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 14,
          marginBottom: 36,
        }}
        className="mode-cards"
      >
        <ModeCard
          highlight
          letter="MOCK"
          title="Pratica con domande simulate"
          blurb="5 domande generate dall'AI in base al tuo CV e al ruolo: behavioral STAR + 1 deep technical. Risposta libera, feedback su sostanza, struttura, chiarezza."
          ctaLabel="Inizia un mock"
          ctaHref="/interview-buddy"
        />
        <ModeCard
          letter="LIVE"
          comingSoon
          title="Copilot durante la call"
          blurb="Teleprompter affianco a Google Meet: audio capture + trascrizione automatica + risposte AI in tempo reale mentre guardi la camera. In arrivo — ti avvisiamo appena è pronto."
          ctaLabel="Presto disponibile"
          ctaHref="#"
        />
      </div>

      {/* ACTIVE INTERVIEWS */}
      {interviewing.length > 0 && (
        <section style={{ marginBottom: 28 }}>
          <h2
            style={{
              fontSize: 18,
              fontWeight: 700,
              letterSpacing: "-0.015em",
              marginBottom: 12,
            }}
          >
            Colloqui in corso ({interviewing.length})
          </h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
              gap: 12,
            }}
          >
            {interviewing.map((a) => (
              <ApplicationCard key={a.id} app={a} mode="active" />
            ))}
          </div>
        </section>
      )}

      {/* OTHER APPS — can be used as entry to Copilot too */}
      <section>
        <h2
          style={{
            fontSize: 18,
            fontWeight: 700,
            letterSpacing: "-0.015em",
            marginBottom: 12,
          }}
        >
          {interviewing.length > 0
            ? "Altre candidature"
            : "Le tue candidature"}{" "}
          ({others.length})
        </h2>
        {others.length === 0 ? (
          <div
            style={{
              padding: "32px 24px",
              borderRadius: 14,
              border: "1px dashed var(--border-ds)",
              background: "var(--bg-elev)",
              textAlign: "center",
              color: "var(--fg-muted)",
              fontSize: 14,
            }}
          >
            <p style={{ margin: "0 0 14px" }}>
              Nessuna candidatura ancora. Importa quella per cui hai un
              colloquio in arrivo per attivare il Copilot.
            </p>
            <Link
              href="/applications/new"
              className="ds-btn ds-btn-primary"
              style={{ padding: "10px 18px", fontSize: 13.5 }}
            >
              <Icon name="plus" size={12} /> Importa candidatura
            </Link>
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
              gap: 12,
            }}
          >
            {others.slice(0, 12).map((a) => (
              <ApplicationCard key={a.id} app={a} mode="other" />
            ))}
          </div>
        )}
      </section>

      <style>{`
        @media (max-width: 800px) {
          .mode-cards { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}

function ModeCard({
  highlight,
  comingSoon,
  letter,
  title,
  blurb,
  ctaLabel,
  ctaHref,
}: {
  highlight?: boolean;
  comingSoon?: boolean;
  letter: string;
  title: string;
  blurb: string;
  ctaLabel: string;
  ctaHref: string;
}) {
  const inner = (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            padding: "3px 8px",
            borderRadius: 5,
            background: highlight ? "hsl(var(--primary))" : "var(--bg-sunken)",
            color: highlight ? "#001a0d" : "var(--fg-muted)",
            letterSpacing: "0.12em",
          }}
        >
          {letter}
        </span>
        <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-0.015em" }}>
          {title}
        </span>
        {comingSoon && (
          <span
            style={{
              marginLeft: "auto",
              fontSize: 10,
              fontWeight: 700,
              padding: "3px 8px",
              borderRadius: 999,
              background: "var(--bg-sunken)",
              color: "var(--fg-subtle)",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            Presto
          </span>
        )}
      </div>
      <p
        style={{
          fontSize: 13.5,
          color: "var(--fg-muted)",
          lineHeight: 1.55,
          margin: 0,
          flex: 1,
        }}
      >
        {blurb}
      </p>
      <div
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: comingSoon
            ? "var(--fg-subtle)"
            : highlight
              ? "hsl(var(--primary))"
              : "var(--fg)",
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        {ctaLabel} {comingSoon ? "" : "→"}
      </div>
    </>
  );

  const cardStyle: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: 14,
    padding: 22,
    borderRadius: 18,
    background: highlight
      ? "linear-gradient(180deg, hsl(var(--primary) / 0.10), transparent 60%)"
      : "var(--bg-elev)",
    border: highlight
      ? "1px solid hsl(var(--primary) / 0.35)"
      : "1px solid var(--border-ds)",
    textDecoration: "none",
    color: "inherit",
    minHeight: 200,
    opacity: comingSoon ? 0.65 : 1,
  };

  // Coming-soon: niente link, card statica (non cliccabile).
  if (comingSoon) {
    return <div style={{ ...cardStyle, cursor: "default" }}>{inner}</div>;
  }
  return (
    <Link href={ctaHref} style={cardStyle}>
      {inner}
    </Link>
  );
}

function ApplicationCard({
  app,
  mode,
}: {
  app: {
    id: string;
    userStatus: string | null;
    job: { title: string; company: string | null; location: string | null };
    interviewSessions: Array<{ id: string }>;
  };
  mode: "active" | "other";
}) {
  const color = companyColor(app.job.company ?? app.job.title);

  return (
    <div
      style={{
        padding: 16,
        borderRadius: 14,
        background: "var(--bg-elev)",
        border:
          mode === "active"
            ? "1px solid hsl(var(--primary) / 0.30)"
            : "1px solid var(--border-ds)",
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
        <CompanyLogo
          company={app.job.company ?? app.job.title}
          color={color}
          size={44}
          rounded={10}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 14.5,
              fontWeight: 700,
              letterSpacing: "-0.01em",
              lineHeight: 1.3,
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {app.job.title}
          </div>
          <div
            style={{
              fontSize: 12,
              color: "var(--fg-muted)",
              marginTop: 3,
            }}
          >
            {app.job.company ?? "—"}
            {app.job.location ? ` · ${app.job.location}` : ""}
          </div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        {/* Il Copilot live per-candidatura è in arrivo. Per ora la card
            porta al Mock Interview generico (funzionante). */}
        <Link
          href="/interview-buddy"
          className="ds-btn ds-btn-primary"
          style={{
            flex: 1,
            padding: "8px 12px",
            fontSize: 12.5,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
          }}
        >
          <Icon name="zap" size={11} /> Allenati con il Mock
        </Link>
      </div>
    </div>
  );
}
