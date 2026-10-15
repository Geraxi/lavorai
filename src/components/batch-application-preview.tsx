"use client";
import { useEffect, useState } from "react";
import { ApplicationPreview, type PositionPreview } from "@/components/application-preview";

/** Every job needs a separate explicit approval before the batch is admitted. */
export function BatchApplicationPreview({ jobIds, onClose, onComplete, onPaywall }: {
  jobIds: string[]; onClose: () => void; onComplete: () => void; onPaywall: (message: string) => void;
}) {
  const [index, setIndex] = useState(0);
  const [preview, setPreview] = useState<PositionPreview | null>(null);
  const [approved, setApproved] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    setPreview(null);
    async function load() {
      try {
        const res = await fetch("/api/applications/preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jobId: jobIds[index] }) });
        const body = await res.json();
        if (cancelled) return;
        if (res.status === 402) { onPaywall(body.message); onClose(); return; }
        if (!res.ok) throw new Error(body.message ?? "Anteprima non disponibile.");
        setPreview(body);
      } catch (cause) { if (!cancelled) setError(cause instanceof Error ? cause.message : "Errore di rete."); }
    }
    void load();
    return () => { cancelled = true; };
    // Callbacks only notify the parent; generation depends on the current job.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, jobIds]);
  async function approve() {
    if (!preview) return;
    const next = { ...approved, [jobIds[index]]: preview.previewId };
    setApproved(next);
    if (index + 1 < jobIds.length) { setIndex(index + 1); return; }
    setBusy(true);
    try {
      const res = await fetch("/api/applications/apply-batch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jobIds, previewIds: next }) });
      const body = await res.json();
      if (res.status === 402) { onPaywall(body.message); onClose(); return; }
      if (!res.ok) throw new Error(body.message ?? "Invio non disponibile.");
      onComplete();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Errore di rete."); }
    finally { setBusy(false); }
  }
  if (error) return <div role="alert" className="fixed inset-0 z-[80] grid place-content-center bg-background p-6"><p>{error}</p><button autoFocus type="button" className="ds-btn" onClick={onClose}>Chiudi</button></div>;
  if (!preview) return <div role="status" className="fixed inset-0 z-[80] grid place-content-center bg-background p-6"><p>Preparazione CV e lettera · posizione {index + 1} di {jobIds.length}…</p><button type="button" className="ds-btn" onClick={onClose}>Annulla</button></div>;
  return <ApplicationPreview preview={preview} busy={busy} confirmLabel={index + 1 < jobIds.length ? "Approva e passa alla prossima posizione" : `Approva e invia ${jobIds.length} candidature`} onCancel={onClose} onConfirm={approve} />;
}
