"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useLocale } from "next-intl";
import { AppTopbar } from "@/components/design/topbar";
import type { DeliveryView } from "@/lib/application-delivery-view";
import { materialText } from "./materiali-copy";
import {
  ArrowDown, ArrowUpRight, BriefcaseBusiness, Check, ChevronRight,
  CircleAlert, Clock3, Download, FileCheck2, FileText, Mail,
  MapPin, Plus, Search, Send,
} from "lucide-react";
import { CompanyLogo, companyColor } from "@/components/design/company-logo";
import { CvChanges } from "./cv-changes";

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
  delivery?: DeliveryView;
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
type Tab = "cv" | "changes" | "letter" | "job";
const TABS: Tab[] = ["cv", "changes", "letter", "job"];
type Sort = "newest" | "oldest" | "match";

const humanReplyKinds = new Set(["risposta", "colloquio", "rifiutata"]);
export const materialSent = (item: MaterialItem) => ["confirmed", "delivered"].includes(item.delivery?.phase ?? "");
const sent = materialSent;
const review = (item: MaterialItem) => ["failed", "needs_answers", "awaiting_consent"].includes(item.status) || ["accepted", "unconfirmed", "failed", "manual"].includes(item.delivery?.phase ?? "") || (item.status === "success" && !sent(item));
const ready = (item: MaterialItem) => !sent(item) && !review(item) && (item.hasPdf || item.hasDocx);
const date = (value: string, locale = "it") => new Date(value).toLocaleDateString(locale === "en" ? "en-GB" : "it-IT", { day: "numeric", month: "short", year: "numeric" });
const language = (value: string | null) => value?.toLowerCase() === "en" ? "EN" : value?.toLowerCase() === "it" ? "IT" : "—";

function status(item: MaterialItem): { text: string; tone: "mint" | "amber" | "blue" } {
  if (sent(item)) return { text: "Invio confermato", tone: "mint" };
  if (item.delivery && ["accepted", "unconfirmed", "failed", "manual"].includes(item.delivery.phase)) return { text: item.delivery.label, tone: "amber" };
  if (item.status === "awaiting_consent") return { text: "Da confermare", tone: "amber" };
  if (item.status === "needs_answers") return { text: "Risposte richieste", tone: "amber" };
  if (review(item)) return { text: "Da rivedere", tone: "amber" };
  return { text: ready(item) ? "Pronto" : "In preparazione", tone: "blue" };
}

function Match({ value, large = false }: { value: number | null; large?: boolean }) {
  const tr = (text: string) => materialText(locale, text);
  const locale = useLocale();
  if (value == null) return <span className="mat-match-empty">{tr("Match non calcolato")}</span>;
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

function CvPreview({ item }: { item: MaterialItem }) {
  const locale = useLocale();
  const tr = (text: string) => materialText(locale, text);
  const [preview, setPreview] = useState<{ pdfUrl?: string; text?: string; error?: boolean }>({});

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | undefined;
    async function load() {
      setPreview({});
      if (item.hasPdf) {
        try {
          const response = await fetch(`/api/applications/${item.id}/document?kind=pdf&disposition=inline`, { cache: "no-store" });
          if (!response.ok || !response.headers.get("content-type")?.includes("application/pdf")) throw new Error("PDF unavailable");
          const blob = await response.blob();
          const signature = new TextDecoder().decode(await blob.slice(0, 5).arrayBuffer());
          if (signature !== "%PDF-") throw new Error("Invalid PDF");
          if (cancelled) return;
          objectUrl = URL.createObjectURL(blob);
          setPreview({ pdfUrl: objectUrl }); return;
        } catch { /* Try the Word document below. */ }
      }
      if (item.hasDocx) {
        try {
          const response = await fetch(`/api/applications/${item.id}/cv-preview`, { cache: "no-store" });
          if (!response.ok) throw new Error("CV unavailable");
          const data: { text?: string } = await response.json();
          if (!data.text) throw new Error("Empty CV");
          if (!cancelled) { setPreview({ text: data.text }); return; }
        } catch { /* Display a useful error below. */ }
      }
      if (!cancelled) setPreview({ error: true });
    }
    void load();
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [item.id, item.hasPdf, item.hasDocx]);

  if (preview.pdfUrl) return <><iframe title={`${tr("CV su misura")} · ${item.title}`} src={preview.pdfUrl} /><a className="mat-preview-open" href={preview.pdfUrl} target="_blank" rel="noopener noreferrer">{tr("Apri il CV in una nuova scheda")} <ArrowUpRight size={14} aria-hidden /></a></>;
  if (preview.text) return <article className="mat-cv-paper"><span>{tr("CV su misura")} · {item.company}</span><div>{preview.text}</div></article>;
  return <div className="mat-preview-fallback"><FileText size={32} aria-hidden /><h3>{preview.error ? tr("Anteprima non disponibile") : tr("Caricamento del CV…")}</h3><p>{preview.error ? tr("Non siamo riusciti ad aprire questo documento. Puoi scaricarlo dal pannello accanto.") : tr("Stiamo aprendo il documento per questa posizione.")}</p></div>;
}

export function MaterialiView({ items, total }: { items: MaterialItem[]; total: number }) {
  const locale = useLocale();
  const tr = (text: string) => materialText(locale, text);
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
    <>
    <AppTopbar title={tr("CV per posizione")} />
    <div className="mat-page">
      <header className="mat-header">
        <div>
          <h1>{tr("I tuoi CV su misura")}</h1>
          <p>{tr("Ogni posizione, il suo CV e la sua lettera. Apri un pacchetto per vedere cosa è stato preparato.")}</p>
        </div>
        <Link className="mat-primary mat-new" href="/discover"><Plus size={18} aria-hidden /> {tr("Trova un nuovo ruolo")}</Link>
      </header>

      <section className="mat-summary" aria-label={tr("Riepilogo documenti")}>
        <div className="mat-summary-item"><FileText size={22} aria-hidden /><div><strong>{total.toLocaleString(locale)}</strong><span>{tr("pacchetti")}</span></div></div>
        <div className="mat-summary-item"><FileCheck2 size={22} aria-hidden /><div><strong>{items.filter((item) => item.hasPdf || item.hasDocx).length.toLocaleString(locale)}</strong><span>{tr("CV disponibili")}{total > items.length ? (locale === "en" ? " in recent packages" : " nei più recenti") : ""}</span></div></div>
        <div className="mat-summary-item"><Send size={22} aria-hidden /><div><strong>{counts.sent.toLocaleString(locale)}</strong><span>{tr("inviati")}{total > items.length ? (locale === "en" ? " in recent packages" : " nei più recenti") : ""}</span></div></div>
        <div className="mat-summary-item mat-summary-update"><Clock3 size={22} aria-hidden /><div><strong>{latest ? date(latest, locale) : "—"}</strong><span>{tr("ultimo pacchetto creato")}</span></div></div>
      </section>

      {items.length === 0 ? (
        <div className="mat-empty"><div className="mat-empty-icon"><FileText size={27} aria-hidden /></div><h2>{tr("Il primo CV su misura parte da un ruolo")}</h2><p>{tr("Quando prepariamo una candidatura, qui trovi i documenti creati per quella posizione.")}</p><Link className="mat-primary" href="/discover">{tr("Esplora le offerte")} <ChevronRight size={16} aria-hidden /></Link></div>
      ) : (
        <>
          <div className="mat-controls">
          <div className="mat-toolbar">
            <label className="mat-search"><Search size={18} aria-hidden /><span className="sr-only">{tr("Cerca per ruolo o azienda")}</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={tr("Cerca ruolo o azienda")} /></label>
            <label className="mat-select"><span className="sr-only">{tr("Lingua")}</span><select value={lang} onChange={(event) => setLang(event.target.value)}><option value="all">{tr("Tutte le lingue")}</option><option value="it">Italiano</option><option value="en">English</option></select></label>
            <label className="mat-select"><span className="sr-only">{tr("Ordine")}</span><select value={sort} onChange={(event) => setSort(event.target.value as Sort)}><option value="newest">{tr("Più recenti")}</option><option value="oldest">{tr("Meno recenti")}</option><option value="match">{tr("Match più alto")}</option></select><ArrowDown size={14} aria-hidden /></label>
          </div>

          <nav className="mat-filters" aria-label={tr("Filtra i pacchetti")}>
            {([
              ["all", "Tutti"], ["review", "Da rivedere"], ["ready", "Pronti"], ["sent", "Inviati"],
            ] as const).map(([key, label]) => <button key={key} type="button" className={filter === key ? "is-active" : ""} onClick={() => setFilter(key)} aria-pressed={filter === key}>{tr(label)}<span>{counts[key]}</span></button>)}
          </nav>
          </div>

          <div className="mat-workspace">
            <section className="mat-list" aria-label={tr("Pacchetti per posizione")}>
              <div className="mat-list-heading"><span>{visible.length} {visible.length === 1 ? (locale === "en" ? "package" : "pacchetto") : tr("pacchetti")}{total > items.length ? ` · ${locale === "en" ? "latest" : "ultimi"} ${items.length}` : ""}</span><span>{tr("Seleziona per aprire")}</span></div>
              <div className="mat-list-scroll">
                {visible.length === 0 ? <div className="mat-no-results">{tr("Nessun pacchetto corrisponde ai filtri.")} <button type="button" onClick={() => { setQuery(""); setFilter("all"); setLang("all"); }}>{tr("Mostra tutti")}</button></div> : visible.map((item) => {
                  const itemStatus = status(item);
                  return <button type="button" key={item.id} className={`mat-list-row ${selected?.id === item.id ? "is-selected" : ""}`} onClick={() => { setSelectedId(item.id); setTab("cv"); }} aria-current={selected?.id === item.id ? "true" : undefined}>
                    <CompanyLogo company={item.company} color={companyColor(item.company)} size={42} rounded={10} url={item.jobUrl} />
                    <span className="mat-list-copy"><strong>{item.title}</strong><span>{item.company}</span><small>{date(item.createdAt, locale)} <span aria-hidden>·</span> {language(item.language)}</small></span>
                    <span className="mat-list-end"><Match value={item.match} /><span className={`mat-status mat-${itemStatus.tone}`}>{tr(itemStatus.text)}</span></span>
                  </button>;
                })}
              </div>
            </section>

            <section className="mat-detail" aria-label={tr("Dettaglio pacchetto")}>
              {selected ? <>
                <div className="mat-detail-head">
                  <div className="mat-detail-title"><CompanyLogo company={selected.company} color={companyColor(selected.company)} size={54} rounded={12} url={selected.jobUrl} /><div><h2>{selected.title}</h2><p>{selected.company}{selected.location ? <><span aria-hidden> · </span><MapPin size={13} aria-hidden />{selected.location}</> : null}</p></div></div>
                  <div className="mat-detail-actions"><Match value={selected.match} large /><Link href={`/applications?id=${selected.id}`} className="mat-primary">{tr("Apri candidatura")} <ChevronRight size={17} aria-hidden /></Link></div>
                </div>

                <div className="mat-journey" aria-label={tr("Stato del pacchetto")}>
                  {[
                    { label: "Creato", done: true, icon: FileText },
                    { label: "Documenti pronti", done: selected.hasPdf || selected.hasDocx || selected.hasLetter, icon: Check },
                    { label: "Inviato", done: sent(selected), icon: Send },
                    { label: "Risposta", done: Boolean(selected.lastReplyAt && humanReplyKinds.has(selected.lastReplyKind ?? "")), icon: Mail },
                  ].map((step) => <div key={step.label} className={`mat-step ${step.done ? "is-done" : ""}`}><span><step.icon size={15} aria-hidden /></span><small>{tr(step.label)}</small></div>)}
                </div>

                <div className="mat-detail-tabs" role="tablist" aria-label={tr("Documenti del pacchetto")}>
                  {([
                    ["cv", "CV su misura"], ["changes", "Modifiche"], ["letter", "Lettera"], ["job", "Annuncio"],
                  ] as const).map(([key, label]) => <button key={key} type="button" role="tab" id={`mat-tab-${key}`} aria-selected={tab === key} aria-controls={`mat-panel-${key}`} tabIndex={tab === key ? 0 : -1} onKeyDown={event => { const keys = TABS; const index = keys.indexOf(key); const next = event.key === "ArrowRight" ? keys[(index + 1) % keys.length] : event.key === "ArrowLeft" ? keys[(index + keys.length - 1) % keys.length] : event.key === "Home" ? keys[0] : event.key === "End" ? keys[keys.length - 1] : null; if (next) { event.preventDefault(); setTab(next); document.getElementById(`mat-tab-${next}`)?.focus(); } }} className={tab === key ? "is-active" : ""} onClick={() => setTab(key)}>{tr(label)}</button>)}
                </div>

                <div className="mat-detail-main">
                  <div className="mat-preview" role="tabpanel" id={`mat-panel-${tab}`} aria-labelledby={`mat-tab-${tab}`}>
                    {tab === "cv" ? <CvPreview key={selected.id} item={selected} /> : null}
                    {tab === "changes" ? <CvChanges key={selected.id} applicationId={selected.id} hasDocx={selected.hasDocx} /> : null}
                    {tab === "letter" ? selected.letterText ? <article className="mat-letter-paper"><span>{locale === "en" ? "Cover letter for" : "Lettera per"} {selected.company}</span><h3>{selected.title}</h3><div>{selected.letterText}</div></article> : <div className="mat-preview-fallback"><Mail size={32} aria-hidden /><h3>{selected.hasLetter ? tr("Lettera pronta da scaricare") : tr("Lettera non disponibile")}</h3><p>{selected.hasLetter ? tr("Puoi scaricarla in formato DOCX dal pannello accanto.") : tr("Questa candidatura non ha ancora una lettera associata.")}</p></div> : null}
                    {tab === "job" ? <div className="mat-job-paper"><BriefcaseBusiness size={30} aria-hidden /><span>{tr("Annuncio originale")}</span><h3>{selected.title}</h3><p>{selected.company}{selected.location ? ` · ${selected.location}` : ""}</p><a href={selected.jobUrl} target="_blank" rel="noopener noreferrer">{tr("Apri annuncio")} <ArrowUpRight size={16} aria-hidden /></a></div> : null}
                  </div>
                  <aside className="mat-document-aside" aria-label={tr("File disponibili")}>
                    <div className="mat-aside-label">{tr("Nel pacchetto")}</div>
                    <h3>{tr("Documenti pronti")}</h3>
                    <p>{tr("Scarica solo i formati effettivamente disponibili per questa posizione.")}</p>
                    <div className="mat-document-list">
                      {selected.hasPdf && <DownloadLink id={selected.id} kind="pdf" label={tr("CV in PDF")} />}
                      {selected.hasDocx && <DownloadLink id={selected.id} kind="cv" label={tr("CV in DOCX")} />}
                      {selected.hasLetter && <DownloadLink id={selected.id} kind="cover" label={tr("Lettera in DOCX")} />}
                      {!selected.hasPdf && !selected.hasDocx && !selected.hasLetter && <span className="mat-muted">{tr("Nessun file disponibile.")}</span>}
                    </div>
                    <div className="mat-aside-divider" />
                    <div className={`mat-aside-state mat-${status(selected).tone}`}><span><CircleAlert size={16} aria-hidden /> {tr("Stato")}</span><strong>{tr(status(selected).text)}</strong></div>
                    {selected.match != null && <div className="mat-aside-fact"><span>{tr("Compatibilità rilevata")}</span><strong>{selected.match}%</strong></div>}
                    <div className="mat-aside-fact"><span>{tr("Creato il")}</span><strong>{date(selected.createdAt, locale)}</strong></div>
                    {review(selected) && <Link className="mat-aside-next" href={`/applications?id=${selected.id}`}>{tr("Controlla questa candidatura")} <ChevronRight size={15} aria-hidden /></Link>}
                  </aside>
                </div>
              </> : <div className="mat-detail-empty">{tr("Seleziona un pacchetto per aprire CV, lettera e stato della candidatura.")}</div>}
            </section>
          </div>
        </>
      )}
    </div>
    </>
  );
}
