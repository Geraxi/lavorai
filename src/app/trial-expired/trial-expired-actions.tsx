"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";

export function TrialExpiredActions({ confirming }: { confirming: boolean }) {
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
      const response = await fetch("/api/stripe/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tier }) });
      const data = await response.json();
      if (!response.ok || !data.url) throw new Error(data.message || "Impossibile aprire il pagamento. Riprova.");
      window.location.assign(data.url);
    } catch (e) { setError(e instanceof Error ? e.message : "Riprova tra poco."); setBusy(false); }
  }
  return <div className="flex flex-col gap-3">
    {confirming && <p role="status">Stiamo verificando l’attivazione del tuo abbonamento. L’accesso si aggiornerà automaticamente. <button className="underline" onClick={() => router.refresh()}>Verifica di nuovo</button></p>}
    <button className="ds-btn ds-btn-primary" disabled={busy} onClick={() => checkout("pro")}>Attiva Pro · €19,99/mese</button>
    <button className="ds-btn" disabled={busy} onClick={() => checkout("pro_plus")}>Attiva Pro+</button>
    {error && <p role="alert" className="text-red-500 text-sm">{error}</p>}
    <a href="/api/gdpr/export" className="text-sm underline">Esporta i tuoi dati</a>
    <button className="text-sm underline" onClick={() => signOut({ callbackUrl: "/login" })}>Esci</button>
  </div>;
}
