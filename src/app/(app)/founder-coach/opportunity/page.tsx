"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Icon } from "@/components/design/icon";
import type {
  OpportunityAnalysis,
  AnalysisFlag,
} from "@/lib/founder-coach/types";
import { getStageById } from "@/lib/founder-coach/data/stages";

export default function OpportunityAnalyzerPage() {
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState<OpportunityAnalysis | null>(null);

  const [companyName, setCompanyName] = useState("");
  const [roleTitle, setRoleTitle] = useState("");
  const [rawContext, setRawContext] = useState("");
  const [companyUrl, setCompanyUrl] = useState("");
  const [cvSummary, setCvSummary] = useState("");
  const [personalGoal, setPersonalGoal] = useState("");
  const [commitment, setCommitment] = useState("full_time");
  const [minSalary, setMinSalary] = useState("");
  const [desiredEquity, setDesiredEquity] = useState("");
  const [keepCurrentJob, setKeepCurrentJob] = useState(false);
  const [personalProjects, setPersonalProjects] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!companyName.trim() || !roleTitle.trim() || !rawContext.trim()) {
      toast.error("Compila almeno azienda, ruolo e contesto.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/founder-coach/analyze-opportunity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName,
          roleTitle,
          rawContext,
          companyUrl: companyUrl || undefined,
          cvSummary: cvSummary || undefined,
          personalGoal: personalGoal || undefined,
          constraints: {
            commitment,
            minMonthlySalary: minSalary ? Number(minSalary) : undefined,
            desiredEquityPct: desiredEquity ? Number(desiredEquity) : undefined,
            keepCurrentJob,
            personalProjects,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.message ?? "Errore analisi");
        setLoading(false);
        return;
      }
      setAnalysis(data.analysis);
      // Scroll to results
      setTimeout(() => {
        document
          .getElementById("analysis-results")
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 100);
    } catch {
      toast.error("Errore di rete");
    } finally {
      setLoading(false);
    }
  }

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
        A · Opportunity Analyzer
      </h1>
      <p style={{ fontSize: 14.5, color: "var(--fg-muted)", marginTop: 8, lineHeight: 1.55, maxWidth: 720 }}>
        Incolla tutto quello che hai: job description, email del founder, link
        Crunchbase. L&apos;analyzer ti ridà: stage, red/green flags, domande da
        fare, cosa negoziare, score 1-10.
      </p>

      <form
        onSubmit={onSubmit}
        style={{ marginTop: 28, display: "flex", flexDirection: "column", gap: 18 }}
      >
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <Field label="Azienda *">
            <input
              type="text"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="FoolFarm, Bending Spoons, Stripe, ..."
              required
              className="ds-input"
            />
          </Field>
          <Field label="Ruolo proposto *">
            <input
              type="text"
              value={roleTitle}
              onChange={(e) => setRoleTitle(e.target.value)}
              placeholder="CTO, Tech Co-Founder, Founding AI Engineer..."
              required
              className="ds-input"
            />
          </Field>
        </div>

        <Field label="Link azienda (opzionale)">
          <input
            type="url"
            value={companyUrl}
            onChange={(e) => setCompanyUrl(e.target.value)}
            placeholder="https://..."
            className="ds-input"
          />
        </Field>

        <Field
          label="Contesto raw *"
          hint="Incolla TUTTO: job post, email ricevuta, pitch deck text, LinkedIn description. Più contesto = analisi migliore."
        >
          <textarea
            value={rawContext}
            onChange={(e) => setRawContext(e.target.value)}
            rows={8}
            placeholder="Esempio: 'Ciao Umberto, ti scrivo da FoolFarm. Stiamo cercando un CTO per una nostra venture early-stage nel proptech AI. Stage pre-seed con €300k raccolti, team di 3, equity disponibile da definire...'"
            required
            className="ds-input"
            style={{ resize: "vertical", fontFamily: "inherit", minHeight: 160 }}
          />
        </Field>

        <details
          style={{
            padding: "12px 14px",
            borderRadius: 10,
            background: "var(--bg-elev)",
            border: "1px solid var(--border-ds)",
          }}
        >
          <summary style={{ cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
            Vincoli + obiettivo personale (opzionale, migliora l&apos;analisi)
          </summary>
          <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 12 }}>
            <Field label="CV / profilo (sintesi)">
              <textarea
                value={cvSummary}
                onChange={(e) => setCvSummary(e.target.value)}
                rows={4}
                placeholder="2-3 frasi: chi sei, cosa hai costruito, anni di esperienza..."
                className="ds-input"
                style={{ resize: "vertical", fontFamily: "inherit" }}
              />
            </Field>
            <Field label="Obiettivo personale">
              <input
                type="text"
                value={personalGoal}
                onChange={(e) => setPersonalGoal(e.target.value)}
                placeholder="Es: offerta concreta, esplorare, leva per altra offerta..."
                className="ds-input"
              />
            </Field>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
              <Field label="Commitment">
                <select
                  value={commitment}
                  onChange={(e) => setCommitment(e.target.value)}
                  className="ds-input"
                >
                  <option value="full_time">Full-time</option>
                  <option value="part_time">Part-time</option>
                  <option value="flexible">Flessibile</option>
                </select>
              </Field>
              <Field label="Stipendio min (€/mese)">
                <input
                  type="number"
                  value={minSalary}
                  onChange={(e) => setMinSalary(e.target.value)}
                  placeholder="4000"
                  className="ds-input"
                />
              </Field>
              <Field label="Equity desiderata (%)">
                <input
                  type="number"
                  step="0.1"
                  value={desiredEquity}
                  onChange={(e) => setDesiredEquity(e.target.value)}
                  placeholder="5"
                  className="ds-input"
                />
              </Field>
            </div>
            <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
              <Checkbox
                checked={keepCurrentJob}
                onChange={setKeepCurrentJob}
                label="Voglio mantenere lavoro attuale durante una fase iniziale"
              />
              <Checkbox
                checked={personalProjects}
                onChange={setPersonalProjects}
                label="Ho progetti personali da proteggere"
              />
            </div>
          </div>
        </details>

        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <button
            type="submit"
            disabled={loading}
            className="ds-btn ds-btn-primary"
            style={{ padding: "12px 22px", fontSize: 14 }}
          >
            {loading ? (
              <>
                <Icon name="refresh" size={14} /> Analizzo (15-25s)...
              </>
            ) : (
              <>
                Genera strategia <Icon name="zap" size={13} />
              </>
            )}
          </button>
          <span style={{ fontSize: 11.5, color: "var(--fg-subtle)" }}>
            Powered by Claude Sonnet 4 · output JSON strutturato
          </span>
        </div>
      </form>

      {analysis && (
        <div id="analysis-results" style={{ marginTop: 40 }}>
          <AnalysisDisplay analysis={analysis} />
        </div>
      )}
    </div>
  );
}

function AnalysisDisplay({ analysis }: { analysis: OpportunityAnalysis }) {
  const stage = getStageById(analysis.estimatedStage);
  const scoreColor =
    analysis.riskOpportunityScore >= 7
      ? "hsl(var(--primary))"
      : analysis.riskOpportunityScore >= 4
        ? "#D97706"
        : "#DC2626";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {/* SCORE CARD */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "auto 1fr",
          gap: 24,
          padding: 22,
          borderRadius: 16,
          background: "linear-gradient(180deg, hsl(var(--primary) / 0.06), transparent 70%)",
          border: "1px solid hsl(var(--primary) / 0.25)",
          alignItems: "center",
        }}
      >
        <div
          style={{
            width: 110,
            height: 110,
            borderRadius: "50%",
            background: `conic-gradient(${scoreColor} ${analysis.riskOpportunityScore * 36}deg, var(--bg-sunken) 0)`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              width: 92,
              height: 92,
              borderRadius: "50%",
              background: "var(--bg)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div style={{ fontSize: 32, fontWeight: 800, color: scoreColor, lineHeight: 1 }}>
              {analysis.riskOpportunityScore}
            </div>
            <div style={{ fontSize: 10, color: "var(--fg-subtle)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
              su 10
            </div>
          </div>
        </div>
        <div>
          <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: "-0.01em", marginBottom: 8 }}>
            {analysis.summary}
          </div>
          <div style={{ fontSize: 13, color: "var(--fg-muted)", lineHeight: 1.55 }}>
            {analysis.scoreRationale}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
            <Tag label={`Tipo: ${labelType(analysis.companyType)}`} />
            <Tag
              label={`Stage: ${stage?.label ?? analysis.estimatedStage}`}
              tone="primary"
            />
            <Tag label={`Confidence: ${analysis.stageConfidence}`} subtle />
          </div>
        </div>
      </div>

      {/* RED / GREEN FLAGS */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }} className="flags-grid">
        <FlagColumn title="🚩 Red flags" flags={analysis.redFlags} tone="red" />
        <FlagColumn title="✅ Green flags" flags={analysis.greenFlags} tone="green" />
      </div>

      {/* QUESTIONS + NEGOTIATE */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }} className="flags-grid">
        <ListBlock
          title="Domande da fare in call"
          items={analysis.questionsToAsk}
          accent="hsl(var(--primary))"
        />
        <ListBlock
          title="Cosa negoziare"
          items={analysis.thingsToNegotiate}
          accent="#D97706"
        />
      </div>

      {/* STRATEGY */}
      <div
        style={{
          padding: 22,
          borderRadius: 14,
          background: "var(--bg-elev)",
          border: "1px solid var(--border-ds)",
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.12em",
            color: "hsl(var(--primary))",
            marginBottom: 10,
          }}
        >
          Strategia consigliata
        </div>
        <p style={{ fontSize: 14.5, lineHeight: 1.7, margin: 0, color: "var(--fg)" }}>
          {analysis.strategy}
        </p>
      </div>

      <style jsx>{`
        @media (max-width: 800px) {
          :global(.flags-grid) { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}

function FlagColumn({
  title,
  flags,
  tone,
}: {
  title: string;
  flags: AnalysisFlag[];
  tone: "red" | "green";
}) {
  const accent = tone === "red" ? "#DC2626" : "hsl(var(--primary))";
  return (
    <div
      style={{
        padding: 18,
        borderRadius: 14,
        background: "var(--bg-elev)",
        border: `1px solid ${tone === "red" ? "rgba(220,38,38,0.25)" : "hsl(var(--primary) / 0.25)"}`,
      }}
    >
      <div
        style={{
          fontSize: 13,
          fontWeight: 700,
          color: accent,
          marginBottom: 12,
        }}
      >
        {title}
      </div>
      {flags.length === 0 ? (
        <div style={{ fontSize: 12.5, color: "var(--fg-subtle)" }}>Nessun flag rilevato.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {flags.map((f, i) => (
            <div
              key={i}
              style={{
                padding: "10px 12px",
                borderRadius: 8,
                background: "var(--bg-sunken)",
                border: `1px solid ${tone === "red" ? "rgba(220,38,38,0.18)" : "rgba(5,150,105,0.18)"}`,
              }}
            >
              <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 3 }}>
                {f.title}
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    textTransform: "uppercase",
                    marginLeft: 6,
                    color: "var(--fg-subtle)",
                  }}
                >
                  · {f.severity}
                </span>
              </div>
              <div style={{ fontSize: 12.5, color: "var(--fg-muted)", lineHeight: 1.5 }}>
                {f.detail}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ListBlock({
  title,
  items,
  accent,
}: {
  title: string;
  items: string[];
  accent: string;
}) {
  return (
    <div
      style={{
        padding: 18,
        borderRadius: 14,
        background: "var(--bg-elev)",
        border: "1px solid var(--border-ds)",
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 700, color: accent, marginBottom: 12 }}>
        {title}
      </div>
      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8 }}>
        {items.map((q, i) => (
          <li
            key={i}
            style={{ fontSize: 13.5, lineHeight: 1.55, display: "flex", gap: 10 }}
          >
            <span
              style={{
                width: 18,
                height: 18,
                flexShrink: 0,
                borderRadius: 999,
                background: `${accent}22`,
                color: accent,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 10.5,
                fontWeight: 700,
                marginTop: 1,
              }}
            >
              {i + 1}
            </span>
            <span>{q}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Tag({ label, tone, subtle }: { label: string; tone?: "primary"; subtle?: boolean }) {
  return (
    <span
      style={{
        fontSize: 11.5,
        padding: "4px 10px",
        borderRadius: 999,
        background:
          tone === "primary" ? "hsl(var(--primary) / 0.12)" : "var(--bg-sunken)",
        color: tone === "primary" ? "hsl(var(--primary))" : "var(--fg-muted)",
        border:
          tone === "primary"
            ? "1px solid hsl(var(--primary) / 0.3)"
            : "1px solid var(--border-ds)",
        opacity: subtle ? 0.7 : 1,
        fontWeight: 600,
      }}
    >
      {label}
    </span>
  );
}

function labelType(t: string): string {
  const map: Record<string, string> = {
    startup: "Startup",
    venture_studio: "Venture Studio",
    accelerator: "Accelerator",
    scaleup: "Scaleup",
    corporate: "Corporate",
    agency: "Agency",
    unknown: "Sconosciuto",
  };
  return map[t] ?? t;
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ fontSize: 13, fontWeight: 600 }}>{label}</span>
      {children}
      {hint && (
        <span style={{ fontSize: 11.5, color: "var(--fg-subtle)", lineHeight: 1.45 }}>
          {hint}
        </span>
      )}
    </label>
  );
}

function Checkbox({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        fontSize: 13,
        cursor: "pointer",
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{ accentColor: "hsl(var(--primary))" }}
      />
      {label}
    </label>
  );
}
