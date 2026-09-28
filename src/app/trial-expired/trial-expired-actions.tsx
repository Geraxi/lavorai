"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";

export function TrialExpiredActions({
  confirming,
  canceled,
  proPrice,
  proPlusPrice,
}: {
  confirming: boolean;
  canceled: boolean;
  proPrice: string;
  proPlusPrice: string;
}) {
  const router = useRouter();
  useEffect(() => {
    if (!confirming) return;
    let attempts = 0;
    const timer = setInterval(() => { router.refresh(); if (++attempts >= 20) clearInterval(timer); }, 3000);
    return () => clearInterval(timer);
  }, [confirming, router]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function checkout(tier: "pro" | "pro_plus") {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/stripe/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tier, returnTo: "trial_expired" }) });
      const data = await response.json();
      if (!response.ok || !data.url) throw new Error(data.message || "Impossibile aprire il pagamento. Riprova.");
      window.location.assign(data.url);
    } catch (e) { setError(e instanceof Error ? e.message : "Riprova tra poco."); setBusy(false); }
  }
  return <div className="flex flex-col gap-5">
    {confirming && <p role="status" className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-center">Pagamento ricevuto: stiamo riattivando l’account. L’accesso si aggiornerà automaticamente. <button className="underline font-semibold" onClick={() => router.refresh()}>Verifica ora</button></p>}
    {canceled && <p role="status" className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-center">Checkout annullato. Il tuo account resta al sicuro e puoi riattivarlo quando vuoi.</p>}

    <div className="grid gap-3 sm:grid-cols-2">
      <button type="button" className="rounded-xl border border-primary bg-primary/5 p-5 text-left transition-colors hover:bg-primary/10 focus:outline-none focus:ring-2 focus:ring-primary" disabled={busy} onClick={() => checkout("pro")}>
        <div className="flex items-start justify-between gap-3"><span className="font-bold text-lg">Pro</span><span className="font-bold">{proPrice}<span className="text-sm font-normal text-muted-foreground">/mese</span></span></div>
        <p className="mt-2 text-sm text-muted-foreground">50 candidature al mese, CV e lettera su misura.</p>
        <span className="mt-4 inline-flex ds-btn ds-btn-primary">{busy ? "Apro il pagamento…" : "Attiva Pro"}</span>
      </button>
      <button type="button" className="rounded-xl border p-5 text-left transition-colors hover:bg-muted/50 focus:outline-none focus:ring-2 focus:ring-primary" disabled={busy} onClick={() => checkout("pro_plus")}>
        <div className="flex items-start justify-between gap-3"><span className="font-bold text-lg">Pro+</span><span className="font-bold">{proPlusPrice}<span className="text-sm font-normal text-muted-foreground">/mese</span></span></div>
        <p className="mt-2 text-sm text-muted-foreground">Candidature illimitate, tutti i portali e Founder Coach.</p>
        <span className="mt-4 inline-flex ds-btn">{busy ? "Apro il pagamento…" : "Attiva Pro+"}</span>
      </button>
    </div>

    <p className="text-center text-sm text-muted-foreground">Pagamento sicuro con Stripe. L’accesso torna disponibile subito dopo il pagamento. Disdici quando vuoi.</p>
    {error && <p role="alert" className="text-red-500 text-sm text-center">{error}</p>}
    <div className="flex items-center justify-center gap-4 text-sm">
      <a href="/api/gdpr/export" className="underline">Esporta i tuoi dati</a>
      <button className="underline" onClick={() => signOut({ callbackUrl: "/login" })}>Esci</button>
    </div>
  </div>;
}
