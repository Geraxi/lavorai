"use client";

import { useState, useEffect, type FormEvent } from "react";
import { useRouter, useParams } from "next/navigation";
import { toast } from "sonner";
import { Icon } from "@/components/design/icon";

interface ApplicationInfo {
  id: string;
  status: string;
  userStatus: string | null;
  job: {
    title: string;
    company: string | null;
    location: string | null;
    url: string;
    description: string;
  };
}

/**
 * Pagina di onboarding interview prep. L'utente arriva qui dopo aver
 * creato (o selezionato) una candidatura e clicca "Prepara colloquio".
 *
 * Output: un brief JSON salvato sulla InterviewSession + un pairing
 * code per agganciare la Chrome extension nella fase live.
 */
export default function InterviewPrepPage() {
  const router = useRouter();
  const params = useParams<{ applicationId: string }>();
  const applicationId = params?.applicationId ?? "";

  const [app, setApp] = useState<ApplicationInfo | null>(null);
  const [loadingApp, setLoadingApp] = useState(true);
  const [loading, setLoading] = useState(false);

  const [goal, setGoal] = useState("offer");
  const [expectedRound, setExpectedRound] = useState("hr");
  const [stressLevel, setStressLevel] = useState(3);
  const [weakAreas, setWeakAreas] = useState("");
  const [strengths, setStrengths] = useState("");
  const [customNotes, setCustomNotes] = useState("");

  useEffect(() => {
    if (!applicationId) return;
    fetch(`/api/applications/${applicationId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data?.application) setApp(data.application);
        setLoadingApp(false);
      })
      .catch(() => setLoadingApp(false));
  }, [applicationId]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/interview/prep", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          applicationId,
          goal,
          expectedRound,
          stressLevel,
          weakAreas: weakAreas
            .split("\n")
            .map((s) => s.trim())
            .filter(Boolean),
          strengths: strengths
            .split("\n")
            .map((s) => s.trim())
            .filter(Boolean),
          customNotes,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.message ?? "Errore salvataggio brief");
        setLoading(false);
        return;
      }
      toast.success("Brief pronto. Apri il Copilot quando inizia il colloquio.");
      router.push(`/interview/live/${applicationId}`);
    } catch {
      toast.error("Errore di rete");
      setLoading(false);
    }
  }

  if (loadingApp) {
    return (
      <div style={{ padding: 48, textAlign: "center", color: "var(--fg-muted)" }}>
        Carico la candidatura...
      </div>
    );
  }

  if (!app) {
    return (
      <div style={{ padding: 48, textAlign: "center" }}>
        <p>Candidatura non trovata.</p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "32px 24px" }}>
      <div
        style={{
          marginBottom: 24,
          padding: "16px 18px",
          borderRadius: 12,
          background: "var(--bg-elev)",
          border: "1px solid var(--border-ds)",
        }}
      >
        <div style={{ fontSize: 11, color: "var(--fg-subtle)", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 6 }}>
          Stai preparando
        </div>
        <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-0.015em" }}>
          {app.job.title}
        </div>
        <div style={{ fontSize: 13.5, color: "var(--fg-muted)", marginTop: 3 }}>
          {app.job.company}
          {app.job.location ? ` · ${app.job.location}` : ""}
        </div>
      </div>

      <h1
        style={{
          fontSize: 26,
          fontWeight: 700,
          letterSpacing: "-0.02em",
          marginBottom: 6,
        }}
      >
        Mini brief di preparazione
      </h1>
      <p
        style={{
          fontSize: 14,
          color: "var(--fg-muted)",
          lineHeight: 1.55,
          marginBottom: 28,
        }}
      >
        2 minuti. Il Copilot userà queste risposte per personalizzare i
        suggerimenti durante il colloquio.
      </p>

      <form
        onSubmit={onSubmit}
        style={{ display: "flex", flexDirection: "column", gap: 22 }}
      >
        <RadioGroup
          label="Cosa vuoi ottenere da questo colloquio?"
          name="goal"
          value={goal}
          onChange={setGoal}
          options={[
            { value: "offer", label: "Voglio un'offerta concreta" },
            { value: "explore", label: "Capire se l'azienda mi piace davvero" },
            { value: "challenge", label: "Esercizio: tenermi in allenamento" },
            { value: "negotiate", label: "Ho già un'offerta, mi serve leva" },
          ]}
        />

        <RadioGroup
          label="Che tipo di round è?"
          name="round"
          value={expectedRound}
          onChange={setExpectedRound}
          options={[
            { value: "hr", label: "HR / Screening (50% behavioral, 30% motivazionale, 20% tecnico)" },
            { value: "technical", label: "Tecnico (case study, system design, coding, take-home review)" },
            { value: "behavioral", label: "Behavioral con hiring manager (STAR, leadership, situazioni)" },
            { value: "final", label: "Final round / On-site (mix di tutto)" },
          ]}
        />

        <div>
          <label style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, display: "block" }}>
            Livello di stress per questo colloquio (1 = rilassato, 5 = molto teso)
          </label>
          <div style={{ display: "flex", gap: 8 }}>
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setStressLevel(n)}
                style={{
                  flex: 1,
                  padding: "12px 0",
                  borderRadius: 10,
                  border:
                    stressLevel === n
                      ? "2px solid hsl(var(--primary))"
                      : "1px solid var(--border-ds)",
                  background:
                    stressLevel === n
                      ? "hsl(var(--primary) / 0.12)"
                      : "var(--bg-elev)",
                  color: stressLevel === n ? "hsl(var(--primary))" : "var(--fg)",
                  fontSize: 15,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        <Field
          label="Cosa ti preoccupa di questo colloquio?"
          hint="Una cosa per riga. Es: 'system design', 'parlare di stipendio', 'lacune sul mio CV'"
        >
          <textarea
            value={weakAreas}
            onChange={(e) => setWeakAreas(e.target.value)}
            rows={4}
            placeholder="System design distribuito&#10;Spiegare il gap di 6 mesi&#10;Domanda sullo stipendio attuale"
            className="ds-input"
            style={{ resize: "vertical", fontFamily: "inherit" }}
          />
        </Field>

        <Field
          label="Su cosa vuoi puntare?"
          hint="Una cosa per riga. I tuoi punti di forza che il Copilot tirerà fuori quando può"
        >
          <textarea
            value={strengths}
            onChange={(e) => setStrengths(e.target.value)}
            rows={4}
            placeholder="Esperienza FinCrime in fintech regolata&#10;Aver scalato un team da 3 a 12&#10;Lancio di un prodotto da zero"
            className="ds-input"
            style={{ resize: "vertical", fontFamily: "inherit" }}
          />
        </Field>

        <Field
          label="Note libere (opzionale)"
          hint="Qualsiasi contesto che ti aiuti: chi è l'intervistatore, info raccolte sul team, link letti su Glassdoor..."
        >
          <textarea
            value={customNotes}
            onChange={(e) => setCustomNotes(e.target.value)}
            rows={3}
            placeholder=""
            className="ds-input"
            style={{ resize: "vertical", fontFamily: "inherit" }}
          />
        </Field>

        <div style={{ display: "flex", gap: 12, marginTop: 4 }}>
          <button
            type="submit"
            disabled={loading}
            className="ds-btn ds-btn-primary"
            style={{ padding: "12px 24px", fontSize: 14 }}
          >
            {loading ? (
              <>
                <Icon name="refresh" size={14} /> Preparo il brief...
              </>
            ) : (
              <>
                Salva e apri il Copilot <Icon name="arrow-right" size={13} />
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
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

function RadioGroup({
  label,
  name,
  value,
  onChange,
  options,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>{label}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {options.map((o) => (
          <label
            key={o.value}
            style={{
              padding: "11px 14px",
              borderRadius: 10,
              border:
                value === o.value
                  ? "1.5px solid hsl(var(--primary))"
                  : "1px solid var(--border-ds)",
              background:
                value === o.value
                  ? "hsl(var(--primary) / 0.08)"
                  : "var(--bg-elev)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 10,
              fontSize: 13.5,
              lineHeight: 1.4,
              transition: "background 0.12s, border-color 0.12s",
            }}
          >
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={value === o.value}
              onChange={(e) => onChange(e.target.value)}
              style={{ margin: 0, accentColor: "hsl(var(--primary))" }}
            />
            {o.label}
          </label>
        ))}
      </div>
    </div>
  );
}
