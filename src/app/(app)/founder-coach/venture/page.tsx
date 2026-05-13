import Link from "next/link";
import type { Metadata } from "next";
import { Icon } from "@/components/design/icon";

export const metadata: Metadata = {
  title: "Strategic Venture Mode · Founder Coach",
};

const PLAYBOOK: Array<{
  title: string;
  blurb: string;
  doSection: string[];
  dontSection: string[];
  phrase?: string;
}> = [
  {
    title: "Parlare dei tuoi progetti senza sembrare disperato",
    blurb:
      "Posizionarti come builder che VALUTA, non candidato che CERCA. Il framing cambia la dinamica.",
    doSection: [
      "Apri con il contesto del mercato, non con il tuo progetto",
      "Quantifica: revenue, utenti, growth, anche se piccoli",
      "Mostra ownership, non insicurezza: 'sto già costruendo X', non 'spero che funzioni'",
    ],
    dontSection: [
      "Aprire con 'sto cercando finanziamenti per il mio progetto'",
      "Dire 'sono pronto a pivotare se serve' (suona disperato)",
      "Mostrare desperate energy via tono o linguaggio passivo",
    ],
    phrase:
      "Parallelamente alla mia attività operativa, sto già costruendo e validando alcuni progetti verticali. Per me è interessante confrontarmi con realtà che ragionano anche in ottica di venture building, non solo di hiring.",
  },
  {
    title: "Proporre collaborazione invece di hire",
    blurb:
      "Se l'azienda è un venture studio o ha holding strategy, l'opzione collaboration può essere più allineata di un employee contract.",
    doSection: [
      "Chiedi esplicitamente se valutano founder esterni",
      "Proponi un trial paid consulting → eventuale joint-venture",
      "Riconosci che è un percorso più lungo ma con upside diverso",
    ],
    dontSection: [
      "Forzare la conversation verso collaboration se loro vogliono solo un dipendente",
      "Saltare il discorso comp pensando 'lo decidiamo dopo'",
    ],
    phrase:
      "Mi è utile capire se la vostra struttura valuta solo employee o anche modelli di collaboration / joint-venture per founder esterni con prodotti già validati.",
  },
  {
    title: "Chiedere se valutano founder esterni (no euphemism)",
    blurb:
      "La domanda chiave per venture studi e holding di startup. Se non te lo dicono al primo turn, non lo fanno.",
    doSection: [
      "Chiedere chiaro, non in modo evasivo",
      "Sapere il nome dei loro venture portfolio per dimostrare research",
      "Proporre un esempio concreto: 'come è andata con [founder X] del vostro portfolio?'",
    ],
    dontSection: [
      "Chiedere in modo apologetico: 'mi chiedevo, scusate, se per caso...'",
      "Lasciare che siano loro a tirare fuori il tema dell'investment",
    ],
    phrase:
      "FoolFarm (o equivalente venture studio) lavora esclusivamente su venture costruite internamente oppure valutate anche founder esterni con prodotti già validati e pronti per scale-up?",
  },
  {
    title: "Trasformare colloquio in opportunità di venture building",
    blurb:
      "Pivot esplicito: 'iniziamo con un hire ruolo, ma valutiamo congiuntamente se uno dei miei progetti può essere venture'.",
    doSection: [
      "Separare conversazioni: hire prima, venture dopo se interesse mutuo",
      "Proporre due track esplicite con timeline chiare",
      "Lasciare aperta l'opzione di restare consultant se nessuno dei due track funziona",
    ],
    dontSection: [
      "Mixare i due discorsi in unica conversation (confonde tutti)",
      "Mostrare ai loro IP dei tuoi progetti prima di NDA",
    ],
    phrase:
      "Sono aperto a iniziare come operator/CTO del vostro venture X. Parallelamente vorrei capire se i miei progetti vertical, una volta scalati, potrebbero essere candidati a entrare nel vostro portfolio in modo strutturato.",
  },
  {
    title: "Proteggere le tue idee in conversation con investitori",
    blurb:
      "Founder paranoia è cliché ma la protezione strutturale serve. Non NDAs ostili, ma sequencing intelligente.",
    doSection: [
      "Condividi il PROBLEMA che risolvi, non l'implementation tecnica unica",
      "Mostra traction (utenti, revenue) prima di spiegare l'architettura",
      "Tieni il know-how concorrenziale OUT della prima conversation",
    ],
    dontSection: [
      "Esigere NDA al primo meeting (red flag dal loro punto di vista)",
      "Mostrare codice / architecture diagram a freddo",
      "Sottovalutare quanto velocemente possono copiare un'idea con team interno",
    ],
  },
  {
    title: "Capire se conviene accettare il ruolo o cercare investment",
    blurb:
      "Decisione discriminante. Diversa logica, diverso upside, diverso rischio.",
    doSection: [
      "Calcola net upside in 5 anni nei due scenari (con stime conservative)",
      "Valuta la velocity di execution che ottieni dentro vs fuori",
      "Considera il valore non-monetario: learning, network, signaling",
    ],
    dontSection: [
      "Decidere d'istinto senza fare il numero",
      "Pensare in binario 'accept o fundraise' — esistono ibridi",
      "Sottovalutare il costo opportunity di un ruolo full-time se sei già in profitto",
    ],
  },
];

export default function StrategicVenturePage() {
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
        G · Strategic Venture Mode
      </h1>
      <p style={{ fontSize: 14.5, color: "var(--fg-muted)", marginTop: 8, lineHeight: 1.55, maxWidth: 740 }}>
        Quando hai già progetti propri e il colloquio è un&apos;opportunità per
        aprire venture building, non solo per essere assunto. Posizionamento,
        frasi chiave, protezione, decision framework.
      </p>

      <div style={{ marginTop: 30, display: "flex", flexDirection: "column", gap: 14 }}>
        {PLAYBOOK.map((p, i) => (
          <article
            key={i}
            style={{
              padding: 20,
              borderRadius: 14,
              background: "var(--bg-elev)",
              border: "1px solid var(--border-ds)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 8,
                  background: "hsl(var(--primary) / 0.18)",
                  color: "hsl(var(--primary))",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 700,
                  fontSize: 13,
                  flexShrink: 0,
                }}
              >
                {i + 1}
              </div>
              <h3
                style={{
                  fontSize: 17,
                  fontWeight: 700,
                  letterSpacing: "-0.012em",
                  margin: 0,
                  lineHeight: 1.3,
                }}
              >
                {p.title}
              </h3>
            </div>
            <p style={{ fontSize: 13.5, color: "var(--fg-muted)", lineHeight: 1.55, margin: "0 0 14px" }}>
              {p.blurb}
            </p>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }} className="play-grid">
              <DoBlock items={p.doSection} positive />
              <DoBlock items={p.dontSection} positive={false} />
            </div>

            {p.phrase && (
              <div
                style={{
                  marginTop: 12,
                  padding: "12px 14px",
                  borderRadius: 10,
                  background: "hsl(var(--primary) / 0.10)",
                  border: "1px solid hsl(var(--primary) / 0.25)",
                }}
              >
                <div
                  style={{
                    fontSize: 10.5,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.12em",
                    color: "hsl(var(--primary))",
                    marginBottom: 6,
                  }}
                >
                  Frase chiave
                </div>
                <p style={{ fontSize: 13, lineHeight: 1.6, margin: 0, fontStyle: "italic" }}>
                  "{p.phrase}"
                </p>
              </div>
            )}
          </article>
        ))}
      </div>

      <style>{`
        @media (max-width: 800px) {
          .play-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}

function DoBlock({ items, positive }: { items: string[]; positive: boolean }) {
  const accent = positive ? "hsl(var(--primary))" : "#DC2626";
  const symbol = positive ? "✓" : "✕";
  return (
    <div
      style={{
        padding: 14,
        borderRadius: 10,
        background: "var(--bg-sunken)",
        border: "1px solid var(--border-ds)",
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 700, color: accent, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>
        {positive ? "Fai così" : "Evita questo"}
      </div>
      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 6 }}>
        {items.map((it, i) => (
          <li key={i} style={{ fontSize: 12.5, color: "var(--fg-muted)", lineHeight: 1.5, display: "flex", gap: 6 }}>
            <span style={{ color: accent, flexShrink: 0, fontWeight: 700 }}>{symbol}</span>
            <span>{it}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
