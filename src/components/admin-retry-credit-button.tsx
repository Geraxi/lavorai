"use client";

import { useState } from "react";

interface RetryResult {
  ok?: boolean;
  found?: number;
  requeued?: number;
  days?: number;
  error?: string;
  message?: string;
}

export function AdminRetryCreditButton() {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<RetryResult | null>(null);

  async function run() {
    if (running) return;
    if (!confirm("Ri-accodare le candidature fallite per crediti? Verranno ri-processate dal worker.")) return;
    setRunning(true);
    setResult(null);
    try {
      const res = await fetch("/api/admin/retry-credit-failures", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days: 14, limit: 100 }),
      });
      setResult((await res.json()) as RetryResult);
    } catch (err) {
      setResult({ error: "network", message: err instanceof Error ? err.message : "errore" });
    } finally {
      setRunning(false);
    }
  }

  return (
    <div style={{ marginTop: 4 }}>
      <button
        type="button"
        onClick={run}
        disabled={running}
        style={{
          padding: "9px 16px",
          borderRadius: 10,
          border: "1px solid var(--border-ds)",
          background: "transparent",
          color: "var(--fg)",
          fontSize: 13.5,
          fontWeight: 700,
          cursor: running ? "wait" : "pointer",
          opacity: running ? 0.7 : 1,
        }}
      >
        {running ? "Ri-accodo…" : "Riprova candidature fallite per crediti"}
      </button>

      {result && (
        <div
          style={{
            marginTop: 10,
            padding: "10px 12px",
            borderRadius: 8,
            background: "var(--bg)",
            border: "1px solid var(--border-ds)",
            fontSize: 12.5,
            color: "var(--fg-muted)",
            lineHeight: 1.7,
          }}
        >
          {result.error ? (
            <span style={{ color: "#fca5a5" }}>
              Errore: {result.error} {result.message ? `— ${result.message}` : ""}
            </span>
          ) : (
            <>
              <strong style={{ color: "var(--fg)" }}>
                {result.requeued} ri-accodate
              </strong>{" "}
              su {result.found} trovate (ultimi {result.days}g). Verranno
              processate dal worker — controlla /applications tra qualche minuto.
            </>
          )}
        </div>
      )}
    </div>
  );
}
