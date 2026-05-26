import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";

export const metadata: Metadata = {
  title: "Prova — LavorAI",
  description:
    "Numeri reali, non promesse. Ogni candidatura confermata via HTTP è una prova oggettiva di consegna.",
  openGraph: {
    title: "Prova — LavorAI",
    description: "Numeri reali di consegna candidature.",
  },
};

export const dynamic = "force-dynamic";
export const revalidate = 60;

/**
 * Pagina pubblica /proof: i numeri VERI del prodotto.
 * Filosofia: meglio mostrare 3 consegne confermate che fingere 3000. La
 * trasparenza è il marketing — chi vede onestà sceglie LavorAI proprio
 * perché altri tool dichiarano numeri che non possono provare.
 *
 * Conta SOLO submitConfirmation che inizia con "DETECTED" (prova HTTP/DOM
 * hard di consegna). Mai gonfiato.
 */
export default async function ProofPage() {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [
    detectedTotal,
    detectedMonth,
    repliesTotal,
    repliesMonth,
    recentDetected,
    portalCounts,
  ] = await Promise.all([
    prisma.application.count({
      where: { submitConfirmation: { startsWith: "DETECTED" } },
    }),
    prisma.application.count({
      where: {
        submitConfirmation: { startsWith: "DETECTED" },
        completedAt: { gte: monthStart },
      },
    }),
    prisma.application.count({ where: { lastReplyAt: { not: null } } }),
    prisma.application.count({
      where: { lastReplyAt: { gte: monthStart } },
    }),
    prisma.application.findMany({
      where: { submitConfirmation: { startsWith: "DETECTED" } },
      orderBy: { completedAt: "desc" },
      take: 20,
      select: {
        completedAt: true,
        submitConfirmation: true,
        submittedVia: true,
        job: { select: { company: true, title: true, location: true } },
      },
    }),
    prisma.application.groupBy({
      by: ["submittedVia"],
      where: { submitConfirmation: { startsWith: "DETECTED" } },
      _count: { _all: true },
    }),
  ]);

  const responseRate =
    detectedTotal > 0 ? Math.round((repliesTotal / detectedTotal) * 100) : 0;

  return (
    <div
      style={{
        maxWidth: 920,
        margin: "0 auto",
        padding: "80px 24px 120px",
      }}
    >
      <div style={{ marginBottom: 14, fontSize: 12, color: "var(--fg-subtle)", textTransform: "uppercase", letterSpacing: "0.14em" }}>
        Trasparenza · aggiornato in tempo reale
      </div>
      <h1
        style={{
          fontSize: 48,
          fontWeight: 700,
          letterSpacing: "-0.025em",
          lineHeight: 1.05,
          margin: 0,
        }}
      >
        I numeri veri di LavorAI.
      </h1>
      <p
        style={{
          fontSize: 18,
          color: "var(--fg-muted)",
          marginTop: 12,
          maxWidth: 640,
          lineHeight: 1.55,
        }}
      >
        Ogni candidatura qui sotto è <strong style={{ color: "var(--fg)" }}>
        confermata via HTTP</strong> dal server del portale ATS — non un &ldquo;sent&rdquo;
        finto. Altri tool dichiarano numeri che non possono provare. Noi
        contiamo solo quello che si misura.
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 14,
          marginTop: 36,
        }}
      >
        <Stat label="Consegne confermate" value={detectedTotal} sub="HTTP 2xx/3xx dal portale" />
        <Stat label="Questo mese" value={detectedMonth} sub={now.toLocaleDateString("it-IT", { month: "long" })} />
        <Stat label="Risposte recruiter" value={repliesTotal} sub="parsate da email inbound" />
        <Stat label="Tasso risposta" value={`${responseRate}%`} sub="risposte / consegne" />
      </div>

      {portalCounts.length > 0 && (
        <div style={{ marginTop: 38, fontSize: 13, color: "var(--fg-muted)" }}>
          Per portale:{" "}
          {portalCounts
            .filter((p) => p.submittedVia)
            .map((p) => `${p.submittedVia?.replace("portal_", "")} ${p._count._all}`)
            .join(" · ")}
        </div>
      )}

      <h2
        style={{
          fontSize: 22,
          fontWeight: 700,
          letterSpacing: "-0.015em",
          marginTop: 56,
          marginBottom: 10,
        }}
      >
        Ultime consegne confermate
      </h2>
      <p style={{ fontSize: 13.5, color: "var(--fg-muted)", marginBottom: 18 }}>
        Anonimizzate per il candidato. Azienda, ruolo, data e prova HTTP sono pubblici.
      </p>

      {recentDetected.length === 0 ? (
        <EmptyState />
      ) : (
        <div
          style={{
            border: "1px solid var(--border-ds)",
            borderRadius: 14,
            overflow: "hidden",
          }}
        >
          {recentDetected.map((a, i) => (
            <div
              key={i}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr auto auto",
                alignItems: "center",
                gap: 14,
                padding: "14px 18px",
                borderBottom: i < recentDetected.length - 1 ? "1px solid var(--border-ds)" : "none",
                fontSize: 13.5,
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {a.job.company ?? "—"}
                </div>
                <div style={{ fontSize: 12.5, color: "var(--fg-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {a.job.title}
                  {a.job.location ? ` · ${a.job.location}` : ""}
                </div>
              </div>
              <span
                className="mono"
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  padding: "3px 8px",
                  borderRadius: 999,
                  background: "hsl(var(--primary)/0.14)",
                  color: "hsl(var(--primary))",
                  whiteSpace: "nowrap",
                }}
              >
                {a.submitConfirmation}
              </span>
              <span style={{ fontSize: 11.5, color: "var(--fg-subtle)", whiteSpace: "nowrap", fontFeatureSettings: '"tnum"' }}>
                {a.completedAt
                  ? a.completedAt.toLocaleDateString("it-IT", { day: "2-digit", month: "short" })
                  : "—"}
              </span>
            </div>
          ))}
        </div>
      )}

      <div
        style={{
          marginTop: 60,
          padding: 28,
          borderRadius: 16,
          background: "var(--bg-elev)",
          border: "1px solid var(--border-ds)",
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: 13, color: "var(--fg-muted)", marginBottom: 8 }}>
          Vuoi che il tuo nome compaia qui?
        </div>
        <div
          style={{
            fontSize: 20,
            fontWeight: 600,
            letterSpacing: "-0.015em",
            marginBottom: 18,
          }}
        >
          Prima candidatura confermata entro 24h, o rimborso.
        </div>
        <Link
          href="/signup"
          style={{
            display: "inline-block",
            background: "hsl(var(--primary))",
            color: "#001a0d",
            textDecoration: "none",
            padding: "14px 28px",
            borderRadius: 10,
            fontWeight: 700,
            fontSize: 15,
          }}
        >
          Inizia ora →
        </Link>
      </div>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: number | string; sub?: string }) {
  return (
    <div
      style={{
        padding: 18,
        borderRadius: 14,
        background: "var(--bg-elev)",
        border: "1px solid var(--border-ds)",
      }}
    >
      <div
        style={{
          fontSize: 11,
          color: "var(--fg-subtle)",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 30,
          fontWeight: 700,
          letterSpacing: "-0.02em",
          fontFeatureSettings: '"tnum"',
          marginTop: 4,
        }}
      >
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 11.5, color: "var(--fg-muted)", marginTop: 2 }}>
          {sub}
        </div>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div
      style={{
        padding: 36,
        borderRadius: 14,
        background: "var(--bg-elev)",
        border: "1px dashed var(--border-ds)",
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>
        Ancora 0 consegne confermate
      </div>
      <div
        style={{
          fontSize: 13,
          color: "var(--fg-muted)",
          maxWidth: 420,
          margin: "0 auto",
          lineHeight: 1.55,
        }}
      >
        Stiamo verificando ogni invio col server del portale (HTTP 2xx). Niente
        falsi &ldquo;inviata&rdquo;: il primo numero che vedrai qui sarà reale.
      </div>
    </div>
  );
}
