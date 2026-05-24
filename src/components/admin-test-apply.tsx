"use client";

import { useState } from "react";

interface TestApplyResult {
  ok: boolean;
  dryRun?: boolean;
  portalEnabled?: boolean;
  applicationId?: string;
  job?: string;
  adapter?: string;
  ms?: number;
  runError?: string | null;
  message?: string;
  result?: {
    status?: string;
    submittedVia?: string | null;
    submitConfirmation?: string | null;
    atsScore?: number | null;
    errorMessage?: string | null;
    canaryCaptured?: boolean;
    canaryExcerpt?: string | null;
  };
}

/**
 * Test end-to-end di UNA candidatura direttamente su Vercel (in-process):
 * generazione CV + adapter ATS + Chromium. In dry-run il form è compilato
 * ma non inviato. Prova definitiva che il pipeline funziona su serverless.
 */
export function AdminTestApply() {
  const [appId, setAppId] = useState("");
  const [realSubmit, setRealSubmit] = useState(false);
  const [loading, setLoading] = useState(false);
  const [res, setRes] = useState<TestApplyResult | null>(null);

  async function run() {
    if (loading) return;
    if (
      realSubmit &&
      !confirm(
        "INVIO REALE: questa candidatura verrà inviata DAVVERO all'azienda. Continuare?",
      )
    )
      return;
    setLoading(true);
    setRes(null);
    try {
      const r = await fetch("/api/admin/test-apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          applicationId: appId.trim() || undefined,
          realSubmit,
        }),
      });
      setRes((await r.json()) as TestApplyResult);
    } catch {
      setRes({ ok: false, message: "Errore di rete." });
    } finally {
      setLoading(false);
    }
  }

  const r = res?.result;
  const confirmed =
    typeof r?.submitConfirmation === "string" &&
    r.submitConfirmation.startsWith("DETECTED");

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
        🧪 Test candidatura end-to-end (su Vercel)
      </h2>
      <p style={{ fontSize: 12, color: "var(--fg-muted)", margin: "0 0 12px", lineHeight: 1.6 }}>
        Esegue UNA candidatura in-process su produzione: generazione CV +
        adapter ATS + Chromium. Con dry-run ON il form è compilato ma NON
        inviato. Se lasci vuoto, sceglie una tua candidatura su portale
        supportato.
      </p>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <input
          value={appId}
          onChange={(e) => setAppId(e.target.value)}
          placeholder="applicationId (opzionale)"
          style={{
            flex: "1 1 240px",
            borderRadius: 10,
            border: "1px solid var(--border-ds)",
            background: "var(--bg)",
            color: "var(--fg)",
            padding: "9px 11px",
            fontSize: 13,
          }}
        />
        <button
          type="button"
          onClick={run}
          disabled={loading}
          style={{
            padding: "9px 18px",
            borderRadius: 10,
            border: "none",
            background: realSubmit ? "#dc2626" : "hsl(var(--primary))",
            color: realSubmit ? "#fff" : "#001a0d",
            fontSize: 13.5,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          {loading
            ? "Eseguo (~30-60s)…"
            : realSubmit
              ? "Esegui INVIO REALE"
              : "Esegui test (dry-run)"}
        </button>
      </div>

      <label
        style={{
          display: "flex",
          alignItems: "center",
          gap: 7,
          fontSize: 12.5,
          color: realSubmit ? "#fca5a5" : "var(--fg-muted)",
          marginBottom: 12,
          cursor: "pointer",
        }}
      >
        <input
          type="checkbox"
          checked={realSubmit}
          onChange={(e) => setRealSubmit(e.target.checked)}
        />
        Invio REALE (toglie il dry-run solo per questa candidatura — la manda
        davvero all&apos;azienda)
      </label>

      {res && (
        <div
          style={{
            padding: 12,
            borderRadius: 10,
            background: res.ok ? "rgba(22,163,74,0.08)" : "rgba(220,38,38,0.1)",
            border: `1px solid ${res.ok ? "rgba(22,163,74,0.35)" : "rgba(220,38,38,0.4)"}`,
            fontSize: 12.5,
            lineHeight: 1.7,
          }}
        >
          {res.message && <div style={{ color: "var(--fg)" }}>{res.message}</div>}
          {res.job && (
            <>
              <div><strong>Job:</strong> {res.job}</div>
              <div><strong>Adapter:</strong> {res.adapter} · <strong>dry-run:</strong> {res.dryRun ? "ON (nessun invio)" : "OFF (invio reale!)"} · {res.ms}ms</div>
              <div style={{ marginTop: 6 }}>
                <strong>Esito:</strong>{" "}
                <span style={{ color: confirmed ? "hsl(var(--primary))" : "var(--fg)" }}>
                  status=<code>{r?.status}</code> · conf=<code>{r?.submitConfirmation ?? "-"}</code>
                  {r?.atsScore != null && <> · ATS {r.atsScore}</>}
                </span>
              </div>
              {r?.errorMessage && (
                <div style={{ marginTop: 4, color: "var(--fg-muted)" }}>
                  msg: {r.errorMessage}
                </div>
              )}
              <div style={{ marginTop: 4 }}>
                canary: {r?.canaryCaptured ? "✅ catturato" : "—"}
              </div>
              {res.runError && (
                <div style={{ marginTop: 4, color: "#fca5a5" }}>
                  runError: {res.runError}
                </div>
              )}
              {r?.canaryExcerpt && (
                <pre
                  style={{
                    marginTop: 8,
                    background: "var(--bg)",
                    border: "1px solid var(--border-ds)",
                    borderRadius: 8,
                    padding: 10,
                    fontSize: 11,
                    whiteSpace: "pre-wrap",
                    maxHeight: 200,
                    overflowY: "auto",
                  }}
                >
                  {r.canaryExcerpt}
                </pre>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}
