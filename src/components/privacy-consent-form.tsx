"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

export function PrivacyConsentForm({ recorded, locale = "it" }: { recorded: boolean; locale?: string }) {
  const en = locale === "en";
  const router = useRouter();
  const [checked, setChecked] = useState(false);
  const [saved, setSaved] = useState(recorded);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const inFlight = useRef(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!checked || inFlight.current || saved) return;
    inFlight.current = true; setBusy(true); setError(false);
    try {
      const response = await fetch("/api/account/privacy-consent", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ privacyConsent: true }) });
      if (!response.ok) throw new Error();
      setSaved(true); router.refresh();
    } catch { setError(true); }
    finally { inFlight.current = false; setBusy(false); }
  }
  return <form onSubmit={submit} className="flex flex-col gap-3 pm-form-text">
    <p>{en ? "Application processing requires your privacy consent. Saving it does not grant consent for a specific application or confirm delivery. Previously consented queued applications remain subject to all delivery checks."
      : "Per elaborare le candidature serve il tuo consenso privacy. Salvarlo non autorizza una specifica candidatura e non conferma un invio. Le candidature già autorizzate e in coda restano soggette a tutti i controlli di invio."}</p>
    <a href="/privacy" className="pm-link">{en ? "Read the privacy notice" : "Leggi l’informativa privacy"}</a>
    {saved ? <p role="status" className="pm-status-ok"><span className="pm-dot tone-green" aria-hidden /> {en ? "Privacy consent recorded." : "Consenso privacy registrato."}</p> : <>
      <label className="flex items-start gap-3"><input type="checkbox" checked={checked} onChange={event => setChecked(event.target.checked)} disabled={busy} />
        <span>{en ? "I have read the privacy notice and consent to the processing of my personal data for the LavorAI service." : "Ho letto l’informativa privacy e acconsento al trattamento dei miei dati personali per il servizio LavorAI."}</span></label>
      <button className="ds-btn self-start" type="submit" disabled={!checked || busy}>{busy ? (en ? "Saving…" : "Salvataggio…") : (en ? "Save privacy consent" : "Salva consenso privacy")}</button>
    </>}
    {error && <p role="alert">{en ? "Consent was not saved. Try again." : "Consenso non salvato. Riprova."}</p>}
  </form>;
}
