"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AppTopbar } from "@/components/design/topbar";
import { CompanyLogo, companyColor } from "@/components/design/company-logo";
import { ArrowLeft, ArrowRight, BriefcaseBusiness, ChevronDown, ChevronRight, CircleCheck, FileQuestion, LockKeyhole, Search, ShieldCheck, Sparkles, Users, Zap } from "lucide-react";
import { displayOption, displayQuestion } from "@/lib/question-display-language";

interface ApplicationExample { id: string; company: string; title: string }
interface Question {
  id: string;
  labelKey: string;
  label: string;
  kind: string;
  options?: string[];
  answer: string;
  source: string;
  suggestion?: string | null;
  applications: ApplicationExample[];
}
type View = "pending" | "review" | "completed" | "focus";

const categories = [
  { key: "experience", label: "Esperienza", pattern: /esperienz|experience|anni|years|ruol|role|senior|competenz|skill|strument|tool/i },
  { key: "remote", label: "Lavoro da remoto", pattern: /remot|remote|sede|office|ufficio|trasfer|reloc|hybrid|ibrid|location|città|city/i },
  { key: "legal", label: "Idoneità legale", pattern: /visa|visto|permess|permit|autorizz|authori|cittadin|citizen|sponsor|legal|legge|residen|work in|lavorare in/i },
  { key: "availability", label: "Disponibilità", pattern: /disponib|availab|notice|preavviso|iniziar|start date/i },
  { key: "salary", label: "Stipendio", pattern: /stipend|salar|compens|retribuz/i },
  { key: "other", label: "Altre domande", pattern: /.*/ },
];

function categoryFor(label: string) { return categories.find((category) => category.pattern.test(label)) ?? categories[categories.length - 1]; }
function needsReview(question: Question) { return Boolean(question.suggestion || (question.answer.trim() && question.source !== "user")); }

function AnswerField({ question, value, onChange, locale }: { question: Question; value: string; onChange: (value: string) => void; locale: string }) {
  const options = question.kind === "checkbox" ? ["Yes", "No"] : (question.options ?? []).filter((option): option is string => typeof option === "string" && Boolean(option.trim()));
  if (options.length > 0 && options.length <= 8) {
    return <div className="qa-options" role="group" aria-label={displayQuestion(question.label, locale).text}>{options.map((option) => <button key={option} type="button" className={value === option ? "is-selected" : ""} onClick={() => onChange(option)} aria-pressed={value === option}><span className="qa-radio" />{displayOption(option, locale)}</button>)}</div>;
  }
  if (question.kind === "textarea") return <textarea className="qa-input" rows={4} value={value} onChange={(event) => onChange(event.target.value)} placeholder="Scrivi la tua risposta…" aria-label={displayQuestion(question.label, locale).text} />;
  return <><input className="qa-input" type="text" list={options.length ? `qa-options-${question.id}` : undefined} value={value} onChange={(event) => onChange(event.target.value)} placeholder="Scrivi o scegli una risposta…" aria-label={displayQuestion(question.label, locale).text} />{options.length ? <datalist id={`qa-options-${question.id}`}>{options.map((option) => <option key={option} value={option} label={displayOption(option, locale)} />)}</datalist> : null}</>;
}

export function QuestionsView() {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [waiting, setWaiting] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [view, setView] = useState<View>("pending");
  const [focusId, setFocusId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState("");
  const [locale, setLocale] = useState("it");

  async function load() {
    const response = await fetch("/api/questions", { cache: "no-store" });
    if (!response.ok) throw new Error("Impossibile caricare le domande.");
    const data: { questions?: Question[]; waitingApplications?: number; locale?: string } = await response.json();
    const rows = data.questions ?? [];
    setQuestions(rows);
    setValues(Object.fromEntries(rows.map((question) => [question.labelKey, question.answer || question.suggestion || ""])));
    setWaiting(data.waitingApplications ?? 0);
    setLocale(data.locale === "en" ? "en" : "it");
    if (rows.length && rows.every((question) => question.answer.trim() || question.suggestion) && rows.some(needsReview)) {
      setView((current) => current === "pending" ? "review" : current);
    }
  }
  useEffect(() => { void load().catch(() => setNotice("Non riusciamo a caricare le domande. Ricarica la pagina.")).finally(() => setLoading(false)); }, []);

  const pending = useMemo(() => questions.filter((question) => !question.answer.trim() && !question.suggestion).sort((a, b) => b.applications.length - a.applications.length), [questions]);
  const review = useMemo(() => questions.filter(needsReview), [questions]);
  const cvSuggestions = review.filter((question) => question.suggestion && !question.answer.trim());
  const completed = useMemo(() => questions.filter((question) => question.answer.trim() && question.source === "user"), [questions]);
  const activeList = view === "review" ? review : view === "completed" ? completed : pending;
  const filtered = activeList.filter((question) => `${question.label} ${categoryFor(question.label).label} ${question.applications.map((app) => app.company).join(" ")}`.toLocaleLowerCase("it-IT").includes(query.toLocaleLowerCase("it-IT")));
  const focused = questions.find((question) => question.id === focusId) ?? pending[0] ?? null;
  const focusedIndex = focused ? pending.findIndex((question) => question.id === focused.id) : -1;
  const total = questions.length;
  const answeredCount = questions.filter((question) => question.answer.trim()).length;
  const progress = total ? Math.round(answeredCount / total * 100) : 100;

  async function save(selected: Question[]) {
    const answers = selected.map((question) => ({ labelKey: question.labelKey, answer: (values[question.labelKey] ?? "").trim() })).filter((item) => item.answer);
    if (!answers.length) { setNotice("Seleziona o scrivi una risposta prima di salvare."); return false; }
    setSaving(true); setNotice("");
    try {
      const response = await fetch("/api/questions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ answers }) });
      if (!response.ok) throw new Error("Salvataggio non riuscito. Riprova.");
      const result: { requeued?: number } = await response.json();
      await load();
      setNotice(result.requeued ? `Risposte salvate. ${result.requeued} ${result.requeued === 1 ? "candidatura ripartita" : "candidature ripartite"}.` : "Risposta salvata.");
      return true;
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Salvataggio non riuscito. Riprova.");
      return false;
    } finally { setSaving(false); }
  }

  async function saveAndNext() {
    if (!focused) return;
    const next = pending.find((question) => question.id !== focused.id);
    if (await save([focused])) { if (next) setFocusId(next.id); else { setFocusId(null); setView("pending"); } }
  }

  return <>
    <AppTopbar title="Domande" breadcrumb="Lavoro" />
    <main className="qa-page">
      <header className="qa-header">
        <div><span className="qa-eyebrow">Il tuo profilo candidature</span><h1>{view === "focus" ? "Una risposta alla volta" : view === "review" ? "Verifica le tue risposte" : "Domande per le candidature"}</h1><p>Rispondi una volta. LavorAI riutilizza la risposta nei form delle candidature compatibili.</p></div>
        {waiting > 0 && <Link className="qa-waiting" href="/applications"><BriefcaseBusiness size={17} aria-hidden />{waiting} {waiting === 1 ? "candidatura in attesa" : "candidature in attesa"}<ChevronRight size={15} aria-hidden /></Link>}
      </header>

      {notice && <div className="qa-notice" role="status">{notice}<button type="button" onClick={() => setNotice("")} aria-label="Chiudi avviso">×</button></div>}
      {loading ? <div className="qa-empty">Caricamento delle domande…</div> : total === 0 ? <div className="qa-empty"><CircleCheck size={35} aria-hidden /><h2>Nessuna domanda in sospeso</h2><p>Quando una candidatura richiederà una risposta, la troverai qui.</p><Link href="/applications">Vai alle candidature <ArrowRight size={16} aria-hidden /></Link></div> : <>
        {view === "focus" && focused ? <div className="qa-focus-layout">
          <section className="qa-focus-main">
            <button className="qa-back" type="button" onClick={() => setView("pending")}><ArrowLeft size={16} aria-hidden /> Tutte le domande</button>
            <div className="qa-impact"><Zap size={22} aria-hidden /><span>Questa risposta è richiesta da <strong>{focused.applications.length} {focused.applications.length === 1 ? "candidatura" : "candidature"}</strong></span></div>
            <div className="qa-progress-label"><span>{categoryFor(focused.label).label} · {focusedIndex + 1} di {pending.length}</span><strong>{progress}% completato</strong></div>
            <div className="qa-progress"><span style={{ width: `${progress}%` }} /></div>
            <h2 title={focused.label}>{displayQuestion(focused.label, locale).text}</h2>
            <AnswerField question={focused} locale={locale} value={values[focused.labelKey] ?? ""} onChange={(value) => setValues((current) => ({ ...current, [focused.labelKey]: value }))} />
            <div className="qa-focus-actions"><button type="button" className="qa-secondary" onClick={() => setView("pending")}>Continua più tardi</button><button type="button" className="qa-primary" disabled={saving} onClick={() => void saveAndNext()}>{saving ? "Salvataggio…" : "Salva e continua"}<ArrowRight size={16} aria-hidden /></button></div>
          </section>
          <aside className="qa-focus-aside"><div className="qa-aside-heading"><FileQuestion size={20} aria-hidden /><h3>Dove verrà usata</h3></div><p>La risposta potrà essere usata per compilare automaticamente questi form di candidatura.</p>{focused.applications.length ? <div className="qa-related">{focused.applications.slice(0, 4).map((app) => <Link href={`/applications?id=${app.id}`} key={app.id}><CompanyLogo company={app.company} color={companyColor(app.company)} size={38} rounded={9} /><span><strong>{app.company}</strong><small>{app.title}</small></span><ChevronRight size={15} aria-hidden /></Link>)}{focused.applications.length > 4 && <small>e altre {focused.applications.length - 4}</small>}</div> : <p>Nessuna candidatura attualmente in attesa di questa domanda.</p>}<div className="qa-private"><ShieldCheck size={20} aria-hidden /><div><strong>La risposta resta nel tuo profilo</strong><p>Verrà inserita nei form delle candidature pertinenti. Non è pubblica.</p></div></div></aside>
        </div> : <div className="qa-layout">
          <section className="qa-main">
            <div className="qa-overview"><div><strong>{answeredCount} di {total}</strong> risposte disponibili</div><span>{progress}%</span><div className="qa-progress"><span style={{ width: `${progress}%` }} /></div></div>
            <div className="qa-toolbar"><nav className="qa-tabs" aria-label="Stato domande">{([["pending", "Da rispondere", pending.length], ["review", "Da verificare", review.length], ["completed", "Completate", completed.length]] as const).map(([key, label, count]) => <button type="button" key={key} className={view === key ? "is-active" : ""} onClick={() => { setView(key); setExpandedId(null); }} aria-pressed={view === key}>{label}<span>{count}</span></button>)}</nav><label className="qa-search"><Search size={16} aria-hidden /><span className="sr-only">Cerca domande</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cerca domande o aziende" /></label></div>
            <div className="qa-list">{filtered.length ? filtered.map((question, index) => {
              const expanded = expandedId === question.id;
              const wording = displayQuestion(question.label, locale);
              return <article className={`qa-row ${expanded ? "is-expanded" : ""}`} key={question.id}><button type="button" className="qa-row-head" onClick={() => setExpandedId(expanded ? null : question.id)} aria-expanded={expanded}><span className="qa-number">{index + 1}</span><span className="qa-category">{categoryFor(question.label).label}</span><span className="qa-question" title={wording.translated ? question.label : undefined}>{wording.text}{question.suggestion && !question.answer ? <small>Dal tuo CV: {displayOption(question.suggestion, locale)}</small> : question.answer && <small>{displayOption(question.answer, locale)}</small>}</span><span className="qa-impact-count">{question.applications.length ? `${question.applications.length} in attesa` : ""}</span><ChevronDown size={16} aria-hidden /></button>{expanded && <div className="qa-row-body"><AnswerField question={question} locale={locale} value={values[question.labelKey] ?? ""} onChange={(value) => setValues((current) => ({ ...current, [question.labelKey]: value }))} /><div className="qa-row-actions">{view === "pending" && <button type="button" className="qa-secondary" onClick={() => { setFocusId(question.id); setView("focus"); }}>Apri a schermo intero</button>}<button type="button" className="qa-primary" disabled={saving} onClick={() => void save([question])}>{saving ? "Salvataggio…" : view === "review" ? "Conferma risposta" : "Salva risposta"}<ArrowRight size={15} aria-hidden /></button></div></div>}</article>;
            }) : <div className="qa-list-empty">{query ? "Nessuna domanda corrisponde alla ricerca." : view === "pending" ? "Hai risposto a tutte le domande in sospeso." : view === "review" ? "Nessuna risposta da verificare." : "Nessuna risposta completata."}</div>}</div>
            {view === "review" && cvSuggestions.length > 0 && <div className="qa-batch"><div><strong>{cvSuggestions.length} {cvSuggestions.length === 1 ? "risposta trovata" : "risposte trovate"} nel CV</strong><span>Controllale prima di usarle nelle candidature.</span></div><button type="button" className="qa-primary" disabled={saving} onClick={() => void save(cvSuggestions)}>{saving ? "Salvataggio…" : "Conferma quelle dal CV"}<ArrowRight size={15} aria-hidden /></button></div>}
            {pending.length > 0 && view === "pending" && <button type="button" className="qa-start" onClick={() => { setFocusId(pending[0].id); setView("focus"); }}>Rispondi una domanda alla volta <ArrowRight size={16} aria-hidden /></button>}
          </section>
          <aside className="qa-aside"><div className="qa-aside-card"><div className="qa-aside-heading"><Sparkles size={19} aria-hidden /><h3>I tuoi progressi</h3></div><div className="qa-ring" style={{ background: `conic-gradient(#6cefd1 ${progress * 3.6}deg, #2b3943 0)` }}><span>{progress}%</span></div><p><strong>{answeredCount} di {total}</strong> risposte disponibili</p><div className="qa-aside-rule" /><p><strong>{waiting}</strong> {waiting === 1 ? "candidatura attende" : "candidature attendono"} una o più risposte.</p></div><div className="qa-aside-card"><div className="qa-aside-heading"><Users size={19} aria-hidden /><h3>Per categoria</h3></div>{categories.map((category) => { const rows = questions.filter((question) => categoryFor(question.label).key === category.key); if (!rows.length) return null; const count = rows.filter((question) => Boolean(question.answer.trim())).length; return <div className="qa-category-progress" key={category.key}><span>{category.label}</span><small>{count}/{rows.length}</small><div><i style={{ width: `${Math.round(count / rows.length * 100)}%` }} /></div></div>; })}</div><div className="qa-privacy"><LockKeyhole size={17} aria-hidden /> Le risposte vengono usate solo per compilare le tue candidature.</div></aside>
        </div>}
      </>}
    </main>
  </>;
}
