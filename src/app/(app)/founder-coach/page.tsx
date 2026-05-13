import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Founder Interview Coach",
  description:
    "Modulo dedicato a colloqui founder-level: CTO, Tech Co-Founder, Venture Studio. Analizza opportunità, prepara risposte, negozia equity.",
};

const MODULES: Array<{
  href: string;
  letter: string;
  title: string;
  blurb: string;
  cta: string;
  highlight?: boolean;
}> = [
  {
    href: "/founder-coach/opportunity",
    letter: "A",
    title: "Opportunity Analyzer",
    blurb:
      "Incolla job post, email, link o pitch. Ricevi: stage stimato, red/green flags, domande da fare, cosa negoziare, score 1-10.",
    cta: "Analizza opportunità",
    highlight: true,
  },
  {
    href: "/founder-coach/stages",
    letter: "B",
    title: "Startup Stage Explainer",
    blurb:
      "Guida live: Idea → Pre-seed → Seed → Series A → B/C → Pre-IPO → IPO. Per ogni stage: equity realistico, rischio, domande critiche.",
    cta: "Studia gli stage",
  },
  {
    href: "/founder-coach/equity",
    letter: "C",
    title: "Equity & Compensation Coach",
    blurb:
      "Vesting, cliff, dilution, liquidation preference, acceleration. 30+ termini con frasi pronte e warning quando la proposta è vaga.",
    cta: "Esplora equity",
  },
  {
    href: "/founder-coach/interview",
    letter: "D",
    title: "Interview Domination Mode",
    blurb:
      "Risposte founder-level a 12 domande critiche: ownership, vision, conflitti, primi 90 giorni. Tutte in italiano professionale.",
    cta: "Vedi risposte modello",
  },
  {
    href: "/founder-coach/negotiate",
    letter: "E",
    title: "Negotiation Script Generator",
    blurb:
      "8 scenari pronti: 4k+5%, 5k+2-3%, stipendio basso/equity alta, AI subs, commitment, progetti personali, investimento sui tuoi progetti.",
    cta: "Apri script",
  },
  {
    href: "/founder-coach/vocabulary",
    letter: "F",
    title: "Founder Vocabulary Trainer",
    blurb:
      "Flashcard di 30+ termini: ownership, vesting, dilution, leverage, PMF, runway, exit. Frase pronta e errore da evitare.",
    cta: "Studia vocabolario",
  },
  {
    href: "/founder-coach/venture",
    letter: "G",
    title: "Strategic Venture Mode",
    blurb:
      "Per chi ha già progetti propri: trasforma il colloquio in venture conversation. Posizionamento, frasi chiave, protezione idee.",
    cta: "Modalità venture",
  },
];

export default function FounderCoachHomePage() {
  return (
    <div style={{ padding: "32px 24px", maxWidth: 1280, margin: "0 auto" }}>
      <div style={{ marginBottom: 28 }}>
        <div
          style={{
            fontSize: 11,
            color: "var(--fg-subtle)",
            textTransform: "uppercase",
            letterSpacing: "0.14em",
            marginBottom: 8,
          }}
        >
          Modulo · Founder Coach
        </div>
        <h1
          style={{
            fontSize: 36,
            fontWeight: 700,
            letterSpacing: "-0.025em",
            margin: 0,
            lineHeight: 1.1,
          }}
        >
          Quando il colloquio è founder-level,
          <br />
          <span style={{ color: "hsl(var(--primary))" }}>
            ti serve un advisor, non un coach generico.
          </span>
        </h1>
        <p
          style={{
            fontSize: 16,
            color: "var(--fg-muted)",
            lineHeight: 1.6,
            marginTop: 16,
            maxWidth: 720,
          }}
        >
          7 strumenti per opportunità CTO, Tech Co-Founder, AI Builder e
          Venture Studio. Analisi opportunità, equity coaching, script
          negoziali e domande di interview con risposte modello —
          tutto in italiano professionale, founder-tone.
        </p>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(310px, 1fr))",
          gap: 16,
        }}
      >
        {MODULES.map((m) => (
          <Link
            key={m.href}
            href={m.href}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 14,
              padding: 22,
              borderRadius: 16,
              background: m.highlight
                ? "linear-gradient(180deg, hsl(var(--primary) / 0.08), transparent 60%)"
                : "var(--bg-elev)",
              border: m.highlight
                ? "1px solid hsl(var(--primary) / 0.35)"
                : "1px solid var(--border-ds)",
              textDecoration: "none",
              color: "inherit",
              transition: "transform 0.15s, border-color 0.15s",
              cursor: "pointer",
            }}
            className="founder-card"
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
              }}
            >
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  background: m.highlight
                    ? "hsl(var(--primary))"
                    : "var(--bg-sunken)",
                  color: m.highlight ? "#001a0d" : "var(--fg)",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 700,
                  fontSize: 16,
                  letterSpacing: "-0.01em",
                }}
              >
                {m.letter}
              </div>
              <div
                style={{
                  fontSize: 17,
                  fontWeight: 700,
                  letterSpacing: "-0.015em",
                  lineHeight: 1.2,
                }}
              >
                {m.title}
              </div>
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
              {m.blurb}
            </p>
            <div
              style={{
                fontSize: 12.5,
                fontWeight: 600,
                color: m.highlight
                  ? "hsl(var(--primary))"
                  : "var(--fg-muted)",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                marginTop: 4,
              }}
            >
              {m.cta} →
            </div>
          </Link>
        ))}
      </div>

      <div
        style={{
          marginTop: 28,
          padding: "16px 18px",
          background: "var(--bg-elev)",
          border: "1px solid var(--border-ds)",
          borderRadius: 12,
          fontSize: 12.5,
          color: "var(--fg-muted)",
          lineHeight: 1.55,
        }}
      >
        <strong style={{ color: "var(--fg)" }}>Quando usare cosa.</strong>
        &nbsp;Ricevuto un'email da un founder o un VC studio? Inizia da{" "}
        <strong>A · Opportunity Analyzer</strong>. Devi capire se la proposta
        è seria? <strong>C · Equity Coach</strong> + <strong>B · Stage</strong>.
        Hai un colloquio prenotato? <strong>D · Interview Domination</strong>
        + <strong>F · Vocabulary</strong> il giorno prima.
        Stai entrando in negotiation? <strong>E · Negotiation Scripts</strong>.
      </div>
    </div>
  );
}
