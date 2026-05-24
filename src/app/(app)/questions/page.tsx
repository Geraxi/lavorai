"use client";

import { useEffect, useState } from "react";

interface Question {
  id: string;
  labelKey: string;
  label: string;
  kind: string;
  options?: string[];
}

/**
 * Pagina dove l'utente risponde alle domande dei form di candidatura che
 * non sappiamo compilare dai suoi dati (work auth, screening, ecc.).
 * Le risposte sono riutilizzabili: chieste una volta, riusate sempre.
 */
export default function QuestionsPage() {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [waiting, setWaiting] = useState(0);
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<{ requeued: number; stillPending: number } | null>(null);

  async function load() {
    setLoading(true);
    try {
      const r = await fetch("/api/questions");
      const j = await r.json();
      setQuestions(j.questions ?? []);
      setWaiting(j.waitingApplications ?? 0);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function submit() {
    if (saving) return;
    setSaving(true);
    setDone(null);
    try {
      const answers = questions
        .map((q) => ({ labelKey: q.labelKey, answer: (values[q.labelKey] ?? "").trim() }))
        .filter((a) => a.answer);
      const r = await fetch("/api/questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers }),
      });
      const j = await r.json();
      setDone({ requeued: j.requeued ?? 0, stillPending: j.stillPending ?? 0 });
      await load();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ padding: "28px 24px", maxWidth: 720, margin: "0 auto" }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em", margin: "0 0 6px" }}>
        Domande dalle candidature
      </h1>
      <p style={{ fontSize: 14, color: "var(--fg-muted)", margin: "0 0 20px", lineHeight: 1.6 }}>
        Alcuni form chiedono informazioni che solo tu puoi dare (diritto al
        lavoro, domande di screening, link). Rispondi una volta: le riusiamo per
        le candidature future e inviamo in automatico.
        {waiting > 0 && (
          <>
            {" "}
            <strong>{waiting}</strong> candidature sono in attesa delle tue
            risposte.
          </>
        )}
      </p>

      {done && (
        <div
          style={{
            padding: 12,
            borderRadius: 10,
            background: "rgba(22,163,74,0.1)",
            border: "1px solid rgba(22,163,74,0.4)",
            marginBottom: 18,
            fontSize: 13.5,
          }}
        >
          ✅ Risposte salvate.{" "}
          {done.requeued > 0
            ? `${done.requeued} candidature ricandidate automaticamente.`
            : "Nessuna candidatura ancora completa."}
          {done.stillPending > 0 && ` ${done.stillPending} domande ancora da rispondere.`}
        </div>
      )}

      {loading ? (
        <div style={{ color: "var(--fg-muted)", fontSize: 14 }}>Carico…</div>
      ) : questions.length === 0 ? (
        <div
          style={{
            padding: 24,
            borderRadius: 12,
            background: "var(--bg-elev)",
            border: "1px solid var(--border-ds)",
            textAlign: "center",
            color: "var(--fg-muted)",
          }}
        >
          🎉 Nessuna domanda in sospeso. Le candidature procedono in automatico.
        </div>
      ) : (
        <div style={{ display: "grid", gap: 16 }}>
          {questions.map((q) => (
            <div
              key={q.id}
              style={{
                padding: 16,
                borderRadius: 12,
                background: "var(--bg-elev)",
                border: "1px solid var(--border-ds)",
              }}
            >
              <label
                style={{
                  display: "block",
                  fontSize: 14,
                  fontWeight: 600,
                  marginBottom: 8,
                  lineHeight: 1.4,
                }}
              >
                {q.label.replace(/\*+$/, "").trim()}
              </label>
              {renderInput(q, values[q.labelKey] ?? "", (v) =>
                setValues((s) => ({ ...s, [q.labelKey]: v })),
              )}
            </div>
          ))}

          <button
            type="button"
            onClick={submit}
            disabled={saving}
            style={{
              justifySelf: "start",
              padding: "11px 22px",
              borderRadius: 10,
              border: "none",
              background: "hsl(var(--primary))",
              color: "#001a0d",
              fontSize: 14.5,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            {saving ? "Salvo…" : "Salva e ricandida"}
          </button>
        </div>
      )}
    </div>
  );
}

function renderInput(
  q: Question,
  value: string,
  onChange: (v: string) => void,
) {
  const base: React.CSSProperties = {
    width: "100%",
    borderRadius: 10,
    border: "1px solid var(--border-ds)",
    background: "var(--bg)",
    color: "var(--fg)",
    padding: "10px 12px",
    fontSize: 14,
    fontFamily: "inherit",
  };

  if ((q.kind === "select" || q.kind === "react-select") && q.options?.length) {
    return (
      <select value={value} onChange={(e) => onChange(e.target.value)} style={base}>
        <option value="">— scegli —</option>
        {q.options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    );
  }
  if (q.kind === "checkbox") {
    return (
      <select value={value} onChange={(e) => onChange(e.target.value)} style={base}>
        <option value="">— scegli —</option>
        <option value="Yes">Sì / Accetto</option>
        <option value="No">No</option>
      </select>
    );
  }
  if (q.kind === "textarea") {
    return (
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={4}
        style={{ ...base, resize: "vertical" }}
      />
    );
  }
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={base}
      placeholder="La tua risposta…"
    />
  );
}
