"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { useApplicationList } from "@/components/use-application-list";
import { toast } from "sonner";
import { useLocale, useTranslations } from "next-intl";
import { AppTopbar } from "@/components/design/topbar";
import { companyColor } from "@/components/design/company-logo";
import { DetailDrawer } from "@/components/design/detail-drawer";
import { AutoApplyToggle } from "@/components/auto-apply-toggle";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ApplicationBoard } from "@/components/application-board";
import type { PipelineLane } from "@/lib/application-pipeline";
import type { ApplicationListMeta } from "@/lib/application-pagination";
import { ApplicationPager } from "@/components/application-pager";
import "@/components/application-pagination.css";
import { applicationLabel, deliveryCopy } from "@/lib/application-presentation";
import type { DeliveryView } from "@/lib/application-delivery-view";
import { STAGE_LABEL, STAGE_ROW_LABEL, type JourneyStage } from "@/lib/ui-application-status";
import { Briefcase, CalendarCheck, Check, ChevronRight, CircleAlert, Download, ListTodo, Plus, Search, SearchX, Send } from "lucide-react";
import { KpiCard } from "@/components/ui-premium/kpi-card";
import { Pill } from "@/components/ui-premium/pill";
import { Avatar } from "@/components/ui-premium/avatar";
import { EmptyState } from "@/components/ui-premium/empty-state";
import { STAGE_ORDER, STAGE_TONE } from "@/components/ui-premium/tone";
import "./applications.css";
import { MailboxDeliveryBadge, type MailboxBadgeData } from "@/components/mailbox-delivery-badge";
import "@/components/mailbox.css";

interface ApiApplication {
  id: string;
  status: string;
  portal: string;
  atsScore: number | null;
  suggestions: string[];
  createdAt: string;
  errorMessage: string | null;
  coverLetterText: string | null;
  hasCvDocx: boolean;
  hasCoverLetterDocx: boolean;
  hasCvPdf: boolean;
  cvLanguage: string | null;
  userStatus: string | null;
  viewedAt: string | null;
  submittedVia: string | null;
  submittedAt: string | null;
  lastReplyAt: string | null;
  replyCount: number;
  lastReplyKind: string | null;
  submitConfirmation: string | null;
  delivery: DeliveryView;
  stage: JourneyStage | null;
  deliveryRecipient: string | null;
  mailbox?: MailboxBadgeData | null;
  job: {
    id: string;
    title: string;
    company: string | null;
    location: string | null;
    url: string;
    source: string;
  };
}

const fetcher = async (u: string) => { const response = await fetch(u); if (!response.ok) throw new Error("Unable to load applications"); return response.json(); };

interface Row {
  id: string;
  company: string;
  color: string;
  role: string;
  location: string;
  mode: string;
  salary: string;
  applied: string;
  status: "inviata" | "vista" | "colloquio" | "offerta" | "rifiutata";
  match: number | null;
  userStatus?: string | null;
  source: string;
  stage: number;
  jobUrl?: string;
  coverLetterText?: string | null;
  hasCvDocx?: boolean;
  hasCoverLetterDocx?: boolean;
  hasCvPdf?: boolean;
  cvLanguage?: string | null;
  backendStatus?: string; // raw status from API ("awaiting_consent" etc.)
  viewedAt?: string | null;
  submittedVia?: string | null;
  submittedAt?: string | null;
  lastReplyAt?: string | null;
  replyCount?: number;
  lastReplyKind?: string | null;
  ghostingDays?: number;
  delivery?: DeliveryView;
  deliveryRecipient?: string | null;
  mailbox?: MailboxBadgeData | null;
  journey?: JourneyStage | null;
}

type Range = "today" | "week" | "month" | "all";
type StageFilter = JourneyStage | "action" | "all";
type ApplicationListResponse = ApplicationListMeta & {
  applications: ApiApplication[];
  summary: ApplicationListMeta["summary"] & { actionNeeded: number; total: number; stages: Record<JourneyStage, number> };
};
const firstPages = { attention: 1, recorded: 1, conversation: 1, outcome: 1 };


export default function ApplicationsPage() {
  const t = useTranslations("applicationsPage");
  const en = useLocale() === "en";
  const tr = (it: string, english: string) => en ? english : it;
  const [view, setView] = useState<"board" | "table">("table");
  const [stage, setStage] = useState<StageFilter>("all");
  const [search, setSearch] = useState("");
  const [lane, setLane] = useState("all");
  const [range, setRange] = useState<Range>("all");
  const [query, setQuery] = useState("");
  const [pages, setPages] = useState(firstPages);
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);
  const tableRef = useRef<HTMLDivElement>(null);
  const [deepId, setDeepId] = useState<string | null>(null);
  const resetPages = () => { setPages(firstPages); setPage(1); };
  useEffect(() => {
    if (search.trim() === query) return;
    const timer = setTimeout(() => { setQuery(search.trim()); setPages(firstPages); setPage(1); }, 250);
    return () => clearTimeout(timer);
  }, [search, query]);
  useEffect(() => { setDeepId(new URLSearchParams(window.location.search).get("id")); }, []);
  const filters = new URLSearchParams({ range, includeAll: "1", search: query, lane, stage });
  const listParams = new URLSearchParams(filters);
  listParams.set("view", view);
  listParams.set("page", String(page));
  for (const [key, value] of Object.entries(pages)) listParams.set(`${key}Page`, String(value));
  const { data, error, isLoading, busy, mutate } = useApplicationList<ApplicationListResponse>(
    `/api/applications?${listParams}`, 15000,
  );

  useEffect(() => { if (tableRef.current) tableRef.current.scrollTop = 0; }, [data?.pagination.page, query, range, lane, stage]);
  const { data: deepData } = useSWR<{ applications: ApiApplication[] }>(deepId ? `/api/applications?id=${encodeURIComponent(deepId)}` : null, fetcher);
  const [selected, setSelected] = useState<Row | null>(null);
  const closeDetails = useCallback(() => setSelected(null), []);

  const toRow = (a: ApiApplication): Row => {
    const ghostingDays =
      ["confirmed", "delivered"].includes(a.delivery?.phase) && a.submittedAt && !a.lastReplyAt
        ? Math.floor((Date.now() - new Date(a.submittedAt).getTime()) / (1000 * 60 * 60 * 24))
        : undefined;
    return {
      id: a.id,
      company: a.job.company ?? "—",
      color: companyColor(a.job.company ?? a.job.title),
      role: a.job.title,
      location: a.job.location ?? "—",
      mode: "—",
      salary: "—",
      applied: relativeTime(new Date(a.createdAt), en),
      // Only a user-declared outcome overrides the backend state. Pixel opens are not recruiter views.
      status:
        (a.userStatus as Row["status"]) ??
        backendToStatus(a.status),
      match: a.atsScore,
      userStatus: a.userStatus,
      source: a.job.source === "mock" ? "Demo" : cap(a.job.source),
      stage: a.userStatus === "offerta" ? 4 : a.userStatus === "colloquio" ? 3 : a.userStatus === "vista" ? 1 : 0,
      jobUrl: a.job.url,
      coverLetterText: a.coverLetterText,
      hasCvDocx: a.hasCvDocx,
      hasCoverLetterDocx: a.hasCoverLetterDocx,
      hasCvPdf: a.hasCvPdf,
      cvLanguage: a.cvLanguage,
      backendStatus: a.status,
      viewedAt: a.viewedAt,
      submittedVia: a.submittedVia,
      submittedAt: a.submittedAt,
      lastReplyAt: a.lastReplyAt,
      replyCount: a.replyCount,
      lastReplyKind: a.lastReplyKind,
      ghostingDays,
      delivery: deliveryCopy(a.delivery, en ? "en" : "it"),
      deliveryRecipient: a.deliveryRecipient,
      mailbox: a.mailbox ?? null,
      journey: a.stage,
    };
  };
  const realRows: Row[] = data?.applications.filter(a => a.status !== "diagnostic").map(toRow) ?? [];

  // Resolve deep links independently of the current page, always owner-scoped by the API.
  useEffect(() => {
    if (deepData?.applications[0]) { setSelected(toRow(deepData.applications[0])); setDeepId(null); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deepData]);
  const filtered = realRows;
  const awaitingCount = data?.awaitingCount ?? 0;

  async function exportMatching() {
    setExporting(true);
    try {
      const params = new URLSearchParams(filters);
      params.set("view", "export");
      const rows: Row[] = [];
      let cursor: string | null = null;
      do {
        if (cursor) params.set("cursor", cursor);
        const result: { applications: ApiApplication[]; nextCursor: string | null } = await fetcher(`/api/applications?${params}`);
        rows.push(...result.applications.map(toRow));
        cursor = result.nextCursor;
      } while (cursor);
      exportCsv(rows, en);
    } catch { toast.error(t("genericError")); }
    finally { setExporting(false); }
  }

  const [consentConfirmOpen, setConsentConfirmOpen] = useState(false);

  function askConsentAll() {
    if (awaitingCount === 0) return;
    setConsentConfirmOpen(true);
  }

  async function consentAll() {
    setConsentConfirmOpen(false);
    if (awaitingCount === 0) return;
    try {
      const res = await fetch("/api/applications/consent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body?.message ?? t("genericError"),body?.error==="session_inactive"&&typeof body.redirect==="string"&&body.redirect.startsWith("/preferences?")?{action:{label:tr("Apri Round","Open rounds"),onClick:()=>window.location.assign(body.redirect)}}:undefined);
        return;
      }
      toast.success(tr(`${body.enqueued} candidature accodate`, `${body.enqueued} applications queued`));
      void mutate();
    } catch {
      toast.error(t("networkError"));
    }
  }

  async function consentOne(id: string) {
    try {
      const res = await fetch("/api/applications/consent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [id] }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(body?.message ?? t("genericError"),body?.error==="session_inactive"&&typeof body.redirect==="string"&&body.redirect.startsWith("/preferences?")?{action:{label:tr("Apri Round","Open rounds"),onClick:()=>window.location.assign(body.redirect)}}:undefined);
        return;
      }
      const result=await res.json().catch(()=>({}));
      if(result.enqueued>0)toast.success(t("appQueued"));
      else toast.info(tr("Nessun nuovo invio accodato. Controlla lo stato della candidatura.","No new submission queued. Check the application status."));
      void mutate();
    } catch {
      toast.error(t("networkError"));
    }
  }

  const lang = en ? "en" : "it";
  const summary = data?.summary;
  const loadingCounts = (isLoading && !data) || !!error;
  const num = (value: number | undefined) => (loadingCounts || value === undefined ? 0 : value);
  const filtersActive = !!query || stage !== "all" || range !== "all" || lane !== "all";
  const stageChips: { key: StageFilter; label: string; count: number; tone?: (typeof STAGE_TONE)[JourneyStage] }[] = summary
    ? [
        { key: "all", label: tr("Tutte", "All"), count: summary.total },
        { key: "action", label: tr("Da fare", "To do"), count: summary.actionNeeded, tone: summary.actionNeeded > 0 ? "amber" : undefined },
        ...STAGE_ORDER.filter((s) => (summary.stages?.[s] ?? 0) > 0 || s === stage).map((s) => ({ key: s, label: STAGE_LABEL[s][lang], count: summary.stages?.[s] ?? 0, tone: STAGE_TONE[s] })),
      ]
    : [];
  const resetFilters = () => { setSearch(""); setQuery(""); setStage("all"); setRange("all"); setLane("all"); resetPages(); };

  return (
    <>
      <AppTopbar title={t("title")} breadcrumb={t("breadcrumb")} />
      <div className="pm-page apps-page">
        <header className="pm-page-head">
          <div>
            <h1>{t("title")}</h1>
            <p>
              {data ? `${data.summary.total} ${data.summary.total === 1 ? tr("candidatura", "application") : tr("candidature", "applications")}` : "—"}
              {" · "}
              {rangeLabel(range, t)}
            </p>
          </div>
          <div className="pm-page-actions">
            <div className="pm-seg" role="group" aria-label={tr("Periodo", "Period")}>
              {(
                [
                  ["today", t("today")],
                  ["week", t("week")],
                  ["month", t("month")],
                  ["all", t("all")],
                ] as const
              ).map(([k, label]) => (
                <button key={k} type="button" aria-pressed={range === k} onClick={() => { setRange(k); resetPages(); }}>
                  {label}
                </button>
              ))}
            </div>
            <AutoApplyToggle locale={lang} />
            <a href="/applications/invio" className="pm-btn-ghost">
              <Send size={14} strokeWidth={1.75} aria-hidden /> {tr("Approva invii", "Approve sends")}
            </a>
            <a href="/applications/new" className="pm-btn-ghost">
              <Plus size={14} strokeWidth={1.75} aria-hidden /> {tr("Importa", "Import")}
            </a>
            <button className="pm-btn-ghost" type="button" disabled={!data?.total || exporting} onClick={exportMatching}>
              <Download size={14} strokeWidth={1.75} aria-hidden /> {exporting ? tr("Esportazione…", "Exporting…") : t("exportCsv")}
            </button>
          </div>
        </header>

        {awaitingCount > 0 && (
          <div role="status" className="pm-notice tone-amber apps-consent">
            <span className="pm-chip-icon"><Check size={14} strokeWidth={1.75} aria-hidden /></span>
            <div className="pm-notice-text">
              <strong>
                {awaitingCount === 1
                  ? tr("1 candidatura attende la tua approvazione", "1 application awaits your approval")
                  : tr(`${awaitingCount} candidature attendono la tua approvazione`, `${awaitingCount} applications await your approval`)}
              </strong>
              <span>{tr("Modalità con conferma: partono solo dopo il tuo ok.", "Confirm mode: nothing is sent until you approve.")}</span>
            </div>
            <button type="button" className="pm-btn-ghost" onClick={() => { setStage("awaiting_approval"); resetPages(); }}>
              {tr("Rivedi", "Review")}
            </button>
            <button type="button" className="pm-btn-primary" onClick={askConsentAll}>
              <Check size={14} strokeWidth={2} aria-hidden /> {t("allowAll")}
            </button>
          </div>
        )}

        <section className="apps-kpis" aria-label={tr("Riepilogo", "Summary")}>
          <KpiCard id="total" label={tr("Candidature", "Applications")} value={num(summary?.total)} hint={tr("registrate, ogni stato", "recorded, any stage")} icon={Briefcase} locale={lang} />
          <KpiCard id="confirmed" label={tr("Invii confermati", "Confirmed sends")} value={num(summary?.confirmed)} hint={tr("con prova di consegna", "with delivery evidence")} icon={Send} locale={lang} />
          <KpiCard id="sent_unverified" label={tr("Invii registrati, senza conferma", "Recorded sends, unconfirmed")} value={num(summary?.stages?.sent_unverified)} hint={tr("inviate, senza ricevuta verificabile", "sent, without a verifiable receipt")} icon={CircleAlert} locale={lang} />
          <KpiCard id="action" label={tr("Da fare", "To do")} value={num(summary?.actionNeeded)} hint={tr("da approvare o completare", "to approve or complete")} icon={ListTodo} locale={lang} />
          <KpiCard id="interviews" label={tr("Colloqui", "Interviews")} value={num(summary?.interviews)} hint={tr("inviti ricevuti", "invites received")} icon={CalendarCheck} locale={lang} />
        </section>

        <section className="pm-card apps-card" aria-label={tr("Elenco candidature", "Application list")}>
          <div className="apps-toolbar">
            <div className="apps-chips" role="group" aria-label={tr("Filtra per stato", "Filter by stage")}>
              {stageChips.map((chip) => (
                <button
                  key={chip.key}
                  type="button"
                  className="apps-chip"
                  aria-pressed={stage === chip.key}
                  onClick={() => { setStage(chip.key); resetPages(); }}
                >
                  {chip.tone && <span className={`pm-dot tone-${chip.tone}`} aria-hidden />}
                  {chip.label}
                  <b>{chip.count}</b>
                </button>
              ))}
            </div>
            <div className="apps-tools">
              <label className="apps-search">
                <Search size={14} strokeWidth={1.75} aria-hidden />
                <input aria-label={tr("Filtra candidature", "Filter applications")} placeholder={tr("Cerca azienda, ruolo o città…", "Search company, role or city…")} value={search} onChange={(event) => setSearch(event.target.value)} />
              </label>
              <div className="pm-seg" role="group" aria-label={tr("Vista", "View")}>
                <button type="button" aria-pressed={view === "table"} onClick={() => setView("table")}>{tr("Elenco", "List")}</button>
                <button type="button" aria-pressed={view === "board"} onClick={() => setView("board")}>Kanban</button>
              </div>
            </div>
          </div>

          {isLoading && !data && <p role="status" className="pm-muted pm-pad">{tr("Caricamento candidature…", "Loading applications…")}</p>}
          {error && (
            <div role="alert" className="pm-pad apps-error">
              {tr("Impossibile caricare le candidature.", "Unable to load applications.")}{" "}
              <button className="pm-btn-ghost" onClick={() => mutate()}>{tr("Riprova", "Retry")}</button>
            </div>
          )}
          {data && !error && data.total === 0 && (
            filtersActive ? (
              <EmptyState icon={SearchX} title={tr("Nessun risultato", "No results")} text={tr("Nessuna candidatura corrisponde a questi filtri.", "No application matches these filters.")} />
            ) : (
              <EmptyState icon={Briefcase} title={tr("Nessuna candidatura ancora", "No applications yet")} text={tr("Quando prepariamo o invii una candidatura, compare qui con il suo stato e la prova di invio.", "When we prepare or you send an application, it shows up here with its stage and evidence.")} cta={{ href: "/discover", label: tr("Esplora offerte", "Browse jobs") }} />
            )
          )}
          {data && !error && data.total === 0 && filtersActive && (
            <div className="apps-reset"><button type="button" className="pm-btn-ghost" onClick={resetFilters}>{tr("Azzera filtri", "Clear filters")}</button></div>
          )}

          {data && !error && view === "board" && data.total > 0 && (
            <div className="pm-pad apps-board">
              <ApplicationBoard applications={filtered} onOpen={setSelected} pages={data.lanes} busy={busy} onPage={(key: PipelineLane, next: number) => setPages((current) => ({ ...current, [key]: next }))} />
            </div>
          )}

          {data && !error && view === "table" && data.total > 0 && (
            <>
              <div className="apps-table" ref={tableRef} aria-busy={busy} role="table" aria-label={tr("Candidature", "Applications")}>
                <div className="apps-row apps-row-head" role="row">
                  <span role="columnheader">{t("colCompanyRole")}</span>
                  <span role="columnheader">{t("colStatus")}</span>
                  <span role="columnheader">{tr("Risposta", "Reply")}</span>
                  <span role="columnheader">{tr("Registrata", "Recorded")}</span>
                  <span role="columnheader" className="apps-col-cv">CV</span>
                  <span role="columnheader" aria-label={tr("Azioni", "Actions")} />
                </div>
                {filtered.map((a) => {
                  const reply = replyLabel(a, en);
                  return (
                    <div
                      key={a.id}
                      role="row"
                      tabIndex={0}
                      className="apps-row"
                      onKeyDown={(event) => { if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); setSelected(a); } }}
                      onClick={() => setSelected(a)}
                    >
                      <span role="cell" className="apps-cell-main">
                        <Avatar name={a.company} />
                        <span className="pm-row-text">
                          <strong>{a.company}</strong>
                          <small>{a.role}{a.location && a.location !== "—" ? ` · ${a.location}` : ""}</small>
                        </span>
                      </span>
                      <span role="cell" className="apps-cell-stage">
                        {a.mailbox ? <MailboxDeliveryBadge data={a.mailbox} lang={lang} /> : a.journey ? <Pill tone={STAGE_TONE[a.journey]} title={a.delivery?.detail}>{STAGE_ROW_LABEL[a.journey][lang]}</Pill> : <span className="pm-muted">—</span>}
                        {!a.mailbox && a.delivery && a.journey && a.delivery.label.toLowerCase() !== STAGE_ROW_LABEL[a.journey][lang].toLowerCase() && a.journey !== "awaiting_approval" && <small className="apps-evidence">{a.delivery.label}</small>}
                      </span>
                      <span role="cell" className={`apps-cell-reply${reply ? "" : " is-empty"}`}>{reply ?? "—"}</span>
                      <span role="cell" className="pm-time">{a.applied}</span>
                      <span role="cell" className="apps-col-cv" onClick={(e) => e.stopPropagation()}>
                        {a.hasCvPdf || a.hasCvDocx ? (
                          <a
                            href={`/api/applications/${a.id}/document?kind=${a.hasCvPdf ? "pdf" : "cv"}`}
                            download
                            title={tr(`Scarica il CV ${a.hasCvPdf ? "PDF" : "DOCX"} per ${a.role}`, `Download the ${a.hasCvPdf ? "PDF" : "DOCX"} CV for ${a.role}`)}
                            className="apps-doc"
                          >
                            <Download size={12} strokeWidth={1.75} aria-hidden /> {a.hasCvPdf ? "PDF" : "DOCX"}
                          </a>
                        ) : (
                          <span className="pm-muted" title={tr("CV non ancora generato", "CV not generated yet")}>—</span>
                        )}
                      </span>
                      <span role="cell" className="apps-cell-go" onClick={(e) => e.stopPropagation()}>
                        {a.backendStatus === "awaiting_consent" ? (
                          <button type="button" className="pm-btn-primary apps-approve" onClick={() => consentOne(a.id)}>
                            {tr("Approva", "Approve")}
                          </button>
                        ) : a.backendStatus === "needs_answers" ? (
                          <a href="/questions" className="pm-btn-ghost apps-approve">{tr("Rispondi", "Answer")}</a>
                        ) : (
                          <button type="button" className="apps-open" aria-label={tr(`Apri ${a.company}`, `Open ${a.company}`)} onClick={() => setSelected(a)}>
                            <ChevronRight size={15} strokeWidth={1.75} aria-hidden />
                          </button>
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
              <div className="apps-pager">
                <ApplicationPager pagination={data.pagination} label={tr("Candidature", "Applications")} busy={busy} onPage={setPage} />
              </div>
            </>
          )}
        </section>
        <p className="pm-muted apps-foot">
          {tr("Contiamo come inviate con prova solo le candidature con ricevuta ATS verificata o email consegnata. Un errore tecnico non è un rifiuto dell’azienda.", "Only applications with a verified ATS receipt or a delivered email count as sent with evidence. A technical failure is not a rejection by the company.")}
        </p>
      </div>

      <DetailDrawer locale={en ? "en" : "it"} app={selected} onClose={closeDetails} />
      <ConfirmDialog
        open={consentConfirmOpen}
        title={t("consentConfirmTitle", { count: awaitingCount })}
        message={t("consentConfirmMessage")}
        confirmLabel={t("yesSendAll")}
        cancelLabel={t("cancel")}
        variant="accent"
        onConfirm={consentAll}
        onCancel={() => setConsentConfirmOpen(false)}
      />
    </>
  );
}

function exportCsv(rows: Row[], en: boolean): void {
  if (rows.length === 0) return;
  const header = en ? ["Company", "Role", "Location", "Work mode", "Status", "Match", "Recorded"] : ["Azienda", "Ruolo", "Luogo", "Modalità", "Stato", "Match", "Registrata"];
  const body = rows.map((r) => [
    r.company,
    r.role,
    r.location,
    r.mode,
    r.delivery?.label ?? applicationLabel(r.status, en ? "en" : "it"),
    r.match == null ? "" : String(r.match),
    r.applied,
  ]);
  const escape = (v: string) =>
    /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  const csv = [header, ...body]
    .map((row) => row.map(escape).join(","))
    .join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const today = new Date().toISOString().slice(0, 10);
  a.download = `lavorai-candidature-${today}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Recruiter reply or user-declared outcome, in words (no colour). */
function replyLabel(a: Row, en: boolean): string | null {
  if (a.userStatus === "offerta") return en ? "Offer (marked by you)" : "Offerta (segnata da te)";
  if (a.userStatus === "rifiutata") return en ? "Rejected (marked by you)" : "Rifiutata (segnata da te)";
  if (a.userStatus === "colloquio") return en ? "Interview (marked by you)" : "Colloquio (segnato da te)";
  if (a.lastReplyKind === "colloquio") return en ? "Interview invite" : "Invito a colloquio";
  if (a.lastReplyKind === "rifiutata") return en ? "Rejection" : "Rifiuto del recruiter";
  if (a.lastReplyKind === "risposta") return en ? "Recruiter reply" : "Risposta del recruiter";
  if (a.lastReplyKind === "ricevuta") return en ? "Application receipt" : "Ricevuta di candidatura";
  if (a.lastReplyKind === "redirected_to_portal") return en ? "Apply on the portal (not a rejection)" : "Candidati sul portale (non è un rifiuto)";
  if (a.lastReplyKind === "auto_reply") return en ? "Automatic reply (not a rejection)" : "Risposta automatica (non è un rifiuto)";
  return null;
}

function backendToStatus(b: string): Row["status"] {
  if (b === "success") return "inviata";
  // Technical failures never imply a recruiter rejection.
  return "inviata";
}
function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function relativeTime(d: Date, en = false): string {
  const diffMin = Math.floor((Date.now() - d.getTime()) / 60_000);
  if (diffMin < 60) return `${diffMin} min ${en ? "ago" : "fa"}`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return en ? `${diffH}h ago` : `${diffH} ${diffH === 1 ? "ora" : "ore"} fa`;
  const diffD = Math.floor(diffH / 24);
  if (diffD === 1) return en ? "Yesterday" : "Ieri";
  return en ? `${diffD} days ago` : `${diffD} giorni fa`;
}


function rangeLabel(
  r: "today" | "week" | "month" | "all",
  t: (key: string) => string,
): string {
  if (r === "today") return t("rangeToday");
  if (r === "week") return t("rangeWeek");
  if (r === "month") return t("rangeMonth");
  return t("rangeAll");
}
