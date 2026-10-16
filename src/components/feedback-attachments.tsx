"use client";
import { useEffect, useRef, useState } from "react";
import { Paperclip, FileText, X } from "lucide-react";
import { ATTACHMENT_ACCEPT, IMAGE_ATTACHMENT_ACCEPT, MAX_ATTACHMENTS, MAX_ATTACHMENT_BYTES, reportCopy, reportError, type ReportItem } from "@/lib/feedback";

export function AttachmentPicker({ files, onChange, onError, locale, pdfEnabled = false }: { pdfEnabled?: boolean; files: File[]; onChange: (files: File[]) => void; onError: (error: string) => void; locale: string }) {
  const c = reportCopy(locale), input = useRef<HTMLInputElement>(null);
  const [previews, setPreviews] = useState<string[]>([]);
  useEffect(() => {
    const urls = files.map(f => ["image/png", "image/jpeg", "image/webp"].includes(f.type) ? URL.createObjectURL(f) : "");
    setPreviews(urls);
    return () => urls.forEach(url => { if (url) URL.revokeObjectURL(url); });
  }, [files]);
  function choose(selected: File[]) {
    if (!pdfEnabled && selected.some(f => /\.pdf$/i.test(f.name) || f.type === "application/pdf")) return onError("pdf_disabled");
    const combined = [...files, ...selected];
    if (combined.length > MAX_ATTACHMENTS) return onError("attachment_limit");
    if (combined.reduce((sum, f) => sum + f.size, 0) > MAX_ATTACHMENT_BYTES) return onError("attachment_too_large");
    if (selected.some(f => !f.size || !/\.(png|jpe?g|webp|pdf)$/i.test(f.name))) return onError("invalid_attachment");
    onError(""); onChange(combined);
  }
  return <div className="report-attachment-picker">
    <button className="report-attach-button" type="button" onClick={() => input.current?.click()} aria-describedby="report-file-hint"><Paperclip size={16} aria-hidden />{c.attach}</button>
    <input ref={input} type="file" multiple accept={pdfEnabled ? ATTACHMENT_ACCEPT : IMAGE_ATTACHMENT_ACCEPT} hidden tabIndex={-1} aria-label={c.attach} onChange={e => { choose(Array.from(e.target.files ?? [])); e.target.value = ""; }} />
    <p id="report-file-hint" className="report-muted">{pdfEnabled ? c.attachmentHint : c.imageAttachmentHint}</p>
    {!!files.length && <ul className="report-file-list">{files.map((file, i) => <li key={`${i}-${file.name}`}>
      {previews[i] ? <img src={previews[i]} alt="" className="report-file-preview" /> : <FileText size={24} aria-hidden />}
      <span>{file.name}<small>{Math.ceil(file.size / 1024)} KB</small></span>
      <button type="button" onClick={() => onChange(files.filter((_, n) => n !== i))} aria-label={`${c.remove}: ${file.name}`}><X size={17} aria-hidden /></button>
    </li>)}</ul>}
  </div>;
}

export function ReportAttachments({ report, locale, admin = false, onChanged }: { report: ReportItem; locale: string; admin?: boolean; onChanged?: () => void }) {
  const c = reportCopy(locale);
  const [busy, setBusy] = useState<string | null>(null), [error, setError] = useState("");
  async function act(id: string, method: "GET" | "POST" | "DELETE", filename: string) {
    if (busy) return; setBusy(id); setError("");
    try {
      const response = await fetch(`/api/feedback/${encodeURIComponent(report.id)}/attachments/${encodeURIComponent(id)}`, { method, cache: "no-store" });
      if (!response.ok) { const body = await response.json(); setError(body.error ?? "unavailable"); if (body.error === "attachment_rejected") onChanged?.(); return; }
      if (method === "GET") {
        const url = URL.createObjectURL(await response.blob());
        const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      } else onChanged?.();
    } catch { setError("unavailable"); } finally { setBusy(null); }
  }
  if (!report.attachments?.length) return null;
  return <section className="report-saved-files" aria-label={c.attachments}><h3>{c.attachments}</h3>
    <ul className="report-file-list">{report.attachments.map(file => <li key={file.id}>
      <FileText size={20} aria-hidden /><span>{file.filename}<small>{Math.ceil(file.byteLength / 1024)} KB · {file.scanStatus === "quarantined" ? c.quarantined : file.scanStatus === "clean" ? c.clean : c.sanitized}</small></span>
      <div className="report-file-actions">
        {file.scanStatus === "quarantined" ? admin && <button type="button" disabled={!!busy} onClick={() => void act(file.id, "POST", file.filename)}>{busy === file.id ? c.scanning : c.scan}</button> : <button type="button" disabled={!!busy} onClick={() => void act(file.id, "GET", file.filename)} aria-label={`${c.download}: ${file.filename}`}>{c.download}</button>}
        <button type="button" disabled={!!busy} onClick={() => void act(file.id, "DELETE", file.filename)} aria-label={`${c.remove}: ${file.filename}`}>{c.remove}</button>
      </div>
    </li>)}</ul>
    {error && <p className="report-notice" role="alert">{reportError(error, locale)}</p>}
  </section>;
}

export function sendReportWithFiles(input: unknown, files: File[], onProgress: (percent: number) => void): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve, reject) => {
    const data = new FormData(); data.append("report", JSON.stringify(input)); files.forEach(file => data.append("files", file));
    const xhr = new XMLHttpRequest(); xhr.open("POST", "/api/feedback"); xhr.timeout = 60_000;
    xhr.upload.onprogress = event => { if (event.lengthComputable) onProgress(Math.min(100, Math.round(event.loaded / event.total * 100))); };
    xhr.onerror = xhr.ontimeout = xhr.onabort = () => reject(new Error("unavailable"));
    xhr.onload = () => { try { const body = JSON.parse(xhr.responseText); resolve({ ok: xhr.status >= 200 && xhr.status < 300, error: body.error }); } catch { reject(new Error("unavailable")); } };
    xhr.send(data);
  });
}
