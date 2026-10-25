import type { Metadata } from "next";
import Link from "next/link";
import { getPublicDeliveryProof } from "@/lib/public-delivery-proof";

export const metadata: Metadata = {
  title: "Prova di consegna: candidature confermate",
  description:
    "Ricevute ATS verificate, consegne email, accettazioni del provider e dati storici non verificati, separati.",
  openGraph: {
    title: "Prova — LavorAI",
    description: "Numeri reali di consegna candidature.",
  },
};

export const dynamic = "force-dynamic";
export const revalidate = 60;

/** Public, aggregate-only evidence. Generic HTTP markers are not receipts. */
export default async function ProofPage() {
  const now = new Date();
  const proof = await getPublicDeliveryProof(now);
  const detectedTotal = proof.confirmed;
  const detectedMonth = proof.confirmedMonth;
  const repliesTotal = proof.replies;
  const recentDetected = proof.recent;
  const portalCounts = proof.portals;
  const responseRate = detectedTotal > 0 ? Math.round(repliesTotal / detectedTotal * 100) : 0;

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
        Contiamo separatamente: accettazione ATS (ricevuta / id candidato /
        risposta di destinazione), accettazione Resend, evento delivered,
        invio senza rimbalzo e esito sconosciuto. Nessun rimbalzo non è una
        conferma. Lo storico senza ricevuta resta etichettato e non viene
        aggiornato.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14, marginTop: 28 }}>
        <Stat label="Accettate dal provider" value={proof.providerAccepted} sub="Resend accepted, con message id" />
        <Stat label="Email consegnate" value={proof.emailDelivered} sub="Evento delivered Resend, non una ricevuta" />
        <Stat label="Inviate, nessun rimbalzo" value={proof.sentNoBounce} sub="Casella inviata, nessun bounce. Non è accettazione" />
        <Stat label="Esito sconosciuto" value={proof.outcomeUnknown} sub="Invio tentato, nessuna prova memorizzata" />
        <Stat label="Storico non verificato" value={proof.legacyUnverified} sub="Conservato, escluso dai conteggi verificati" />
        <Stat label="Problemi di consegna" value={proof.deliveryProblems} sub="Invii falliti, bounce o reclami" />
        <Stat label="Esito da verificare" value={proof.pending} sub="Tentativi ancora in corso" />
      </div>
      {detectedTotal > 0 ? (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: 14,
              marginTop: 36,
            }}
          >
            <Stat label="Invii con prova verificata" value={detectedTotal} sub={`${proof.portalConfirmed} ricevute ATS · ${proof.emailDelivered} email consegnate`} />
            <Stat label="Questo mese" value={detectedMonth} sub={now.toLocaleDateString("it-IT", { month: "long" })} />
            {repliesTotal > 0 && (
              <Stat label="Possibili risposte recruiter" value={repliesTotal} sub="Classificazione automatica, una per candidatura verificata" />
            )}
            {responseRate > 0 && (
              <Stat label="Tasso risposta" value={`${responseRate}%`} sub="Stessa coorte: candidature con risposta / invii verificati" />
            )}
          </div>

          {portalCounts.length > 0 && (
            <div style={{ marginTop: 38, fontSize: 13, color: "var(--fg-muted)" }}>
              Per portale:{" "}
              {portalCounts
                .map((p) => `${p.source} ${p.count}`)
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
            Ultimi invii con prova verificata
          </h2>
          <p style={{ fontSize: 13.5, color: "var(--fg-muted)", marginBottom: 18 }}>
            Mostriamo solo canale, data e tipo di prova. Nessun dato del candidato o contenuto delle email.
          </p>

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
                    {a.source}
                  </div>
                  <div style={{ fontSize: 12.5, color: "var(--fg-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {a.label}
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
                  Verificata
                </span>
                <span style={{ fontSize: 11.5, color: "var(--fg-subtle)", whiteSpace: "nowrap", fontFeatureSettings: '"tnum"' }}>
                  {a.date.toLocaleDateString("it-IT", { day: "2-digit", month: "short", timeZone: "UTC" })}
                </span>
              </div>
            ))}
          </div>
        </>
      ) : (
        // Keep the evidence boundary explicit even before the first verified receipt.
        <MethodologyPanel />
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
          Vuoi seguire lo stato delle tue candidature?
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

/** Explain the evidence required before an application is counted. */
function MethodologyPanel() {
  const steps = [
    {
      n: "01",
      title: "Compiliamo il form vero",
      body:
        "Usiamo il form del portale supportato oppure un indirizzo recruiter verificato per l’invio email.",
    },
    {
      n: "02",
      title: "Clicchiamo Invia",
      body:
        "Registriamo il tentativo. Un click o una risposta HTTP generica non bastano per chiamarlo completato.",
    },
    {
      n: "03",
      title: "Catturiamo la risposta del server",
      body:
        "Per i portali richiediamo una ricevuta strutturata legata alla candidatura. Per le email distinguiamo accettazione del provider e consegna al server destinatario.",
    },
    {
      n: "04",
      title: "Tracciamo le risposte vere",
      body:
        "Riceviamo le risposte sull’indirizzo inbound e da Gmail, se collegato. Le classifichiamo automaticamente: possibili risposte, ricevute e bounce restano distinti. L’autore umano non è verificato.",
    },
  ];
  return (
    <div style={{ marginTop: 48 }}>
      <h2
        style={{
          fontSize: 22,
          fontWeight: 700,
          letterSpacing: "-0.015em",
          marginBottom: 8,
        }}
      >
        Come verifichiamo ogni invio
      </h2>
      <p
        style={{
          fontSize: 14,
          color: "var(--fg-muted)",
          maxWidth: 620,
          marginBottom: 24,
          lineHeight: 1.6,
        }}
      >
        Non ci sono ancora invii con prova verificata da mostrare.
        I tentativi storici restano conservati e separati dai conteggi confermati.
      </p>
      <div style={{ display: "grid", gap: 12 }}>
        {steps.map((s) => (
          <div
            key={s.n}
            style={{
              display: "grid",
              gridTemplateColumns: "60px 1fr",
              gap: 18,
              padding: "18px 20px",
              borderRadius: 12,
              background: "var(--bg-elev)",
              border: "1px solid var(--border-ds)",
            }}
          >
            <div
              className="mono"
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: "hsl(var(--primary))",
                letterSpacing: "0.04em",
              }}
            >
              {s.n}
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>
                {s.title}
              </div>
              <div style={{ fontSize: 13.5, color: "var(--fg-muted)", lineHeight: 1.6 }}>
                {s.body}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
