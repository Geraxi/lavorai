"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Plan = "pro" | "pro_plus";

export function StartMembershipActions({ confirming, canceled }: { confirming: boolean; canceled: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<Plan | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!confirming) return;
    let attempts = 0;
    const timer = window.setInterval(() => {
      router.refresh();
      attempts += 1;
      if (attempts >= 20) window.clearInterval(timer);
    }, 3000);
    return () => window.clearInterval(timer);
  }, [confirming, router]);

  async function beginCheckout(tier: Plan) {
    setBusy(tier);
    setError("");
    try {
      const response = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier }),
      });
      const data = await response.json();
      if (!response.ok || !data.url) throw new Error(data.message || "Impossibile aprire il pagamento. Riprova.");
      window.location.assign(data.url);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Riprova tra poco.");
      setBusy(null);
    }
  }

  return (
    <div className="mt-7 space-y-3">
      {confirming && <p role="status" className="rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">Stiamo confermando il tuo metodo di pagamento. L&apos;accesso si aprirà automaticamente.</p>}
      {canceled && <p role="status" className="rounded-xl border border-amber-300/20 bg-amber-300/10 px-4 py-3 text-sm text-amber-100">Nessun pagamento è stato effettuato. Completa l&apos;attivazione per entrare nella piattaforma.</p>}
      <button type="button" disabled={busy !== null} onClick={() => beginCheckout("pro")} className="flex w-full items-center justify-between rounded-2xl bg-emerald-400 px-5 py-4 text-left text-slate-950 transition hover:bg-emerald-300 disabled:cursor-wait disabled:opacity-70">
        <span><span className="block text-base font-bold">{busy === "pro" ? "Apro Stripe…" : "Inizia 7 giorni di Pro"}</span><span className="mt-1 block text-sm text-slate-800">Poi €19,99/mese · 50 candidature/mese</span></span>
        <span aria-hidden="true" className="text-xl">↗</span>
      </button>
      <button type="button" disabled={busy !== null} onClick={() => beginCheckout("pro_plus")} className="flex w-full items-center justify-between rounded-2xl border border-white/15 bg-white/[.035] px-5 py-4 text-left transition hover:border-emerald-300/50 hover:bg-white/[.06] disabled:cursor-wait disabled:opacity-70">
        <span><span className="block text-base font-semibold">{busy === "pro_plus" ? "Apro Stripe…" : "Inizia 7 giorni di Pro+"}</span><span className="mt-1 block text-sm text-slate-400">Poi €39,99/mese · candidature illimitate</span></span>
        <span className="rounded-full border border-white/10 px-2 py-1 text-xs text-slate-300">Pro+</span>
      </button>
      {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
    </div>
  );
}
