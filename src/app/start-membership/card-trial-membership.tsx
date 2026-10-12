"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Tier = "pro" | "pro_plus";
type Enrollment = {
  checkoutKind: "trial" | "paid_reactivation";
  tier: Tier; status: string; hasSubscription: boolean; cardVerified: boolean;
  trialEndsAt: string | null; cancelAtPeriodEnd: boolean;
};

export function CardTrialMembership({ email = "", locale, available, emailVerified, confirming, canceled, previewAvailable, enrollment }: {
  email?: string; locale: "it" | "en"; available: boolean; emailVerified: boolean; confirming: boolean;
  canceled: boolean; previewAvailable: boolean; enrollment: Enrollment | null;
}) {
  const en = locale === "en";
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [verificationSent, setVerificationSent] = useState(false);
  const [attemptTier, setAttemptTier] = useState<Tier | null>(null);
  const [resume, setResume] = useState<{ tier: Tier; url: string } | null>(null);
  const reactivating = Boolean(enrollment?.hasSubscription && enrollment.status === "canceled");
  const fixedTier = resume?.tier ?? attemptTier ?? (reactivating && enrollment?.checkoutKind !== "paid_reactivation" ? null : enrollment?.tier);
  const waitingForConfirmation = confirming && (enrollment?.checkoutKind === "paid_reactivation" || reactivating || !enrollment?.cardVerified);
  const verified = Boolean(enrollment?.cardVerified && enrollment.trialEndsAt);
  const price = (tier: Tier) => tier === "pro_plus" ? (en ? "€39.99/month" : "€39,99/mese") : (en ? "€19.99/month" : "€19,99/mese");
  const plan = (tier: Tier) => tier === "pro_plus" ? "Pro+" : "Pro";
  const endDate = enrollment?.trialEndsAt ? new Intl.DateTimeFormat(en ? "en-GB" : "it-IT", {
    dateStyle: "full", timeStyle: "long", timeZone: "UTC",
  }).format(new Date(enrollment.trialEndsAt)) : null;

  // A return URL is not proof of a verified card or a successful payment.
  useEffect(() => {
    if (!waitingForConfirmation) return;
    const timer = window.setInterval(() => router.refresh(), 3000);
    return () => window.clearInterval(timer);
  }, [waitingForConfirmation, router]);

  async function resendVerification() {
    if (busy || !email) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/auth/verify-email/resend", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
      if (!response.ok) throw new Error(en ? "Please wait before trying again." : "Attendi prima di riprovare.");
      setVerificationSent(true);
    } catch (cause) { setError(cause instanceof Error ? cause.message : (en ? "Try again later." : "Riprova più tardi.")); }
    finally { setBusy(false); }
  }

  async function openPortal() {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/stripe/portal", { method: "POST" });
      const data = await response.json();
      if (!response.ok || !data.url) throw new Error(en ? "Billing could not be opened. Try again or contact support if you have already subscribed." : "Impossibile aprire la gestione dell'abbonamento. Riprova o contatta l'assistenza se sei già abbonato.");
      window.location.assign(data.url);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : (en ? "Try again later." : "Riprova più tardi."));
      setBusy(false);
    }
  }

  async function checkout(tier: Tier) {
    if (busy || !available || !emailVerified || (fixedTier && tier !== fixedTier)) return;
    setBusy(true); setError(""); setAttemptTier(tier);
    try {
      const response = await fetch("/api/stripe/checkout", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tier, ...(reactivating ? { reactivate: true } : {}) }),
      });
      const data = await response.json();
      if (!response.ok || !data.url) throw new Error(data.message || (en ? "Checkout is unavailable. Refresh to check your current status." : "Checkout non disponibile. Aggiorna per verificare lo stato attuale."));
      // A previous attempt, including one started on another device, owns the
      // tier. Let the customer see its actual terms before following its URL.
      if (data.tier === "pro" || data.tier === "pro_plus") {
        if (data.tier !== tier) {
          setResume({ tier: data.tier, url: data.url }); setAttemptTier(data.tier);
          setBusy(false); router.refresh(); return;
        }
      }
      window.location.assign(data.url);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : (en ? "Try again later." : "Riprova più tardi."));
      setBusy(false); router.refresh();
    }
  }

  return <main className="min-h-screen bg-[#030712] px-5 py-10 text-white">
    <section className="mx-auto max-w-2xl rounded-3xl border border-white/10 bg-slate-950 p-6 sm:p-10">
      <a href="/" className="text-xl font-semibold">Lavor<span className="text-emerald-400">AI</span></a>
      <p className="mt-10 text-sm font-semibold text-emerald-300">{reactivating || enrollment?.checkoutKind === "paid_reactivation" ? (en ? "Paid reactivation" : "Riattivazione a pagamento") : (en ? "3-day limited preview" : "Anteprima limitata di 3 giorni")}</p>
      <h1 className="mt-3 text-3xl font-semibold">{verified ? (en ? "Your membership" : "Il tuo abbonamento") : (en ? "Add your card to start" : "Aggiungi la carta per iniziare")}</h1>
      <p className="mt-5 leading-7 text-slate-300">{en
        ? "The preview includes one tailored CV and one cover letter for one selected job. No applications are sent during the preview. Full application access starts only after a successful payment."
        : "L'anteprima include un CV su misura e una lettera di presentazione per una sola offerta scelta. Durante l'anteprima non vengono inviate candidature. L'accesso completo alle candidature si attiva solo dopo un pagamento riuscito."}</p>

      {!available && <p role="status" className="mt-5 rounded-xl border border-amber-300/30 p-4 text-amber-100">{en
        ? "The preview is currently unavailable. New checkout is disabled until the AI service is ready. You can still manage or cancel an existing subscription below."
        : "L'anteprima non è al momento disponibile. I nuovi checkout sono disabilitati finché il servizio AI non sarà pronto. Puoi comunque gestire o disdire un abbonamento esistente qui sotto."}</p>}
      {waitingForConfirmation && <p role="status" className="mt-5 text-amber-100">{en
        ? "Waiting for Stripe confirmation. Returning from checkout does not confirm a card or payment. This page will refresh while verification is pending."
        : "In attesa della conferma di Stripe. Il ritorno dal checkout non conferma la carta o il pagamento. La pagina si aggiorna durante la verifica."}</p>}
      {canceled && (!verified || reactivating) && <p role="status" className="mt-5 text-slate-300">{en
        ? "You returned from checkout. This does not cancel an existing subscription; use Manage or cancel below."
        : "Sei tornato dal checkout. Questo non annulla un abbonamento esistente: usa Gestisci o disdici qui sotto."}</p>}
      {fixedTier && <p className="mt-5 font-semibold">{en ? "Selected plan: " : "Piano scelto: "}{plan(fixedTier)} · {price(fixedTier)}</p>}
      {verified && endDate && <div className="mt-4 space-y-3 text-slate-300">
        <p>{en ? "Stripe trial end: " : "Fine prova comunicata da Stripe: "}<time dateTime={enrollment!.trialEndsAt!}>{endDate}</time></p>
        <p>{enrollment?.status === "canceled"
          ? (en ? "This subscription is canceled. Manage billing below to review its details." : "Questo abbonamento è stato disdetto. Consulta i dettagli dalla gestione qui sotto.")
          : enrollment?.checkoutKind === "paid_reactivation"
            ? (en ? `Paid reactivation has no new trial. ${plan(enrollment.tier)} costs ${price(enrollment.tier)}, charged at checkout and renewed monthly unless canceled. Check payment status in Manage billing.` : `La riattivazione a pagamento non include una nuova prova. ${plan(enrollment.tier)} costa ${price(enrollment.tier)}, con addebito al checkout e rinnovo mensile salvo disdetta. Verifica lo stato del pagamento in Gestisci abbonamento.`)
          : enrollment?.cancelAtPeriodEnd
            ? (en ? "Cancellation is scheduled. Check the billing portal for the exact end of your subscription." : "La disdetta è programmata. Verifica la data di fine dell'abbonamento nel portale di gestione.")
            : (en ? `Your ${plan(enrollment!.tier)} plan automatically charges ${price(enrollment!.tier)} after the trial and renews monthly unless canceled. Cancel before the trial end to avoid the first charge.` : `Il piano ${plan(enrollment!.tier)} addebita automaticamente ${price(enrollment!.tier)} alla fine della prova e si rinnova ogni mese salvo disdetta. Disdici prima della fine della prova per evitare il primo addebito.`)}</p>
      </div>}
      {enrollment?.hasSubscription && !previewAvailable && <p className="mt-4 text-slate-300">{en
        ? "Preview access is not currently available. Application access remains locked until a successful payment is verified. Check your subscription and payment status below."
        : "L'accesso all'anteprima non è al momento disponibile. Le candidature restano bloccate fino alla verifica di un pagamento riuscito. Controlla qui sotto lo stato dell'abbonamento e del pagamento."}</p>}
      {previewAvailable && <a href="/onboarding" className="mt-6 block rounded-xl bg-emerald-400 px-5 py-4 text-center font-semibold text-slate-950">{en ? "Open your CV and letter preview" : "Apri l'anteprima di CV e lettera"}</a>}

      {(!enrollment?.hasSubscription || reactivating) && <div className="mt-7 space-y-3">
        {!emailVerified && <div className="space-y-2 text-amber-100"><p>{en ? "Verify your email before starting checkout." : "Verifica l'email prima di iniziare il checkout."}</p>
          <button type="button" disabled={busy || !email} onClick={resendVerification} className="underline disabled:opacity-50">{en ? "Resend verification email" : "Invia di nuovo l’email di verifica"}</button>
          <button type="button" onClick={() => router.refresh()} className="ml-4 underline">{en ? "I have verified my email" : "Ho verificato la mia email"}</button>
          {verificationSent && <p role="status">{en ? "Check your inbox and spam folder, then refresh after verifying." : "Controlla la posta e lo spam, poi aggiorna dopo la verifica."}</p>}
        </div>}
        <p className="text-sm leading-6 text-slate-300">{reactivating
          ? (en ? "Reactivate with a paid monthly subscription. No new trial is included: the selected price is charged now and renews monthly unless canceled. Access opens only after payment is verified." : "Riattiva con un abbonamento mensile a pagamento. Nessuna nuova prova: il prezzo scelto viene addebitato ora e si rinnova ogni mese salvo disdetta. L'accesso si attiva solo dopo la verifica del pagamento.")
          : en ? "A card is required upfront. No charge today for the 3-day preview. Your chosen monthly plan charges automatically after the trial unless you cancel before its end. The exact end date is shown by Stripe and here after verification."
          : "È richiesta una carta prima di iniziare. Nessun addebito oggi per l'anteprima di 3 giorni. Il piano mensile scelto viene addebitato automaticamente dopo la prova salvo disdetta prima della scadenza. Stripe mostra la data esatta, disponibile anche qui dopo la verifica."}</p>
        {resume ? <div role="status" className="rounded-xl border border-amber-300/30 p-4">
          <p>{en ? `An earlier checkout already selected ${plan(resume.tier)} at ${price(resume.tier)}. Continue with that plan.` : `Un checkout precedente ha già selezionato ${plan(resume.tier)} a ${price(resume.tier)}. Continua con quel piano.`}</p>
          <button type="button" disabled={busy || !available} onClick={() => window.location.assign(resume.url)} className="mt-3 rounded-lg bg-emerald-400 px-4 py-3 font-semibold text-slate-950 disabled:opacity-50">{en ? "Continue to Stripe" : "Continua su Stripe"}</button>
        </div> : (["pro", "pro_plus"] as const).filter(tier => !fixedTier || fixedTier === tier).map(tier => <button key={tier} type="button" disabled={busy || !available || !emailVerified || waitingForConfirmation} onClick={() => checkout(tier)} className="block w-full rounded-xl border border-emerald-300/30 px-5 py-4 text-left disabled:cursor-not-allowed disabled:opacity-50">
          <span className="block font-semibold">{busy ? (en ? "Opening Stripe…" : "Apertura di Stripe…") : reactivating ? (en ? `Reactivate ${plan(tier)} now at ${price(tier)}` : `Riattiva ${plan(tier)} ora a ${price(tier)}`) : `${en ? (fixedTier ? "Resume" : "Choose") : (fixedTier ? "Riprendi" : "Scegli")} ${plan(tier)}`}</span>
          <span className="mt-1 block text-sm text-slate-300">{reactivating ? (en ? "No new trial. Charge now: " : "Nessuna nuova prova. Addebito ora: ") : (en ? "After 3 days: " : "Dopo 3 giorni: ")}{price(tier)} · {en ? "renews monthly unless canceled" : "rinnovo mensile salvo disdetta"}</span>
        </button>)}
        {fixedTier && <p className="text-xs text-slate-400">{en ? "The plan is fixed once a checkout attempt starts." : "Il piano resta fisso dopo l'avvio di un tentativo di checkout."}</p>}
      </div>}
      <button type="button" onClick={openPortal} disabled={busy} className="mt-6 w-full rounded-xl border border-white/30 px-5 py-4 font-semibold disabled:opacity-50">{en ? "Manage or cancel subscription" : "Gestisci o disdici abbonamento"}</button>
      {error && <p role="alert" className="mt-4 text-sm text-red-300">{error}</p>}
    </section>
  </main>;
}
