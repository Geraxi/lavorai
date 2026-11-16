"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { HeldApplicationReleaseReport } from "@/lib/held-application-release";

export function PrivacyConsentForm({ recorded, locale = "it" }: { recorded: boolean; locale?: string }) {
  const en = locale === "en";
  const router = useRouter();
  const [checked, setChecked] = useState(false);
  const [saved, setSaved] = useState(recorded);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [release, setRelease] = useState<HeldApplicationReleaseReport | null>(null);
  const inFlight = useRef(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!checked || inFlight.current || saved) return;
    inFlight.current = true; setBusy(true); setError(false);
    try {
      const response = await fetch("/api/account/privacy-consent", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ privacyConsent: true }) });
      if (!response.ok) throw new Error();
      const result = await response.json();
      if (result?.ok !== true) throw new Error();
      // Older deployments may only return {ok:true}. Record consent without
      // inventing a recovery result when the optional report is unavailable.
      const report = result.release;
      if (report && (report.status === "checked" || report.status === "incomplete") &&
        Number.isSafeInteger(report.requeuedCount) && report.requeuedCount >= 0) setRelease(report);
      setSaved(true); router.refresh();
    } catch { setError(true); }
    finally { inFlight.current = false; setBusy(false); }
  }
  return <form onSubmit={submit} className="flex flex-col gap-3 pm-form-text">
    <p>{en ? "Application processing requires your privacy consent. Saving it does not grant consent for a specific application, guarantee automatic restart, or confirm delivery. All delivery checks remain in place."
      : "Per elaborare le candidature serve il tuo consenso privacy. Salvarlo non autorizza una specifica candidatura, non garantisce la ripresa automatica e non conferma un invio. Restano validi tutti i controlli di invio."}</p>
    <a href="/privacy" className="pm-link">{en ? "Read the privacy notice" : "Leggi l’informativa privacy"}</a>
    {saved ? <p role="status" className="pm-status-ok"><span className="pm-dot tone-green" aria-hidden /> {en ? "Privacy consent recorded." : "Consenso privacy registrato."}</p> : <>
      <label className="flex items-start gap-3"><input type="checkbox" checked={checked} onChange={event => setChecked(event.target.checked)} disabled={busy} />
        <span>{en ? "I have read the privacy notice and consent to the processing of my personal data for the LavorAI service." : "Ho letto l’informativa privacy e acconsento al trattamento dei miei dati personali per il servizio LavorAI."}</span></label>
      <button className="ds-btn self-start" type="submit" disabled={!checked || busy}>{busy ? (en ? "Saving…" : "Salvataggio…") : (en ? "Save privacy consent" : "Salva consenso privacy")}</button>
    </>}
    {saved && <div className="flex flex-col gap-2" role="status">
      {release && release.requeuedCount > 0 && <p>{en
        ? `${release.requeuedCount} application(s) returned to the queue by this save. This is not a delivery confirmation.`
        : `${release.requeuedCount} candidature rimesse in coda con questo salvataggio. Non è una conferma di invio.`}</p>}
      {release?.status === "incomplete" ? <p>{en
        ? "Your consent is saved, but the recovery check could not be completed. Review your applications for any remaining action."
        : "Il consenso è salvato, ma il controllo della ripresa non è stato completato. Controlla le azioni ancora necessarie per le candidature."}</p>
        : release?.requeuedCount === 0 ? <p>{en
          ? "No applications were returned to the queue by this save. Review each application for any remaining action."
          : "Questo salvataggio non ha rimesso candidature in coda. Controlla le azioni ancora necessarie per ciascuna candidatura."}</p>
          : <p>{en ? "Review each application for any remaining action." : "Controlla le azioni ancora necessarie per ciascuna candidatura."}</p>}
      <a href="/applications" className="pm-link">{en ? "Review applications" : "Controlla le candidature"}</a>
    </div>}
    {error && <p role="alert">{en ? "We could not confirm that consent was saved. Refresh the page to check before trying again." : "Non è stato possibile confermare il salvataggio del consenso. Aggiorna la pagina per verificarlo prima di riprovare."}</p>}
  </form>;
}
