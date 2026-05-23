"use client";

import { useState } from "react";

interface HealthResult {
  ok: boolean;
  status: string;
  message: string;
  keyHint?: string;
  reply?: string;
  raw?: string;
  ms?: number;
}

/**
 * Pulsante admin: verifica IN PRODUZIONE la chiave Anthropic + crediti con
 * una chiamata reale al server prod. Risolve l'incognita "la chiave prod
 * funziona davvero?" che non possiamo testare da locale (chiave Sensitive).
 */
interface BrowserResult {
  ok: boolean;
  status: string;
  message: string;
  chromiumVersion?: string;
  launchedMs?: number;
  totalMs?: number;
  raw?: string;
}

export function AdminAiHealth() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<HealthResult | null>(null);
  const [brLoading, setBrLoading] = useState(false);
  const [brResult, setBrResult] = useState<BrowserResult | null>(null);

  async function check() {
    if (loading) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/admin/ai-healthcheck");
      setResult((await res.json()) as HealthResult);
    } catch {
      setResult({ ok: false, status: "network", message: "Errore di rete." });
    } finally {
      setLoading(false);
    }
  }

  async function checkBrowser() {
    if (brLoading) return;
    setBrLoading(true);
    setBrResult(null);
    try {
      const res = await fetch("/api/admin/browser-healthcheck");
      setBrResult((await res.json()) as BrowserResult);
    } catch {
      setBrResult({ ok: false, status: "network", message: "Errore di rete." });
    } finally {
      setBrLoading(false);
    }
  }

  const tone = result?.ok
    ? "good"
    : result?.status === "no_credits" || result?.status === "invalid_key"
      ? "bad"
      : "neutral";

  return (
    <section
      style={{
        padding: 18,
        borderRadius: 14,
        background: "var(--bg-elev)",
        border: "1px solid var(--border-ds)",
        marginBottom: 16,
      }}
    >
      <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>
        🤖 Health check AI (produzione)
      </h2>
      <p style={{ fontSize: 12, color: "var(--fg-muted)", margin: "0 0 12px" }}>
        Chiamata reale alla API Anthropic con la chiave del server di produzione.
        Conferma se la pipeline può generare CV (chiave valida + crediti).
      </p>

      <button
        type="button"
        onClick={check}
        disabled={loading}
        style={{
          padding: "9px 18px",
          borderRadius: 10,
          border: "none",
          background: "hsl(var(--primary))",
          color: "#001a0d",
          fontSize: 13.5,
          fontWeight: 700,
          cursor: "pointer",
        }}
      >
        {loading ? "Verifico…" : "Verifica chiave + crediti"}
      </button>

      <button
        type="button"
        onClick={checkBrowser}
        disabled={brLoading}
        style={{
          marginLeft: 8,
          padding: "9px 18px",
          borderRadius: 10,
          border: "1px solid var(--border-ds)",
          background: "transparent",
          color: "var(--fg)",
          fontSize: 13.5,
          fontWeight: 700,
          cursor: "pointer",
        }}
      >
        {brLoading ? "Avvio Chromium…" : "Verifica browser (Chromium)"}
      </button>

      {brResult && (
        <div
          style={{
            marginTop: 14,
            padding: 12,
            borderRadius: 10,
            background: brResult.ok ? "rgba(22,163,74,0.1)" : "rgba(220,38,38,0.1)",
            border: `1px solid ${brResult.ok ? "rgba(22,163,74,0.4)" : "rgba(220,38,38,0.4)"}`,
          }}
        >
          <div style={{ fontSize: 13.5, fontWeight: 700, color: brResult.ok ? "hsl(var(--primary))" : "#fca5a5" }}>
            {brResult.ok ? "✅ " : "❌ "}
            {brResult.message}
          </div>
          <div style={{ fontSize: 11.5, color: "var(--fg-muted)", marginTop: 6, lineHeight: 1.6 }}>
            {brResult.chromiumVersion && <>Chromium: <code>{brResult.chromiumVersion}</code><br /></>}
            {brResult.launchedMs != null && <>avvio: {brResult.launchedMs}ms · totale: {brResult.totalMs}ms<br /></>}
            {brResult.raw && <>dettaglio: {brResult.raw}</>}
          </div>
        </div>
      )}

      {result && (
        <div
          style={{
            marginTop: 14,
            padding: 12,
            borderRadius: 10,
            background:
              tone === "good"
                ? "rgba(22,163,74,0.1)"
                : tone === "bad"
                  ? "rgba(220,38,38,0.1)"
                  : "var(--bg)",
            border: `1px solid ${
              tone === "good"
                ? "rgba(22,163,74,0.4)"
                : tone === "bad"
                  ? "rgba(220,38,38,0.4)"
                  : "var(--border-ds)"
            }`,
          }}
        >
          <div
            style={{
              fontSize: 13.5,
              fontWeight: 700,
              color:
                tone === "good"
                  ? "hsl(var(--primary))"
                  : tone === "bad"
                    ? "#fca5a5"
                    : "var(--fg)",
            }}
          >
            {result.ok ? "✅ " : "❌ "}
            {result.message}
          </div>
          <div style={{ fontSize: 11.5, color: "var(--fg-muted)", marginTop: 6, lineHeight: 1.6 }}>
            {result.keyHint && <>chiave: <code>{result.keyHint}</code><br /></>}
            {result.reply && <>risposta: <code>{result.reply}</code><br /></>}
            {result.ms != null && <>latenza: {result.ms}ms<br /></>}
            {result.raw && <>dettaglio: {result.raw}</>}
          </div>
        </div>
      )}
    </section>
  );
}
