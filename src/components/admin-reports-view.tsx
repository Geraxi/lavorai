"use client";
import { useRef, useState, type FormEvent } from "react";
import useSWR from "swr";
import { REPORT_STATUSES, reportCopy, reportError, type ReportItem, type ReportStatus } from "@/lib/feedback";
import { fetchReports, ReportBody, ReportLoadError, ReportMeta, ReportPagination, type ReportList } from "./feedback-shared";
import "./feedback.css";

export function AdminReportsView({ locale }: { locale: string }) {
  const c = reportCopy(locale);
  const [page, setPage] = useState(1);
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const detailRef = useRef<HTMLDivElement>(null);
  const list = useSWR<ReportList>(`/api/admin/reports?page=${page}&category=${category}&status=${status}`, fetchReports, { shouldRetryOnError: false });
  const detail = useSWR<{ report: ReportItem }>(selected ? `/api/admin/reports/${selected}` : null, fetchReports, { shouldRetryOnError: false });
  function select(id: string) { setSelected(id); requestAnimationFrame(() => detailRef.current?.focus()); }
  return <section className="feedback-admin">
    <header className="feedback-heading"><div className="workspace-eyebrow">Admin · {c.title}</div><h1>{c.adminTitle}</h1><p>{c.adminIntro}</p></header>
    <div className="report-filters">
      <label>{c.category}<select value={category} onChange={e => { setCategory(e.target.value); setPage(1); }}><option value="">{c.all}</option><option value="bug">{c.bug}</option><option value="feedback">{c.feedback}</option></select></label>
      <label>{c.status}<select value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}><option value="">{c.all}</option>{REPORT_STATUSES.map(value => <option key={value} value={value}>{c.statuses[value]}</option>)}</select></label>
    </div>
    <div className="feedback-admin-columns">
      <section className="report-panel report-history" aria-label={c.adminTitle}>
        <div className="report-scroll" aria-busy={list.isLoading}>
          {list.error ? <ReportLoadError error={list.error} locale={locale} retry={() => void list.mutate()} /> : list.isLoading ? <p className="report-empty" role="status">{c.loading}</p> : !list.data?.reports.length ? <p className="report-empty">{c.none}</p> : list.data.reports.map(report => <button type="button" key={report.id} className="report-entry report-select" aria-pressed={selected === report.id} onClick={() => select(report.id)}><ReportMeta report={report} locale={locale} /><h3>{report.subject}</h3><p className="report-muted">{report.user?.name ?? report.user?.email}</p></button>)}
        </div>
        <ReportPagination page={page} hasMore={list.data?.hasMore ?? false} disabled={list.isLoading} onPage={setPage} locale={locale} />
      </section>
      <div className="report-panel report-detail report-scroll" ref={detailRef} tabIndex={-1} aria-label={c.details}>
        {detail.error ? <ReportLoadError error={detail.error} locale={locale} retry={() => void detail.mutate()} /> : detail.isLoading ? <p role="status">{c.loading}</p> : detail.data && selected ? <AdminReportDetail key={selected} report={detail.data.report} locale={locale} onSaved={() => { void detail.mutate(); void list.mutate(); }} /> : <p className="report-empty">{locale === "en" ? "Select a report to read it and update its status." : "Seleziona una segnalazione per leggerla e aggiornare lo stato."}</p>}
      </div>
    </div>
  </section>;
}
function AdminReportDetail({ report, locale, onSaved }: { report: ReportItem; locale: string; onSaved: () => void }) {
  const c = reportCopy(locale);
  const [status, setStatus] = useState<ReportStatus>(report.status);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  async function save(event: FormEvent) {
    event.preventDefault(); if (busy) return;
    setBusy(true); setError(""); setSaved(false);
    try {
      const response = await fetch(`/api/admin/reports/${report.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
      const body = await response.json();
      if (!response.ok) { setError(body.error ?? "unavailable"); return; }
      setSaved(true); onSaved();
    } catch { setError("unavailable"); } finally { setBusy(false); }
  }
  return <article>
    <ReportMeta report={report} locale={locale} /><h2>{report.subject}</h2>
    <p className="report-muted">{c.reporter}: {report.user?.name} · {report.user?.email}</p>
    <p className="report-muted">{c.language}: {report.locale === "en" ? "English" : "Italiano"}</p>
    <ReportBody report={report} locale={locale} />
    <form onSubmit={save} className="report-triage"><label className="report-field">{c.status}<select value={status} disabled={busy} onChange={e => setStatus(e.target.value as ReportStatus)}>{REPORT_STATUSES.map(value => <option key={value} value={value}>{c.statuses[value]}</option>)}</select></label><button className="report-primary" type="submit" disabled={busy}>{busy ? c.saving : c.save}</button></form>
    {error && <p role="alert" className="report-notice">{reportError(error, locale)}</p>}{saved && <p role="status" className="report-notice report-success">{c.saved}</p>}
    <p className="report-muted">{c.updated}: {new Date(report.updatedAt).toLocaleString(locale === "en" ? "en-GB" : "it-IT", { timeZone: "UTC" })} UTC</p>
  </article>;
}
