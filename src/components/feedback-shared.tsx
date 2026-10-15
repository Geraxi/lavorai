"use client";
import { reportCopy, reportError, type ReportItem } from "@/lib/feedback";

export async function fetchReports(url: string) {
  const response = await fetch(url, { cache: "no-store" });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? "unavailable");
  return body;
}
export type ReportList = { reports: ReportItem[]; page: number; hasMore: boolean };
export function ReportMeta({ report, locale }: { report: ReportItem; locale: string }) {
  const c = reportCopy(locale);
  return <div className="report-meta"><span className="report-badge">{report.category === "bug" ? c.bug : c.feedback}</span><span className={`report-badge report-status-${report.status}`}>{c.statuses[report.status]}</span><time dateTime={report.createdAt}>{new Date(report.createdAt).toLocaleDateString(locale === "en" ? "en-GB" : "it-IT", { timeZone: "UTC" })}</time></div>;
}
export function ReportBody({ report, locale }: { report: ReportItem; locale: string }) {
  const c = reportCopy(locale);
  return <><p className="report-description">{report.description}</p>{report.pageContext && <p className="report-muted">{c.context}: {c.pages[report.pageContext]}</p>}</>;
}
export function ReportPagination({ page, hasMore, disabled, onPage, locale }: { page: number; hasMore: boolean; disabled: boolean; onPage: (page: number) => void; locale: string }) {
  const c = reportCopy(locale);
  return <nav className="report-pagination" aria-label={c.history}><button type="button" disabled={page <= 1 || disabled} onClick={() => onPage(page - 1)}>{c.previous}</button><span>{c.page} {page}</span><button type="button" disabled={!hasMore || disabled} onClick={() => onPage(page + 1)}>{c.next}</button></nav>;
}
export function ReportLoadError({ error, locale, retry }: { error: Error; locale: string; retry: () => void }) {
  return <div className="report-notice" role="alert"><p>{reportError(error.message, locale)}</p><button type="button" onClick={retry}>{reportCopy(locale).retry}</button></div>;
}
