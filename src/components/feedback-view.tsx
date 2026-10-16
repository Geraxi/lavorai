"use client";
import { useRef, useState, type FormEvent } from "react";
import useSWR from "swr";
import { Bug, MessageSquare, ShieldCheck, Send } from "lucide-react";
import { AppTopbar } from "@/components/design/topbar";
import { REPORT_PAGES, reportCopy, reportError, reportSchema, type ReportInput } from "@/lib/feedback";
import { fetchReports, ReportBody, ReportLoadError, ReportMeta, ReportPagination, type ReportList } from "./feedback-shared";
import { AttachmentPicker, sendReportWithFiles } from "./feedback-attachments";
import "./feedback.css";

export function FeedbackView({ locale, standalone = false }: { locale: string; standalone?: boolean }) {
  const c = reportCopy(locale);
  const [category, setCategory] = useState<ReportInput["category"]>("feedback");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [pageContext, setPageContext] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [page, setPage] = useState(1);
  const sending = useRef(false);
  const { data, error: loadError, isLoading, mutate } = useSWR<ReportList>(`/api/feedback?page=${page}`, fetchReports, { shouldRetryOnError: false });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending.current) return;
    setError(""); setSent(false);
    const parsed = reportSchema.safeParse({ category, subject, description, pageContext: pageContext || null, locale: locale === "en" ? "en" : "it" });
    if (!parsed.success) { setError("invalid_report"); return; }
    sending.current = true; setBusy(true); setProgress(0);
    try {
      if (files.length) {
        const result = await sendReportWithFiles(parsed.data, files, setProgress);
        if (!result.ok) { setError(result.error ?? "unavailable"); return; }
      } else {
        const response = await fetch("/api/feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(parsed.data) });
        const body = await response.json();
        if (!response.ok) { setError(body.error ?? "unavailable"); return; }
      }
      setFiles([]);
      setSubject(""); setDescription(""); setPageContext(""); setSent(true);
      if (page === 1) void mutate(); else setPage(1);
    } catch { setError("unavailable"); }
    finally { sending.current = false; setBusy(false); }
  }

  return <section className="feedback-root">
    {!standalone && <AppTopbar title={c.title} />}
    <div className="feedback-page">
      <header className="feedback-heading"><div className="workspace-eyebrow">LavorAI · {c.title}</div><h1>{c.heading}</h1><p>{c.intro}</p></header>
      <div className="feedback-columns">
        <form className="report-panel feedback-form" onSubmit={submit} aria-label={c.title}>
          <div className="report-scroll">
            <fieldset disabled={busy} className="report-fields">
              <legend className="sr-only">{c.title}</legend>
              <fieldset className="report-type"><legend>{c.category}</legend><div className="report-type-options">
                {(["feedback", "bug"] as const).map(value => <label key={value} className={category === value ? "selected" : ""}><input type="radio" name="category" value={value} checked={category === value} onChange={() => setCategory(value)} />{value === "bug" ? <Bug size={18} aria-hidden /> : <MessageSquare size={18} aria-hidden />}<span><strong>{c[value]}</strong><small>{value === "bug" ? c.bugHint : c.feedbackHint}</small></span></label>)}
              </div></fieldset>
              <label className="report-field" htmlFor="report-subject"><span>{c.subject} <small>{subject.length}/120</small></span><input id="report-subject" name="subject" required minLength={3} maxLength={120} value={subject} onChange={e => setSubject(e.target.value)} aria-describedby="report-subject-hint" /><small id="report-subject-hint">{c.subjectHint}</small></label>
              <label className="report-field" htmlFor="report-description"><span>{c.description} <small>{description.length}/4,000</small></span><textarea id="report-description" name="description" required minLength={10} maxLength={4000} rows={5} value={description} onChange={e => setDescription(e.target.value)} aria-describedby="report-description-hint report-privacy" /><small id="report-description-hint">{c.descriptionHint}</small></label>
              <label className="report-field" htmlFor="report-page"><span>{c.context}</span><select id="report-page" value={pageContext} onChange={e => setPageContext(e.target.value)} aria-describedby="report-context-hint"><option value="">{c.noContext}</option>{REPORT_PAGES.map(value => <option key={value} value={value}>{c.pages[value]}</option>)}</select><small id="report-context-hint">{c.contextHint}</small></label>
              <AttachmentPicker files={files} onChange={setFiles} onError={setError} locale={locale} />
            </fieldset>
            <p id="report-privacy" className="report-privacy"><ShieldCheck size={17} aria-hidden />{c.privacy}</p>
          </div>
          <footer className="report-form-footer">
            {busy && files.length > 0 && <div className="report-upload-progress" role="status"><span>{progress < 100 ? `${c.uploading} · ${progress}%` : c.processing}</span><progress max={100} value={progress} aria-label={c.uploading} /></div>}
            {error && <p role="alert" className="report-notice">{reportError(error, locale)}</p>}
            {sent && <p role="status" className="report-notice report-success">{c.success}</p>}
            <div><small>{c.visibility}</small><button className="report-primary" type="submit" disabled={busy}><Send size={15} aria-hidden />{busy ? c.sending : c.submit}</button></div>
          </footer>
        </form>
        <section className="report-panel report-history" aria-labelledby="report-history-title">
          <header><h2 id="report-history-title">{c.history}</h2><span className="report-muted">{c.statuses.new} → {c.statuses.in_review} → {c.statuses.resolved}</span></header>
          <div className="report-scroll" aria-busy={isLoading}>
            {loadError ? <ReportLoadError error={loadError} locale={locale} retry={() => void mutate()} /> : isLoading ? <p role="status" className="report-empty">{c.loading}</p> : !data?.reports.length ? <p className="report-empty">{c.empty}</p> : data.reports.map(report => <details className="report-entry" key={report.id}><summary><ReportMeta report={report} locale={locale} /><h3>{report.subject}</h3></summary><ReportBody report={report} locale={locale} onChanged={() => void mutate()} /></details>)}
          </div>
          <ReportPagination page={page} hasMore={data?.hasMore ?? false} disabled={isLoading} onPage={setPage} locale={locale} />
        </section>
      </div>
    </div>
  </section>;
}
