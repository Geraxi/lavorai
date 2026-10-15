"use client";
import { useState } from "react";

export function FreePlanStatus({ remaining }: { remaining: number }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function upgrade() {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/stripe/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tier: "pro" }) });
      const body = await response.json();
      if (!response.ok || !body.url) throw new Error(body.message ?? "Checkout non disponibile.");
      window.location.assign(body.url);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Errore di rete."); setBusy(false); }
  }
  return <div className="my-3 rounded border border-primary/30 p-3 text-sm">
    <p>{remaining} di 5 candidature gratuite rimaste</p>
    {remaining === 0 && <button type="button" className="ds-btn ds-btn-accent mt-2" disabled={busy} onClick={upgrade}>{busy ? "Apro Stripe…" : "Passa a Pro, EUR 19,99/mese"}</button>}
    {error && <p role="alert">{error}</p>}
  </div>;
}
