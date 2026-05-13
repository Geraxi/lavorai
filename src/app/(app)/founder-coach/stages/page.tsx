import Link from "next/link";
import type { Metadata } from "next";
import { COMPANY_STAGES } from "@/lib/founder-coach/data/stages";
import { Icon } from "@/components/design/icon";

export const metadata: Metadata = {
  title: "Startup Stage Explainer · Founder Coach",
  description:
    "Da Idea a IPO: equity realistico, rischio, salario, domande da fare, cosa evitare per ogni stage di una startup.",
};

export default function StageExplainerPage() {
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
        B · Startup Stage Explainer
      </h1>
      <p style={{ fontSize: 14.5, color: "var(--fg-muted)", marginTop: 8, lineHeight: 1.55, maxWidth: 720 }}>
        Per ogni stage: equity realistico da chiedere, rischio, salario di
        riferimento, liquidità attesa, domande critiche, anti-pattern da
        evitare.
      </p>

      <div style={{ marginTop: 30, display: "flex", flexDirection: "column", gap: 16 }}>
        {COMPANY_STAGES.map((stage, idx) => (
          <details
            key={stage.id}
            open={idx < 2}
            style={{
              padding: "18px 20px",
              borderRadius: 14,
              background: "var(--bg-elev)",
              border: "1px solid var(--border-ds)",
            }}
          >
            <summary
              style={{
                cursor: "pointer",
                listStyle: "none",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 14,
                flexWrap: "wrap",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <RiskBadge level={stage.riskLevel} />
                <div>
                  <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-0.012em" }}>
                    {stage.label}
                  </div>
                  <div style={{ fontSize: 12.5, color: "var(--fg-muted)", marginTop: 2 }}>
                    Equity {stage.realisticEquityRange.min}-{stage.realisticEquityRange.max}% · €
                    {stage.realisticSalaryRange.min}-{stage.realisticSalaryRange.max}/mese · {stage.liquidityHorizon}
                  </div>
                </div>
              </div>
            </summary>

            <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "1fr", gap: 14 }}>
              <p style={{ fontSize: 13.5, lineHeight: 1.6, margin: 0, color: "var(--fg-muted)" }}>
                {stage.description}
              </p>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }} className="stage-grid">
                <Block title="Domande da fare in call" items={stage.goodQuestionsToAsk} accent="hsl(var(--primary))" />
                <Block title="Cosa evitare" items={stage.thingsToAvoid} accent="#D97706" />
              </div>

              {stage.redFlagPatterns.length > 0 && (
                <div
                  style={{
                    padding: "12px 14px",
                    borderRadius: 10,
                    background: "rgba(220,38,38,0.06)",
                    border: "1px solid rgba(220,38,38,0.25)",
                  }}
                >
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.1em",
                      color: "#DC2626",
                      marginBottom: 6,
                    }}
                  >
                    🚩 Pattern di red flag
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {stage.redFlagPatterns.map((p, i) => (
                      <code
                        key={i}
                        style={{
                          fontSize: 11.5,
                          padding: "3px 8px",
                          borderRadius: 6,
                          background: "rgba(220,38,38,0.10)",
                          color: "#fca5a5",
                          border: "1px solid rgba(220,38,38,0.20)",
                          fontFamily:
                            'ui-monospace, "SF Mono", Consolas, monospace',
                        }}
                      >
                        {p}
                      </code>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </details>
        ))}
      </div>

      <style>{`
        @media (max-width: 800px) {
          .stage-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}

function RiskBadge({ level }: { level: number }) {
  const colors = ["#22C55E", "#22C55E", "#F59E0B", "#EF4444", "#DC2626"];
  return (
    <div
      style={{
        width: 48,
        height: 48,
        borderRadius: 12,
        background: `${colors[level - 1]}22`,
        border: `1px solid ${colors[level - 1]}55`,
        display: "inline-flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      <div style={{ fontSize: 18, fontWeight: 700, color: colors[level - 1], lineHeight: 1 }}>
        {level}
      </div>
      <div style={{ fontSize: 8, color: colors[level - 1], opacity: 0.7, marginTop: 2, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>
        risk
      </div>
    </div>
  );
}

function Block({ title, items, accent }: { title: string; items: string[]; accent: string }) {
  return (
    <div
      style={{
        padding: 14,
        borderRadius: 10,
        background: "var(--bg-sunken)",
        border: "1px solid var(--border-ds)",
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 700, color: accent, marginBottom: 10 }}>{title}</div>
      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 6 }}>
        {items.map((it, i) => (
          <li key={i} style={{ fontSize: 12.5, lineHeight: 1.5, color: "var(--fg-muted)" }}>
            · {it}
          </li>
        ))}
      </ul>
    </div>
  );
}
