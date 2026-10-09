"use client";

import { useState } from "react";
import useSWR from "swr";

type Result = { candidates: number; sent: number; skipped: number; details: Array<{ email: string; status: string }> };
const fetcher = (url: string) => fetch(url).then((response) => response.json());

export function AdminCheckoutFeedback() {
  const { data, mutate, isLoading } = useSWR<Result>("/api/admin/checkout-feedback", fetcher);
  const [result, setResult] = useState<Result | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  async function send() {
    setSending(true); setError(""); setConfirming(false);
    try {
      const response = await fetch("/api/admin/checkout-feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const next = await response.json() as Result & { error?: string };
      if (!response.ok) throw new Error(next.error ?? "Invio non riuscito");
      setResult(next); mutate();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Invio non riuscito"); }
    finally { setSending(false); }
  }

  const count = data?.candidates ?? 0;
  return <div style={{ display: "grid", gap: 10 }}>
    <p style={{ margin: 0, fontSize: 13, color: "var(--fg-muted)" }}>
      Contatta una sola volta chi ha aperto un checkout reale ma non ha una subscription attiva. L&apos;email chiede il motivo dell&apos;abbandono e apre un form di feedback sicuro.
    </p>
    <div style={{ fontSize: 13 }}>{isLoading ? "Calcolo destinatari…" : <><b>{count}</b> utenti idonei</>}</div>
    {confirming && <div role="alertdialog" style={{ border: "1px solid var(--border-ds)", borderRadius: 10, padding: 12 }}>
      Inviare la richiesta di feedback a {count} utenti? Ogni persona verrà esclusa dai prossimi invii.
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}><button className="adm-btn primary" disabled={sending} onClick={send}>Conferma invio</button><button className="adm-btn" onClick={() => setConfirming(false)}>Annulla</button></div>
    </div>}
    <div style={{ display: "flex", gap: 8 }}><button className="adm-btn primary" disabled={sending || !count} onClick={() => setConfirming(true)}>{sending ? "Invio…" : "Invia richiesta feedback"}</button><button className="adm-btn" onClick={() => mutate()} disabled={sending}>Aggiorna</button></div>
    {error && <p role="alert" style={{ color: "#fca5a5", margin: 0 }}>{error}</p>}
    {result && <p style={{ margin: 0, fontSize: 13 }}>Inviati {result.sent} · saltati {result.skipped}.</p>}
  </div>;
}
