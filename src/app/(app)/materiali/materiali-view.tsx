"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowDown, ArrowUpRight, BriefcaseBusiness, Check, ChevronRight,
  CircleAlert, Clock3, Download, FileCheck2, FileText, Mail,
  MapPin, Plus, Search, Send, Sparkles,
} from "lucide-react";
import { CompanyLogo, companyColor } from "@/components/design/company-logo";

export interface MaterialItem {
  id: string;
  title: string;
  company: string;
  location: string | null;
  jobUrl: string;
  createdAt: string;
  completedAt: string | null;
  status: string;
  submittedVia: string | null;
  hasPdf: boolean;
  hasDocx: boolean;
  hasLetter: boolean;
  letterText: string | null;
  language: string | null;
  match: number | null;
  lastReplyAt: string | null;
  lastReplyKind: string | null;
}

type Filter = "all" | "review" | "ready" | "sent";
type Tab = "cv" | "letter" | "job";
type Sort = "newest" | "oldest" | "match";

const humanReplyKinds = new Set(["risposta", "colloquio", "rifiutata"]);
const sent = (item: MaterialItem) => item.status === "success" && Boolean(item.submittedVia);
const review = (item: MaterialItem) => ["failed", "needs_answers", "awaiting_consent"].includes(item.status) || (item.status === "success" && !item.submittedVia);
const ready = (item: MaterialItem) => !sent(item) && !review(item) && (item.hasPdf || item.hasDocx);
const date = (value: string) => new Date(value).toLocaleDateString("it-IT", { day: "numeric", month: "short", year: "numeric" });
const language = (value: string | null) => value?.toLowerCase() === "en" ? "EN" : value?.toLowerCase() === "it" ? "IT" : "—";

function status(item: MaterialItem): { text: string; tone: "mint" | "amber" | "blue" } {
  if (sent(item)) return { text: "Inviato", tone: "mint" };
  if (item.status === "awaiting_consent") return { text: "Da confermare", tone: "amber" };
  if (item.status === "needs_answers") return { text: "Risposte richieste", tone: "amber" };
  if (review(item)) return { text: "Da rivedere", tone: "amber" };
  return { text: ready(item) ? "Pronto" : "In preparazione", tone: "blue" };
}

function Match({ value, large = false }: { value: number | null; large?: boolean }) {
  if (value == null) return <span className="mat-match-empty">Match non calcolato</span>;
  const score = Math.max(0, Math.min(100, value));
  return (
    <div className={`mat-match ${large ? "mat-match-large" : ""}`} style={{ background: `conic-gradient(var(--mat-mint) ${score * 3.6}deg, var(--mat-track) 0)` }} aria-label={`Match ${score}%`}>
      <span>{score}%</span>
    </div>
  );
}

function DownloadLink({ id, kind, label }: { id: string; kind: "pdf" | "cv" | "cover"; label: string }) {
  return <a className="mat-download" href={`/api/applications/${id}/document?kind=${kind}`} download><Download size={15} aria-hidden />{label}</a>;
}

export function MaterialiView({ items, total }: { items: MaterialItem[]; total: number }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [lang, setLang] = useState("all");
  const [sort, setSort] = useState<Sort>("newest");
  const [selectedId, setSelectedId] = useState<string | null>(items[0]?.id ?? null);
  const [tab, setTab] = useState<Tab>("cv");

  const counts = {
    all: items.length,
    review: items.filter(review).length,
    ready: items.filter(ready).length,
    sent: items.filter(sent).length,
  };

  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("it-IT");
    return items
      .filter((item) => !needle || `${item.title} ${item.company} ${item.location ?? ""}`.toLocaleLowerCase("it-IT").includes(needle))
      .filter((item) => filter === "all" || (filter === "review" ? review(item) : filter === "ready" ? ready(item) : sent(item)))
      .filter((item) => lang === "all" || item.language?.toLowerCase() === lang)
      .sort((a, b) => sort === "match" ? (b.match ?? -1) - (a.match ?? -1) : sort === "oldest" ? Date.parse(a.createdAt) - Date.parse(b.createdAt) : Date.parse(b.createdAt) - Date.parse(a.createdAt));
  }, [items, query, filter, lang, sort]);
  const selected = visible.find((item) => item.id === selectedId) ?? visible[0] ?? null;
  const latest = items[0]?.createdAt;

  return (
    <div className="mat-page">
      <header className="mat-header">
        <div>
          <div className="mat-eyebrow"><Sparkles size={14} aria-hidden /> Documenti personalizzati</div>
          <h1>I tuoi CV su misura</h1>
          <p>Ogni posizione, il suo CV e la sua lettera. Apri un pacchetto per vedere cosa è stato preparato.</p>
        </div>
        <Link className="mat-primary mat-new" href="/discover"><Plus size={18} aria-hidden /> Trova un nuovo ruolo</Link>
      </header>

      <section className="mat-summary" aria-label="Riepilogo documenti">
        <div className="mat-summary-item"><FileText size={22} aria-hidden /><div><strong>{total.toLocaleString("it-IT")}</strong><span>pacchetti</span></div></div>
        <div className="mat-summary-item"><FileCheck2 size={22} aria-hidden /><div><strong>{items.filter((item) => item.hasPdf || item.hasDocx).length.toLocaleString("it-IT")}</strong><span>CV disponibili{total > items.length ? " nei più recenti" : ""}</span></div></div>
        <div className="mat-summary-item"><Send size={22} aria-hidden /><div><strong>{counts.sent.toLocaleString("it-IT")}</strong><span>inviati{total > items.length ? " nei più recenti" : ""}</span></div></div>
        <div className="mat-summary-item mat-summary-update"><Clock3 size={22} aria-hidden /><div><strong>{latest ? date(latest) : "—"}</strong><span>ultimo pacchetto creato</span></div></div>
      </section>

      {items.length === 0 ? (
        <div className="mat-empty"><div className="mat-empty-icon"><FileText size={27} aria-hidden /></div><h2>Il primo CV su misura parte da un ruolo</h2><p>Quando prepariamo una candidatura, qui trovi i documenti creati per quella posizione.</p><Link className="mat-primary" href="/discover">Esplora le offerte <ChevronRight size={16} aria-hidden /></Link></div>
      ) : (
        <>
          <div className="mat-toolbar">
            <label className="mat-search"><Search size={18} aria-hidden /><span className="sr-only">Cerca per ruolo o azienda</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cerca ruolo o azienda" /></label>
            <label className="mat-select"><span className="sr-only">Lingua</span><select value={lang} onChange={(event) => setLang(event.target.value)}><option value="all">Tutte le lingue</option><option value="it">Italiano</option><option value="en">English</option></select></label>
            <label className="mat-select"><span className="sr-only">Ordine</span><select value={sort} onChange={(event) => setSort(event.target.value as Sort)}><option value="newest">Più recenti</option><option value="oldest">Meno recenti</option><option value="match">Match più alto</option></select><ArrowDown size={14} aria-hidden /></label>
          </div>

          <nav className="mat-filters" aria-label="Filtra i pacchetti">
            {([
              ["all", "Tutti"], ["review", "Da rivedere"], ["ready", "Pronti"], ["sent", "Inviati"],
            ] as const).map(([key, label]) => <button key={key} type="button" className={filter === key ? "is-active" : ""} onClick={() => setFilter(key)} aria-pressed={filter === key}>{label}<span>{counts[key]}</span></button>)}
          </nav>

          <div className="mat-workspace">
            <section className="mat-list" aria-label="Pacchetti per posizione">
              <div className="mat-list-heading"><span>{visible.length} {visible.length === 1 ? "pacchetto" : "pacchetti"}{total > items.length ? ` · ultimi ${items.length}` : ""}</span><span>Seleziona per aprire</span></div>
              <div className="mat-list-scroll">
                {visible.length === 0 ? <div className="mat-no-results">Nessun pacchetto corrisponde ai filtri. <button type="button" onClick={() => { setQuery(""); setFilter("all"); setLang("all"); }}>Mostra tutti</button></div> : visible.map((item) => {
                  const itemStatus = status(item);
                  return <button type="button" key={item.id} className={`mat-list-row ${selected?.id === item.id ? "is-selected" : ""}`} onClick={() => { setSelectedId(item.id); setTab("cv"); }} aria-current={selected?.id === item.id ? "true" : undefined}>
                    <CompanyLogo company={item.company} color={companyColor(item.company)} size={42} rounded={10} url={item.jobUrl} />
                    <span className="mat-list-copy"><strong>{item.title}</strong><span>{item.company}</span><small>{date(item.createdAt)} <span aria-hidden>·</span> {language(item.language)}</small></span>
                    <span className="mat-list-end"><Match value={item.match} /><span className={`mat-status mat-${itemStatus.tone}`}>{itemStatus.text}</span></span>
                  </button>;
                })}
              </div>
            </section>

            <section className="mat-detail" aria-label="Dettaglio pacchetto">
              {selected ? <>
                <div className="mat-detail-head">
                  <div className="mat-detail-title"><CompanyLogo company={selected.company} color={companyColor(selected.company)} size={54} rounded={12} url={selected.jobUrl} /><div><div className="mat-detail-kicker">Pacchetto per posizione</div><h2>{selected.title}</h2><p>{selected.company}{selected.location ? <><span aria-hidden> · </span><MapPin size={13} aria-hidden />{selected.location}</> : null}</p></div></div>
                  <div className="mat-detail-actions"><Match value={selected.match} large /><Link href={`/applications?id=${selected.id}`} className="mat-primary">Apri candidatura <ChevronRight size={17} aria-hidden /></Link></div>
                </div>

                <div className="mat-journey" aria-label="Stato del pacchetto">
                  {[
                    { label: "Creato", done: true, icon: FileText },
                    { label: "Documenti pronti", done: selected.hasPdf || selected.hasDocx || selected.hasLetter, icon: Check },
                    { label: "Inviato", done: sent(selected), icon: Send },
                    { label: "Risposta", done: Boolean(selected.lastReplyAt && humanReplyKinds.has(selected.lastReplyKind ?? "")), icon: Mail },
                  ].map((step) => <div key={step.label} className={`mat-step ${step.done ? "is-done" : ""}`}><span><step.icon size={15} aria-hidden /></span><small>{step.label}</small></div>)}
                </div>

                <div className="mat-detail-tabs" role="tablist" aria-label="Documenti del pacchetto">
                  {([
                    ["cv", "CV su misura"], ["letter", "Lettera"], ["job", "Annuncio"],
                  ] as const).map(([key, label]) => <button key={key} type="button" role="tab" id={`mat-tab-${key}`} aria-selected={tab === key} aria-controls={`mat-panel-${key}`} className={tab === key ? "is-active" : ""} onClick={() => setTab(key)}>{label}</button>)}
                </div>

                <div className="mat-detail-main">
                  <div className="mat-preview" role="tabpanel" id={`mat-panel-${tab}`} aria-labelledby={`mat-tab-${tab}`}>
                    {tab === "cv" ? selected.hasPdf ? <iframe key={selected.id} title={`CV su misura per ${selected.title}`} src={`/api/applications/${selected.id}/document?kind=pdf&disposition=inline`} /> : <div className="mat-preview-fallback"><FileText size={32} aria-hidden /><h3>{selected.hasDocx ? "CV pronto in formato DOCX" : "CV in preparazione"}</h3><p>{selected.hasDocx ? "Scarica il documento Word dal pannello accanto. L’anteprima nel browser è disponibile per i CV in PDF." : "Il CV comparirà qui non appena sarà disponibile."}</p></div> : null}
                    {tab === "letter" ? selected.letterText ? <article className="mat-letter-paper"><span>Lettera per {selected.company}</span><h3>{selected.title}</h3><div>{selected.letterText}</div></article> : <div className="mat-preview-fallback"><Mail size={32} aria-hidden /><h3>{selected.hasLetter ? "Lettera pronta da scaricare" : "Lettera non disponibile"}</h3><p>{selected.hasLetter ? "Puoi scaricarla in formato DOCX dal pannello accanto." : "Questa candidatura non ha ancora una lettera associata."}</p></div> : null}
                    {tab === "job" ? <div className="mat-job-paper"><BriefcaseBusiness size={30} aria-hidden /><span>Annuncio originale</span><h3>{selected.title}</h3><p>{selected.company}{selected.location ? ` · ${selected.location}` : ""}</p><a href={selected.jobUrl} target="_blank" rel="noopener noreferrer">Apri annuncio <ArrowUpRight size={16} aria-hidden /></a></div> : null}
                  </div>
                  <aside className="mat-document-aside" aria-label="File disponibili">
                    <div className="mat-aside-label">Nel pacchetto</div>
                    <h3>Documenti pronti</h3>
                    <p>Scarica solo i formati effettivamente disponibili per questa posizione.</p>
                    <div className="mat-document-list">
                      {selected.hasPdf && <DownloadLink id={selected.id} kind="pdf" label="CV in PDF" />}
                      {selected.hasDocx && <DownloadLink id={selected.id} kind="cv" label="CV in DOCX" />}
                      {selected.hasLetter && <DownloadLink id={selected.id} kind="cover" label="Lettera in DOCX" />}
                      {!selected.hasPdf && !selected.hasDocx && !selected.hasLetter && <span className="mat-muted">Nessun file disponibile.</span>}
                    </div>
                    <div className="mat-aside-divider" />
                    <div className={`mat-aside-state mat-${status(selected).tone}`}><span><CircleAlert size={16} aria-hidden /> Stato</span><strong>{status(selected).text}</strong></div>
                    {selected.match != null && <div className="mat-aside-fact"><span>Compatibilità rilevata</span><strong>{selected.match}%</strong></div>}
                    <div className="mat-aside-fact"><span>Creato il</span><strong>{date(selected.createdAt)}</strong></div>
                    {review(selected) && <Link className="mat-aside-next" href={`/applications?id=${selected.id}`}>Controlla questa candidatura <ChevronRight size={15} aria-hidden /></Link>}
                  </aside>
                </div>
              </> : <div className="mat-detail-empty">Seleziona un pacchetto per aprire CV, lettera e stato della candidatura.</div>}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
