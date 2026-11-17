"use client";
import { useState } from "react";
import { X } from "lucide-react";

export const TRIAL_EXTENSION_DISMISS_COOKIE = "lavorai_trial_ext_dismissed";

export type TrialExtensionBannerProps = {
  locale: string;
  endsLabel: string;
  needsCv: boolean;
  needsAutoApply: boolean;
  needsConsent: boolean;
};

/** Pure copy, shared with tests. Same truthful wording as the email. */
export function trialExtensionBannerCopy(p: TrialExtensionBannerProps) {
  const en = p.locale === "en";
  const checklist = [
    p.needsCv ? (en ? "Upload your CV so applications can be tailored to you." : "Carica il CV, così le candidature vengono adattate a te.") : null,
    p.needsAutoApply ? (en ? "Turn on automatic applications and choose the roles you want." : "Attiva la candidatura automatica e scegli i ruoli che ti interessano.") : null,
    p.needsConsent ? (en ? "Confirm the privacy consent: without it no application can be sent." : "Conferma il consenso privacy: senza, nessuna candidatura può partire.") : null,
  ].filter((x): x is string => !!x);
  return {
    eyebrow: en ? "Gift for you" : "Un regalo per te",
    title: en ? "You have another free week" : "Hai un’altra settimana gratis",
    lead: en
      ? `Activate it now and LavorAI runs again for 7 days, until ${p.endsLabel}, and can send applications for you (up to 5 a day).`
      : `Attivala ora e LavorAI riparte per 7 giorni, fino a ${p.endsLabel}, e può inviare candidature per te (fino a 5 al giorno).`,
    card: en
      ? "As with every LavorAI trial, a card is required: you add it through Stripe on the next page. Nothing is charged during the 7 days. When the week ends, the plan you chose renews automatically and is charged (Pro is €19.99/month) unless you cancel before then."
      : "Come per ogni prova LavorAI, serve una carta: la aggiungi tramite Stripe nella pagina successiva. Nei 7 giorni non ti addebitiamo nulla. Alla fine della settimana il piano scelto si rinnova automaticamente con addebito (Pro costa €19,99/mese), salvo disdetta prima della scadenza.",
    checklistTitle: en ? "Also worth doing:" : "Ti conviene anche:",
    checklist,
    cta: en ? "Activate the free week" : "Attiva la settimana gratuita",
    busy: en ? "Activating…" : "Attivazione…",
    dismiss: en ? "Not now" : "Non ora",
    error: en ? "Could not activate the week. Try again in a moment." : "Non è stato possibile attivare la settimana. Riprova tra poco.",
  };
}

export function TrialExtensionBanner(props: TrialExtensionBannerProps) {
  const copy = trialExtensionBannerCopy(props);
  const [hidden, setHidden] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (hidden) return null;
  function dismiss() {
    // Hidden for 3 days; the offer stays available (and the email still arrives).
    document.cookie = `${TRIAL_EXTENSION_DISMISS_COOKIE}=1; path=/; max-age=${3 * 86400}; samesite=lax`;
    setHidden(true);
  }
  async function activate() {
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/trial-extension/claim", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error();
      window.location.assign(data.redirect || "/start-membership");
    } catch { setError(copy.error); setBusy(false); }
  }
  return (
    <section aria-label={copy.title} className="relative border-b border-emerald-400/30 bg-emerald-400/10 px-8 py-6 sm:px-10">
      <button type="button" onClick={dismiss} aria-label={copy.dismiss} className="absolute right-4 top-4 rounded-md p-1 text-muted-foreground hover:text-foreground">
        <X size={18} />
      </button>
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-400">{copy.eyebrow}</p>
      <h2 className="mt-2 pr-8 text-2xl font-bold tracking-tight">{copy.title}</h2>
      <p className="mt-2 text-sm leading-6 text-foreground">{copy.lead}</p>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{copy.card}</p>
      {copy.checklist.length > 0 && (
        <div className="mt-3">
          <p className="text-sm font-medium text-foreground">{copy.checklistTitle}</p>
          <ul className="mt-1 space-y-1 text-sm leading-6 text-muted-foreground">
            {copy.checklist.map((item) => <li key={item}>• {item}</li>)}
          </ul>
        </div>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="button" className="ds-btn ds-btn-primary" disabled={busy} onClick={activate}>{busy ? copy.busy : copy.cta}</button>
        <button type="button" className="text-sm text-muted-foreground underline" onClick={dismiss}>{copy.dismiss}</button>
      </div>
      {error && <p role="alert" className="mt-2 text-sm text-red-500">{error}</p>}
    </section>
  );
}
