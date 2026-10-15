"use client";
import { captureFunnel } from "@/lib/posthog/client";
import { useEffect, useRef } from "react";
import type { OptimizedCVData } from "@/types/cv";

export type PositionPreview = { previewId: string; cv: OptimizedCVData; coverLetter: string; jobTitle: string; company: string | null };
export function ApplicationPreview({ preview, onConfirm, onCancel, busy, confirmLabel }: {
  preview: PositionPreview; onConfirm: () => void; onCancel: () => void; busy: boolean; confirmLabel?: string;
}) {
  const cv = preview.cv;
  const dialog = useRef<HTMLDivElement>(null);
  useEffect(() => {
    captureFunnel("application_preview_viewed");
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog.current?.querySelector<HTMLButtonElement>("button")?.focus();
    return () => { previous?.focus(); };
  }, [preview.previewId]);

  return <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="position-preview-title" className="fixed inset-0 z-[70] overflow-y-auto bg-black/80 p-5" onKeyDown={e => {
    if (e.key === "Escape" && !busy) onCancel();
    if (e.key === "Tab") {
      const buttons = dialog.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)");
      if (!buttons?.length) { e.preventDefault(); return; }
      const first = buttons[0], last = buttons[buttons.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }}>
    <div className="mx-auto max-w-3xl rounded-xl border border-border bg-background p-6">
      <h2 id="position-preview-title" className="text-xl font-semibold">CV e lettera su misura per questa posizione</h2>
      <p className="mt-2 font-medium">{preview.jobTitle} · {preview.company}</p>
      <p className="my-3 text-sm text-muted-foreground">Controlla i documenti prima di inviare. Verranno usati questi contenuti; l’anteprima non consuma candidature Free.</p>
      <article data-ph-mask className="ph-no-capture space-y-3 rounded border border-border p-4">
        <h3 className="font-semibold">CV · {cv.fullName}</h3>
        <p>{[cv.email, cv.phone, cv.location, cv.linkedinUrl].filter(Boolean).join(" · ")}</p>
        <p className="whitespace-pre-wrap">{cv.summary}</p>
        {cv.experiences.map((x, i) => <section key={i}><h4 className="font-medium">{x.role} · {x.company}</h4><p>{x.location} · {x.startDate} – {x.endDate}</p><ul className="list-disc pl-5">{x.bullets.map((b, j) => <li key={j}>{b}</li>)}</ul></section>)}
        {cv.education.map((x, i) => <section key={i}><h4>{x.degree} · {x.institution}</h4><p>{x.location} · {x.startDate} – {x.endDate}</p><p>{x.notes}</p></section>)}
        <p>{[...cv.skills.technical, ...cv.skills.soft, ...cv.skills.tools].join(" · ")}</p>
        <p>{cv.languages.map(x => `${x.language}: ${x.level}`).join(" · ")}</p>
      </article>
      <section data-ph-mask className="ph-no-capture my-4 rounded border border-border p-4"><h3 className="font-semibold">Lettera di presentazione</h3><p className="mt-2 whitespace-pre-wrap">{preview.coverLetter}</p></section>
      <div className="flex gap-3"><button autoFocus type="button" className="ds-btn ds-btn-accent" disabled={busy} onClick={onConfirm}>{busy ? "Invio…" : confirmLabel ?? "Confermo i documenti e invio"}</button><button type="button" className="ds-btn ds-btn-ghost" disabled={busy} onClick={onCancel}>Annulla</button></div>
    </div>
  </div>;
}
