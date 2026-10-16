"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { useApplicationList } from "@/components/use-application-list";
import { toast } from "sonner";
import { useLocale, useTranslations } from "next-intl";
import { AppTopbar } from "@/components/design/topbar";
import { Icon } from "@/components/design/icon";
import { CompanyLogo, companyColor } from "@/components/design/company-logo";
import { StatusChip } from "@/components/design/status-chip";
import { DetailDrawer } from "@/components/design/detail-drawer";
import { AutoApplyToggle } from "@/components/auto-apply-toggle";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ReplyKindChip } from "@/components/reply-kind-chip";
import { ApplicationBoard } from "@/components/application-board";
import type { PipelineLane } from "@/lib/application-pipeline";
import type { ApplicationListMeta } from "@/lib/application-pagination";
import { ApplicationPager } from "@/components/application-pager";
import "@/components/application-pagination.css";
import { applicationLabel, deliveryCopy } from "@/lib/application-presentation";
import type { DeliveryView } from "@/lib/application-delivery-view";

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
  deliveryRecipient: string | null;
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
}

type Range = "today" | "week" | "month" | "all";
type ApplicationListResponse = ApplicationListMeta & { applications: ApiApplication[] };
const firstPages = { attention: 1, recorded: 1, conversation: 1, outcome: 1 };


export default function ApplicationsPage() {
  const t = useTranslations("applicationsPage");
  const en = useLocale() === "en";
  const tr = (it: string, english: string) => en ? english : it;
  const [view, setView] = useState<"board" | "table">("board");
  const [search, setSearch] = useState("");
  const [lane, setLane] = useState("all");
  const [range, setRange] = useState<Range>("all");
  const [query, setQuery] = useState("");
  const [pages, setPages] = useState(firstPages);
  const [page, setPage] = useState(1);
  const [attentionPage, setAttentionPage] = useState(1);
  const [attentionOpen, setAttentionOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const tableRef = useRef<HTMLDivElement>(null);
  const pendingRef = useRef<HTMLDivElement>(null);
  const [deepId, setDeepId] = useState<string | null>(null);
  const resetPages = () => { setPages(firstPages); setPage(1); setAttentionPage(1); };
  useEffect(() => {
    if (search.trim() === query) return;
    const timer = setTimeout(() => { setQuery(search.trim()); setPages(firstPages); setPage(1); setAttentionPage(1); }, 250);
    return () => clearTimeout(timer);
  }, [search, query]);
  useEffect(() => { setDeepId(new URLSearchParams(window.location.search).get("id")); }, []);
  const filters = new URLSearchParams({ range, includeAll: "1", search: query, lane });
  const listParams = new URLSearchParams(filters);
  listParams.set("view", view);
  listParams.set("page", String(page));
  for (const [key, value] of Object.entries(pages)) listParams.set(`${key}Page`, String(value));
  const { data, error, isLoading, busy, mutate } = useApplicationList<ApplicationListResponse>(
    `/api/applications?${listParams}`, 15000,
  );
  const pendingParams = new URLSearchParams(filters);
  pendingParams.set("view", "attention"); pendingParams.set("page", String(attentionPage));
  const { data: pendingData, error: pendingError, isLoading: pendingLoading, busy: pendingBusy, mutate: mutatePending } = useApplicationList<ApplicationListResponse>(
    attentionOpen ? `/api/applications?${pendingParams}` : null,
  );
  useEffect(() => { if (tableRef.current) tableRef.current.scrollTop = 0; }, [data?.pagination.page, query, range, lane]);
  useEffect(() => { if (pendingRef.current) pendingRef.current.scrollTop = 0; }, [pendingData?.pagination.page, query, range, lane]);
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
  const pendingApplications = pendingData?.applications ?? [];

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
        toast.error(body?.message ?? t("genericError"));
        return;
      }
      toast.success(tr(`${body.enqueued} candidature accodate`, `${body.enqueued} applications queued`));
      void mutate(); void mutatePending();
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
        toast.error(t("genericError"));
        return;
      }
      toast.success(t("appQueued"));
      void mutate(); void mutatePending();
    } catch {
      toast.error(t("networkError"));
    }
  }

  return (
    <>
      <AppTopbar title={t("title")} breadcrumb={t("breadcrumb")} />
      <div className="workspace-page workspace-applications">
        <div className="workspace-heading">
          <div>
            <h1
              style={{ fontSize: 26, fontWeight: 600, letterSpacing: "-0.022em", margin: 0 }}
            >
              {t("title")}
            </h1>
            <p style={{ fontSize: 15, color: "var(--fg-muted)", marginTop: 6 }}>
              {data?.total ?? "—"} {tr("candidature", "applications")}
              {" · "}
              {rangeLabel(range, t)}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div
              className="ds-toggle-group"
              style={{ display: "inline-flex", fontSize: 12.5 }}
            >
              {(
                [
                  ["today", t("today")],
                  ["week", t("week")],
                  ["month", t("month")],
                  ["all", t("all")],
                ] as const
              ).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => { setRange(k); resetPages(); }}
                  className={range === k ? "active" : undefined}
                  style={{ padding: "6px 10px" }}
                >
                  {label}
                </button>
              ))}
            </div>
            <AutoApplyToggle locale={en ? "en" : "it"} />
            <a
              href="/applications/new"
              className="ds-btn"
              style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
            >
              <Icon name="plus" size={12} /> {tr("Importa candidatura", "Import application")}
            </a>
            <button
              className="ds-btn"
              type="button"
              disabled={!data?.total || exporting}
              onClick={exportMatching}
            >
              <Icon name="download" size={13} /> {exporting ? tr("Esportazione…", "Exporting…") : t("exportCsv")}
            </button>
          </div>
        </div>

        {awaitingCount > 0 && (
          <div
            className="applications-consent-banner flex items-center justify-between gap-3 flex-wrap"
            style={{
              padding: "12px 16px",
              background: "var(--primary-weak)",
              border: "1px solid var(--primary-ds)",
              borderRadius: 8,
            }}
          >
            <div style={{ fontSize: 13, color: "var(--fg)" }}>
              {t.rich("awaitingConsent", {
                count: awaitingCount,
                strong: (chunks) => <strong>{chunks}</strong>,
              })}
              {" · "}
              <span style={{ color: "var(--fg-muted)" }}>
                {t("hybridMode")}
              </span>
            </div>
            <button
              type="button"
              className="ds-btn ds-btn-accent"
              onClick={askConsentAll}
            >
              <Icon name="check" size={13} /> {t("allowAll")}
            </button>
          </div>
        )}

        <div className="workspace-metrics">
          <div className="workspace-metric"><strong>{isLoading || error ? "—" : data?.summary.confirmed ?? 0}</strong><small>{tr("Invii confermati", "Confirmed submissions")}</small></div>
          <div className="workspace-metric"><strong>{isLoading || error ? "—" : data?.summary.attention ?? 0}</strong><small>{tr("Da completare / verificare", "Needs attention")}</small></div>
          <div className="workspace-metric"><strong>{isLoading || error ? "—" : data?.summary.interviews ?? 0}</strong><small>{tr("Colloqui dichiarati", "Reported interviews")}</small></div>
          <div className="workspace-metric"><strong>{isLoading || error ? "—" : data?.summary.offers ?? 0}</strong><small>{tr("Offerte dichiarate", "Reported offers")}</small></div>
        </div>
        <div className="workspace-toolbar">
          <input aria-label={tr("Filtra candidature", "Filter applications")} placeholder={tr("Cerca azienda, ruolo o località…", "Search company, role or location…")} value={search} onChange={event => setSearch(event.target.value)} />
          <select aria-label={tr("Fase candidatura", "Application stage")} value={lane} onChange={event => { setLane(event.target.value); resetPages(); }}>
            <option value="all">{tr("Tutte le fasi", "All stages")}</option>
            <option value="attention">{tr("Da verificare", "Needs attention")}</option><option value="recorded">{tr("Invio registrato", "Submission recorded")}</option>
            <option value="conversation">{tr("Risposte e colloqui", "Replies & interviews")}</option><option value="outcome">{tr("Esiti dichiarati", "Reported outcomes")}</option>
          </select>
          <div className="ds-toggle-group">
            <button type="button" aria-pressed={view === "board"} className={view === "board" ? "active" : undefined} onClick={() => setView("board")}>Kanban</button>
            <button type="button" aria-pressed={view === "table"} className={view === "table" ? "active" : undefined} onClick={() => setView("table")}>{tr("Tabella", "Table")}</button>
          </div>
        </div>
        {isLoading && !data && <p role="status" className="workspace-empty">{tr("Caricamento candidature…", "Loading applications…")}</p>}
        {error && <div role="alert" className="workspace-empty">{tr("Impossibile caricare le candidature.", "Unable to load applications.")} <button className="ds-btn" onClick={() => mutate()}>{tr("Riprova", "Retry")}</button></div>}
        {data && !isLoading && !error && data.total === 0 && <p className="workspace-empty">{query || lane !== "all" || range !== "all" ? tr("Nessun risultato per questi filtri.", "No results for these filters.") : tr("Non hai ancora candidature registrate. Esplora le opportunità o importa una candidatura esistente.", "No applications recorded yet. Explore opportunities or import an existing application.")}</p>}
        {data && !error && view === "board" && <ApplicationBoard applications={filtered} onOpen={setSelected} pages={data.lanes} busy={busy} onPage={(key: PipelineLane, next: number) => setPages(current => ({ ...current, [key]: next }))} />}
        {data && !error && view === "table" && <><div className="ds-section-card applications-table" ref={tableRef} aria-busy={busy}>
          <table className="ds-tbl">
            <thead>
              <tr>
                <th style={{ width: "30%" }}>{t("colCompanyRole")}</th>
                <th>{t("colLocation")}</th>
                <th>{t("colSalary")}</th>
                <th>{t("colMatch")}</th>
                <th>{t("colStatus")}</th>
                <th>{tr("Registrata", "Recorded")}</th>
                <th style={{ width: 60, textAlign: "center" }} title={tr("CV ottimizzato per questa posizione", "Tailored CV for this role")}>CV</th>
                <th style={{ width: 40 }}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((a) => (
                <tr key={a.id} tabIndex={0} onKeyDown={event => { if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); setSelected(a); } }} onClick={() => setSelected(a)}>
                  <td>
                    <div className="flex items-center gap-2.5">
                      <CompanyLogo company={a.company} color={a.color} />
                      <div>
                        <div style={{ fontWeight: 500 }}>{a.company}</div>
                        <div style={{ fontSize: 12, color: "var(--fg-muted)" }}>
                          {a.role}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td style={{ color: "var(--fg-muted)" }}>
                    {a.location} · {a.mode}
                  </td>
                  <td className="mono" style={{ fontSize: 12 }}>{a.salary}</td>
                  <td>
                    <div className="flex items-center gap-2">
                      <div
                        style={{
                          width: 46,
                          height: 4,
                          background: "var(--bg-sunken)",
                          borderRadius: 3,
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            width: `${a.match ?? 0}%`,
                            height: "100%",
                            background:
                              (a.match ?? 0) >= 85
                                ? "var(--primary-ds)"
                                : (a.match ?? 0) >= 75
                                  ? "var(--amber)"
                                  : "var(--fg-subtle)",
                          }}
                        />
                      </div>
                      <span className="mono" style={{ fontSize: 11 }}>
                        {a.match ?? "—"}
                      </span>
                    </div>
                  </td>
                  <td>
                    {a.backendStatus === "awaiting_consent" ? (
                      <span
                        className="ds-chip"
                        style={{
                          background: "var(--primary-weak)",
                          color: "var(--primary-ds)",
                          fontWeight: 500,
                        }}
                      >
                        {tr("attesa consenso", "awaiting consent")}
                      </span>
                    ) : (
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        {a.delivery ? <span className="ds-chip" title={a.delivery.detail}
                          style={{ color: a.delivery.tone === "warning" ? "var(--amber)" : undefined }}>
                          {a.delivery.label}
                        </span> : <StatusChip status={a.status} locale={en ? "en" : "it"} />}
                        {["colloquio", "offerta", "rifiutata"].includes(a.status) && <StatusChip status={a.status} locale={en ? "en" : "it"} />}
                        <ReplyKindChip locale={en ? "en" : "it"} lastReplyKind={a.lastReplyKind} replyCount={a.replyCount} />
                        {a.ghostingDays !== undefined && a.ghostingDays >= 7 && !a.lastReplyAt && (
                          <span
                            className="ds-chip"
                            title={tr(`Nessuna risposta dopo ${a.ghostingDays} giorni. Normale per molti ATS — considera di inviare un follow-up.`, `No reply after ${a.ghostingDays} days. Common with many ATS portals — consider a follow-up.`)}
                            style={{
                              background: "var(--bg-sunken)",
                              color: "var(--fg-muted)",
                              fontSize: 10.5,
                              cursor: "help",
                            }}
                          >
                            {tr(`${a.ghostingDays}g senza risposta`, `${a.ghostingDays}d without a reply`)}
                          </span>
                        )}
                        {a.submittedVia?.startsWith("portal_") &&
                          a.status === "inviata" && (
                            <span
                              title={tr("Submit diretto sul form ATS dell'azienda. Apertura email non tracciabile — riceverai conferme sul tuo Gmail.", "Submitted through the company’s ATS form. Email opens are not tracked; check your inbox for confirmations.")}
                              style={{
                                fontSize: 10,
                                color: "var(--fg-subtle)",
                                cursor: "help",
                              }}
                            >
                              ⓘ
                            </span>
                          )}
                      </span>
                    )}
                  </td>
                  <td style={{ color: "var(--fg-muted)", fontSize: 12 }}>{a.applied}</td>
                  <td onClick={(e) => e.stopPropagation()} style={{ textAlign: "center" }}>
                    {a.hasCvPdf || a.hasCvDocx ? (
                      <a
                        href={`/api/applications/${a.id}/document?kind=${a.hasCvPdf ? "pdf" : "cv"}`}
                        download
                        title={tr(`Scarica CV${a.hasCvPdf ? " PDF" : " DOCX"} ottimizzato per ${a.role}`, `Download tailored ${a.hasCvPdf ? "PDF" : "DOCX"} CV for ${a.role}`)}
                        className="ds-btn ds-btn-sm ds-btn-ghost"
                        style={{ padding: "3px 8px", fontSize: 11, display: "inline-flex", alignItems: "center", gap: 4 }}
                      >
                        <Icon name="download" size={11} /> {a.hasCvPdf ? "PDF" : "DOCX"}
                      </a>
                    ) : (
                      <span style={{ fontSize: 10.5, color: "var(--fg-subtle)" }} title={tr("CV non ancora generato", "CV not generated yet")}>—</span>
                    )}
                  </td>
                  <td onClick={(e) => e.stopPropagation()}>
                    {a.backendStatus === "awaiting_consent" ? (
                      <button
                        type="button"
                        className="ds-btn ds-btn-sm ds-btn-primary"
                        onClick={() => consentOne(a.id)}
                        style={{ fontSize: 11.5, padding: "4px 10px" }}
                      >
                        <Icon name="check" size={11} /> {tr("Consenti", "Approve")}
                      </button>
                    ) : (
                      <Icon
                        name="chevron-right"
                        size={14}
                        style={{ color: "var(--fg-subtle)" }}
                      />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div><ApplicationPager pagination={data.pagination} label={tr("Candidature", "Applications")} busy={busy} onPage={setPage} /></>}
        {(data?.summary.pending ?? 0) > 0 && <details open={attentionOpen} onToggle={event => setAttentionOpen(event.currentTarget.open)} className="ds-section-card applications-attention" aria-label={tr("Candidature da completare", "Applications needing attention")}>
          <summary>{tr("Da completare o verificare", "Complete or verify")} <span className="workspace-chip">{data?.summary.pending}</span></summary><div className="applications-attention-list" ref={pendingRef}>
          <p style={{ fontSize: 13, color: "var(--fg-muted)", marginBottom: 14 }}>{tr("Queste candidature non hanno una conferma di invio. Un errore tecnico non è un rifiuto dell'azienda.", "These applications have no submission confirmation. A technical failure is not a rejection by the company.")}</p>
          {pendingLoading && !pendingData && <p role="status">{tr("Caricamento…", "Loading…")}</p>}
          {pendingError && <p role="alert">{tr("Impossibile caricare le candidature.", "Unable to load applications.")} <button className="ds-btn" onClick={() => mutatePending()}>{tr("Riprova", "Retry")}</button></p>}
          {!pendingError && pendingApplications.map((a) => <div key={a.id} style={{ padding: "12px 0", borderTop: "1px solid var(--border-ds)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
              <strong>{a.job.title} · {a.job.company ?? tr("Azienda", "Company")}</strong>
              <span className="ds-chip">{applicationLabel(a.delivery.label, en ? "en" : "it")}</span>
            </div>
            <p style={{ fontSize: 13, color: "var(--fg-muted)", margin: "6px 0" }}>{a.errorMessage || deliveryCopy(a.delivery, en ? "en" : "it")?.detail}</p>
            <div style={{ display: "flex", gap: 12, fontSize: 13 }}>
              <button className="ds-btn ds-btn-sm" onClick={() => setSelected(toRow(a))}>{tr("Vedi dettagli", "View details")}</button>
              {a.status === "needs_answers" && <a href="/questions">{tr("Completa le risposte", "Complete answers")}</a>}
              {a.status === "awaiting_consent" && <button className="ds-btn ds-btn-sm" onClick={() => consentOne(a.id)}>{tr("Consenti invio", "Approve submission")}</button>}
            </div>
          </div>)}
          {!pendingLoading && !pendingError && pendingData?.total === 0 && <p>{tr("Nessuna candidatura da completare per questi filtri.", "No pending applications for these filters.")}</p>}
        </div>{pendingData && <ApplicationPager pagination={pendingData.pagination} label={tr("Da completare", "Pending applications")} busy={pendingBusy} onPage={setAttentionPage} />}</details>}
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
