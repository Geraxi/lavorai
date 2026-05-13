import Link from "next/link";
import type { Metadata } from "next";
import { Icon } from "@/components/design/icon";
import { FOUNDER_VOCABULARY } from "@/lib/founder-coach/data/vocabulary";

export const metadata: Metadata = {
  title: "Equity & Compensation Coach · Founder Coach",
};

const EQUITY_CATEGORIES = new Set(["ownership", "compensation", "valuation", "exit"]);

const EQUITY_TYPES: Array<{ type: string; explain: string; redFlagIfVague: string; askPhrase: string }> = [
  {
    type: "Real shares (partecipazione societaria)",
    explain:
      "Possiedi azioni vere dell'azienda, con voting rights. Tipico in early-stage italiano/EU.",
    redFlagIfVague:
      "Se ti dicono 'equity' senza specificare cosa, è probabile siano stock options o phantom, NON shares.",
    askPhrase:
      "Quando parliamo di equity, si tratta di partecipazione societaria reale, stock options o phantom equity?",
  },
  {
    type: "Stock options (ESOP)",
    explain:
      "Diritto di comprare azioni a uno strike price fisso. Diventi proprietario solo quando exerciti. Standard US, comune in EU late-stage.",
    redFlagIfVague:
      "Strike price non chiarito o pool non dimensionato = warning sull'effettivo valore.",
    askPhrase:
      "Qual è lo strike price, il pool totale e le condizioni di exercise (cashless, early-exercise, post-termination window)?",
  },
  {
    type: "Phantom equity",
    explain:
      "Diritto contrattuale a ricevere il VALORE in cash di una percentuale di azioni in caso di exit. Non azioni vere — solo cash al cash-out event.",
    redFlagIfVague:
      "Se ti dicono 'come azioni ma più semplici', stai per accettare un IOU contrattuale, non equity.",
    askPhrase:
      "Le phantom equity sono pagate al cash-out o anche durante vita aziendale (dividendi virtuali)? Quali sono i trigger di payout?",
  },
  {
    type: "RSU (Restricted Stock Units)",
    explain:
      "Tipiche in growth/late-stage. Vesting time-based o performance-based. Tasse al vesting (income tax), non all'exercise.",
    redFlagIfVague:
      "Se il piano RSU non documenta blackout periods e tassazione al vesting, manca pezzo critico.",
    askPhrase: "Le RSU sono time-vested o performance-vested? Qual è la frequenza di vesting e i blackout periods?",
  },
  {
    type: "Sweat equity",
    explain:
      "Equity offerta in cambio di lavoro non pagato. Comune in idea/pre-seed. Va sempre formalizzata in vesting agreement scritto.",
    redFlagIfVague:
      "Promessa verbale di sweat equity senza contratto = ZERO equity legale.",
    askPhrase:
      "Per la sweat equity, abbiamo un vesting agreement scritto e una valuation di riferimento documentata?",
  },
];

export default function EquityCoachPage() {
  const equityTerms = FOUNDER_VOCABULARY.filter((t) =>
    EQUITY_CATEGORIES.has(t.category),
  );

  return (
    <div style={{ padding: "32px 24px", maxWidth: 1100, margin: "0 auto" }}>
      <Link
        href="/founder-coach"
        style={{
          fontSize: 13,
          color: "var(--fg-muted)",
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          marginBottom: 20,
        }}
      >
        <Icon name="chevron-right" size={11} style={{ transform: "rotate(180deg)" }} />
        Torna al modulo
      </Link>

      <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: "-0.022em", margin: 0 }}>
        C · Equity & Compensation Coach
      </h1>
      <p style={{ fontSize: 14.5, color: "var(--fg-muted)", marginTop: 8, lineHeight: 1.55, maxWidth: 720 }}>
        Cosa significa davvero ogni voce di compensation founder-level, quando
        chiedere cosa, e le frasi pronte da pronunciare in call.
      </p>

      <h2 style={{ fontSize: 20, fontWeight: 700, marginTop: 36, letterSpacing: "-0.015em" }}>
        Cinque tipi di equity (sapere la differenza è il 60% della partita)
      </h2>
      <div
        style={{
          marginTop: 14,
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(310px, 1fr))",
          gap: 14,
        }}
      >
        {EQUITY_TYPES.map((t) => (
          <div
            key={t.type}
            style={{
              padding: 18,
              borderRadius: 14,
              background: "var(--bg-elev)",
              border: "1px solid var(--border-ds)",
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            <div style={{ fontSize: 14.5, fontWeight: 700, letterSpacing: "-0.01em" }}>
              {t.type}
            </div>
            <div style={{ fontSize: 12.5, color: "var(--fg-muted)", lineHeight: 1.55 }}>
              {t.explain}
            </div>
            <div
              style={{
                padding: "10px 12px",
                borderRadius: 8,
                background: "rgba(220,38,38,0.06)",
                border: "1px solid rgba(220,38,38,0.20)",
                fontSize: 11.5,
                color: "#fca5a5",
                lineHeight: 1.5,
              }}
            >
              <strong style={{ color: "#fca5a5" }}>🚩 Warning:</strong> {t.redFlagIfVague}
            </div>
            <div
              style={{
                padding: "10px 12px",
                borderRadius: 8,
                background: "hsl(var(--primary) / 0.10)",
                border: "1px solid hsl(var(--primary) / 0.25)",
                fontSize: 12.5,
                fontStyle: "italic",
                lineHeight: 1.55,
              }}
            >
              "{t.askPhrase}"
            </div>
          </div>
        ))}
      </div>

      <h2 style={{ fontSize: 20, fontWeight: 700, marginTop: 44, letterSpacing: "-0.015em" }}>
        Vocabolario equity essenziale ({equityTerms.length} termini)
      </h2>
      <p style={{ fontSize: 13.5, color: "var(--fg-muted)", marginTop: 6 }}>
        Per il set completo di {FOUNDER_VOCABULARY.length} termini founder vai a{" "}
        <Link href="/founder-coach/vocabulary" style={{ color: "hsl(var(--primary))", textDecoration: "underline" }}>
          F · Vocabulary Trainer
        </Link>
        .
      </p>
      <div
        style={{
          marginTop: 14,
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: 12,
        }}
      >
        {equityTerms.map((t) => (
          <div
            key={t.id}
            style={{
              padding: 16,
              borderRadius: 12,
              background: "var(--bg-elev)",
              border: "1px solid var(--border-ds)",
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>{t.term}</div>
            <div style={{ fontSize: 12, color: "var(--fg-muted)", lineHeight: 1.5, marginBottom: 8 }}>
              {t.definitionSimple}
            </div>
            <div
              style={{
                padding: "8px 10px",
                borderRadius: 6,
                background: "var(--bg-sunken)",
                fontSize: 11.5,
                fontStyle: "italic",
                lineHeight: 1.5,
                color: "var(--fg)",
              }}
            >
              "{t.readyPhrase}"
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
