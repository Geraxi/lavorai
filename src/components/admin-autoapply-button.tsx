"use client";

import { useState } from "react";

interface RunResult {
  ok?: boolean;
  ms?: number;
  usersProcessed?: number;
  applicationsEnqueued?: number;
  applicationsAwaitingConsent?: number;
  skippedDailyCap?: number;
  skippedMatchThreshold?: number;
  skippedRoleMismatch?: number;
  skippedLocationMismatch?: number;
  errors?: number;
  error?: string;
  message?: string;
}

export function AdminAutoApplyButton() {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<RunResult | null>(null);

  async function run() {
    if (running) return;
    if (
      !confirm(
        "Lanciare il cron auto-apply ORA? Accoderà candidature reali per gli utenti in modalità auto (inviate dal worker) e hybrid (da approvare).",
      )
    )
      return;
    setRunning(true);
    setResult(null);
    try {
      const res = await fetch("/api/admin/run-auto-apply", { method: "POST" });
      setResult((await res.json()) as RunResult);
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
          border: "none",
          background: "hsl(var(--primary))",
          color: "#001a0d",
          fontSize: 13.5,
          fontWeight: 700,
          cursor: running ? "wait" : "pointer",
          opacity: running ? 0.7 : 1,
        }}
      >
        {running ? "Auto-apply in corso… (~1-3 min)" : "Lancia auto-apply ora"}
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
              <strong style={{ color: "var(--fg)" }}>Auto-apply completato.</strong>{" "}
              {result.usersProcessed} utenti processati.
              <div style={{ marginTop: 4 }}>
                <strong style={{ color: "hsl(var(--primary))" }}>
                  {result.applicationsEnqueued} accodate (auto)
                </strong>{" "}
                · {result.applicationsAwaitingConsent} da approvare (hybrid) · cap{" "}
                {result.skippedDailyCap} · match {result.skippedMatchThreshold} · ruolo{" "}
                {result.skippedRoleMismatch} · sede {result.skippedLocationMismatch} · errori{" "}
                {result.errors}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
