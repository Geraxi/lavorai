"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AppTopbar } from "@/components/design/topbar";
import { Icon, type IconName } from "@/components/design/icon";

interface Question {
  id: string;
  labelKey: string;
  label: string;
  kind: string;
  options?: string[];
}

interface StepDef {
  key: string;
  title: string;
  short: string;
  sub: string;
  icon: IconName;
  match: RegExp | null;
}

// Categorie del wizard (ordine = ordine dei passi). Le domande reali vengono
// smistate per keyword; ciò che non matcha finisce in "Altre domande".
const CATEGORIES: StepDef[] = [
  { key: "exp", title: "Esperienza professionale", short: "Esperienza", sub: "Aiutaci a conoscere meglio il tuo background.", icon: "briefcase", match: /esperienz|experience|anni|years|ruol|role|senior|competenz|skill|strument|tool/i },
  { key: "remote", title: "Lavoro da remoto", short: "Lavoro da remoto", sub: "Disponibilità, sede e trasferimenti.", icon: "map-pin", match: /remot|remote|sede|office|ufficio|trasfer|reloc|hybrid|ibrid|location|città|city|disponib|availab|notice|preavviso/i },
  { key: "legal", title: "Idoneità legale", short: "Idoneità legale", sub: "Permessi di lavoro e requisiti di legge.", icon: "file", match: /visa|visto|permess|permit|autorizz|authori|cittadin|citizen|sponsor|legal|legge|residen|eu\b|ue\b|work in|lavorare in|età|age\b|18/i },
  { key: "conflict", title: "Conflitti di interesse", short: "Conflitti di interesse", sub: "Rapporti con l'azienda e altri impegni.", icon: "tag", match: /conflit|conflict|non.?compet|precedent|previous|già lavorat|worked (at|for)|referr|segnalat|parent|relativ|famil|dipendent/i },
  { key: "other", title: "Altre domande", short: "Altre domande", sub: "Informazioni aggiuntive richieste dai form.", icon: "user", match: null },
];

/**
 * Domande dalle candidature — wizard fit-to-viewport a passi:
 * categorie con domande reali + passo finale "Revisione".
 * Le risposte sono riutilizzabili e ri-accodano le candidature in attesa.
 */
export default function QuestionsPage() {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [waiting, setWaiting] = useState(0);
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState(0);
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

  // Smista le domande nelle categorie; tiene solo i passi non vuoti + Revisione.
  const steps = useMemo(() => {
    const buckets = new Map<string, Question[]>(CATEGORIES.map((c) => [c.key, []]));
    for (const q of questions) {
      const label = cleanLabel(q.label);
      const cat = CATEGORIES.find((c) => c.match && c.match.test(label)) ?? CATEGORIES[CATEGORIES.length - 1];
      buckets.get(cat.key)!.push(q);
    }
    const list = CATEGORIES.filter((c) => (buckets.get(c.key) ?? []).length > 0).map((c) => ({ ...c, questions: buckets.get(c.key)! }));
    list.push({ key: "review", title: "Revisione", short: "Revisione", sub: "Controlla le risposte prima di salvare.", icon: "check", match: null, questions: [] });
    return list;
  }, [questions]);

  const cur = steps[Math.min(step, steps.length - 1)];
  const isReview = cur?.key === "review";
  const answered = questions.filter((q) => (values[q.labelKey] ?? "").trim()).length;

  async function save(requeue: boolean) {
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
      if (requeue) {
        await load();
        setStep(0);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <AppTopbar title="Domande" breadcrumb="Lavoro" />
      <div className="fit-page" style={{ gridTemplateColumns: "minmax(0,1fr) 380px", gridTemplateRows: "auto auto minmax(0,1fr) auto" }}>
        {/* Header */}
        <div style={{ gridColumn: "1 / -1" }}>
          <div style={{ fontSize: 12, color: "var(--fg-subtle)", display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
            Domande <Icon name="chevron-right" size={12} /> <span style={{ color: "var(--fg-muted)" }}>Crea profilo candidature</span>
          </div>
          <h1 className="fit-h1">Domande dalle candidature</h1>
          <p className="fit-hero-sub" style={{ maxWidth: 820 }}>
            Rispondi a alcune domande per migliorare la qualità delle tue candidature. Useremo queste informazioni per compilare automaticamente i form delle aziende.
            {waiting > 0 && (
              <> <strong style={{ color: "var(--fg)" }}>{waiting}</strong> {waiting === 1 ? "candidatura è in attesa" : "candidature sono in attesa"} delle tue risposte.</>
            )}
          </p>
        </div>

        {/* Stepper */}
        <div style={{ gridColumn: "1 / -1", display: "flex", alignItems: "flex-start", padding: "4px 8px 0" }}>
          {steps.map((s, i) => {
            const state = i < step ? "done" : i === step ? "cur" : "todo";
            return (
              <div key={s.key} style={{ display: "flex", alignItems: "flex-start", flex: i === steps.length - 1 ? "0 0 auto" : 1, minWidth: 0 }}>
                <button type="button" onClick={() => i <= step && setStep(i)} style={{ background: "transparent", border: "none", padding: 0, cursor: i <= step ? "pointer" : "default", display: "flex", flexDirection: "column", alignItems: "center", gap: 8, color: "inherit" }}>
                  <div style={{ width: 30, height: 30, borderRadius: 999, display: "grid", placeItems: "center", fontSize: 13, fontWeight: 700, background: state === "todo" ? "var(--bg-sunken)" : "hsl(var(--primary))", color: state === "todo" ? "var(--fg-muted)" : "#04130c", border: `1px solid ${state === "todo" ? "var(--border-ds)" : "transparent"}`, boxShadow: state === "cur" ? "0 0 0 4px hsl(var(--primary)/0.2)" : "none" }}>
                    {state === "done" ? <Icon name="check" size={14} /> : i + 1}
                  </div>
                  <div style={{ fontSize: 12.5, fontWeight: state === "cur" ? 600 : 500, color: state === "todo" ? "var(--fg-muted)" : "var(--fg)", whiteSpace: "nowrap" }}>{s.short}</div>
                </button>
                {i < steps.length - 1 && (
                  <div style={{ flex: 1, height: 2, margin: "14px 10px 0", borderRadius: 2, background: i < step ? "hsl(var(--primary))" : "var(--border-ds)" }} />
                )}
              </div>
            );
          })}
        </div>

        {/* Card principale */}
        <div className="fit-card" style={{ padding: "20px 24px" }}>
          {loading ? (
            <div style={{ color: "var(--fg-muted)", fontSize: 14 }}>Carico…</div>
          ) : questions.length === 0 ? (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", gap: 10 }}>
              <div style={{ width: 56, height: 56, borderRadius: 16, background: "hsl(var(--primary)/0.14)", color: "hsl(var(--primary))", display: "grid", placeItems: "center" }}><Icon name="check" size={24} /></div>
              <div style={{ fontSize: 16, fontWeight: 600 }}>Nessuna domanda in sospeso</div>
              <div style={{ fontSize: 13, color: "var(--fg-muted)", maxWidth: 420 }}>
                {done && done.requeued > 0 ? `${done.requeued} candidature ricandidate automaticamente. ` : ""}
                Le candidature procedono in automatico. Torna qui quando un form chiede qualcosa che solo tu puoi rispondere.
              </div>
              <Link href="/applications" className="ds-btn ds-btn-primary" style={{ marginTop: 6 }}>Vai alle candidature</Link>
            </div>
          ) : (
            <>
              <div className="fit-card-head" style={{ marginBottom: 14 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 44, height: 44, borderRadius: 12, background: "hsl(var(--primary)/0.14)", color: "hsl(var(--primary))", display: "grid", placeItems: "center" }}>
                    <Icon name={cur.icon} size={20} />
                  </div>
                  <div>
                    <div className="fit-card-title" style={{ fontSize: 16 }}>{cur.title}</div>
                    <div className="fit-card-sub">{cur.sub}</div>
                  </div>
                </div>
                <div style={{ fontSize: 12.5, color: "var(--fg-muted)" }}>Passo {step + 1} di {steps.length}</div>
              </div>

              {done && (
                <div style={{ padding: "10px 12px", borderRadius: 10, background: "hsl(var(--primary)/0.1)", border: "1px solid hsl(var(--primary)/0.35)", marginBottom: 12, fontSize: 13, flexShrink: 0 }}>
                  ✅ Risposte salvate. {done.requeued > 0 ? `${done.requeued} candidature ricandidate automaticamente.` : "Nessuna candidatura ancora completa."}
                  {done.stillPending > 0 && ` ${done.stillPending} domande ancora da rispondere.`}
                </div>
              )}

              <div className="fit-body fit-scroll" style={{ gap: 16, paddingRight: 4 }}>
                {isReview ? (
                  questions.map((q) => {
                    const v = (values[q.labelKey] ?? "").trim();
                    return (
                      <div key={q.id} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10, padding: "10px 0", borderBottom: "1px solid var(--border-ds)", fontSize: 13.5 }}>
                        <div>
                          <div style={{ fontWeight: 600 }}>{cleanLabel(q.label)}</div>
                          <div style={{ color: v ? "var(--fg-muted)" : "#fbbf24", marginTop: 3 }}>{v || "Non risposto"}</div>
                        </div>
                        <span className={`ds-chip ${v ? "ds-chip-green" : "ds-chip-amber"}`}>{v ? "OK" : "Manca"}</span>
                      </div>
                    );
                  })
                ) : (
                  cur.questions.map((q) => (
                    <div key={q.id}>
                      <label style={{ display: "block", fontSize: 14, fontWeight: 600, marginBottom: 8, lineHeight: 1.4 }}>{cleanLabel(q.label)}</label>
                      {renderInput(q, values[q.labelKey] ?? "", (v) => setValues((s) => ({ ...s, [q.labelKey]: v })))}
                    </div>
                  ))
                )}
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginTop: 16, flexShrink: 0 }}>
                <button type="button" className="ds-btn" onClick={() => save(false)} disabled={saving}>{saving ? "Salvo…" : "Salva e torna dopo"}</button>
                {isReview ? (
                  <button type="button" className="ds-btn ds-btn-primary" onClick={() => save(true)} disabled={saving || answered === 0}>
                    {saving ? "Salvo…" : "Salva e ricandida"} <Icon name="arrow-right" size={14} />
                  </button>
                ) : (
                  <button type="button" className="ds-btn ds-btn-primary" onClick={() => setStep((s) => Math.min(steps.length - 1, s + 1))}>
                    Continua <Icon name="arrow-right" size={14} />
                  </button>
                )}
              </div>
            </>
          )}
        </div>

        {/* Colonna destra */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12, minHeight: 0 }}>
          <div className="fit-card" style={{ padding: "20px 22px", flex: "0 1 auto" }}>
            <div style={{ color: "#5B9BFF", marginBottom: 12 }}><Icon name="sparkles" size={22} /></div>
            <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: "-0.01em" }}>Perché chiediamo queste informazioni?</div>
            <p style={{ fontSize: 13, color: "var(--fg-muted)", lineHeight: 1.55, margin: "10px 0 14px" }}>
              Molte aziende includono domande specifiche nei form di candidatura. Le tue risposte ci permettono di compilare automaticamente questi campi in modo accurato e coerente, risparmiandoti tempo.
            </p>
            {["Candidature più rapide", "Risposte coerenti e professionali", "Maggiori possibilità di successo"].map((s) => (
              <div key={s} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13.5, padding: "5px 0" }}>
                <span style={{ width: 22, height: 22, borderRadius: 999, background: "hsl(var(--primary))", color: "#04130c", display: "grid", placeItems: "center", flexShrink: 0 }}><Icon name="check" size={12} /></span>
                {s}
              </div>
            ))}
          </div>
          <div className="fit-card" style={{ padding: "16px 18px", flexDirection: "row", gap: 12, alignItems: "flex-start", flex: "0 0 auto" }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: "var(--bg-sunken)", border: "1px solid var(--border-ds)", display: "grid", placeItems: "center", flexShrink: 0 }}><Icon name="user" size={16} /></div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>I tuoi dati sono al sicuro</div>
              <div style={{ fontSize: 12.5, color: "var(--fg-muted)", lineHeight: 1.5, marginTop: 4 }}>Le informazioni vengono utilizzate solo per compilare le candidature e non vengono condivise con terze parti.</div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ gridColumn: "1 / -1", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0 6px" }}>
          <button type="button" className="ds-btn ds-btn-ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0} style={{ opacity: step === 0 ? 0.4 : 1 }}>
            ← Indietro
          </button>
          <Link href="/dashboard" style={{ fontSize: 13, color: "var(--fg-muted)", textDecoration: "underline" }}>Salta per ora</Link>
        </div>
      </div>
    </>
  );
}

/**
 * Pulisce la label di una domanda: i form Workable concatenano nel testo la
 * lista dei prefissi telefonici, o "SVGs not supported…" → illeggibile.
 */
function cleanLabel(raw: string): string {
  let s = (raw || "")
    .replace(/SVGs? not supported by this browser\.?/gi, " ")
    .split(/\s*\+\d{1,4}[A-Z]/)[0]
    .replace(/\s+/g, " ")
    .trim();
  s = s.replace(/^\*+/, "").replace(/\*+$/, "").trim();
  if (!s) s = raw.slice(0, 60);
  return s;
}

function renderInput(q: Question, value: string, onChange: (v: string) => void) {
  if (q.kind === "select" || q.kind === "react-select") {
    const listId = `opts-${q.id}`;
    return (
      <>
        <input list={q.options?.length ? listId : undefined} value={value} onChange={(e) => onChange(e.target.value)} className="fit-input" placeholder="Scrivi o scegli (es. Italy)…" />
        {q.options?.length ? <datalist id={listId}>{q.options.map((o) => <option key={o} value={o} />)}</datalist> : null}
      </>
    );
  }
  if (q.kind === "checkbox") {
    return (
      <select value={value} onChange={(e) => onChange(e.target.value)} className="fit-input">
        <option value="">— scegli —</option>
        <option value="Yes">Sì / Accetto</option>
        <option value="No">No</option>
      </select>
    );
  }
  if (q.kind === "textarea") {
    return <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={3} className="fit-input" style={{ resize: "vertical" }} placeholder="La tua risposta…" />;
  }
  return <input value={value} onChange={(e) => onChange(e.target.value)} className="fit-input" placeholder="La tua risposta…" />;
}
