"use client";

import { useState } from "react";

/**
 * Bottone one-click sull'alert "crediti esauriti" per re-accodare tutte
 * le candidature failed. Hitta /api/admin/retry-credit-failures (auth
 * via sessione admin). Mostra risultato inline.
 */
export function RetryCreditFailuresButton() {
  const [state, setState] = useState<"idle" | "running" | "done" | "error">("idle");
  const [msg, setMsg] = useState<string>("");

  async function run() {
    setState("running");
    setMsg("");
    try {
      const r = await fetch("/api/admin/retry-credit-failures", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ days: 14, limit: 200 }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      setState("done");
      setMsg(`${j.requeued}/${j.found} rimesse in coda`);
    } catch (err) {
      setState("error");
      setMsg(err instanceof Error ? err.message : "errore");
    }
  }

  return (
    <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 12 }}>
      <button
        type="button"
        onClick={run}
        disabled={state === "running"}
        style={{
          padding: "8px 14px",
          borderRadius: 8,
          background: state === "running" ? "rgba(220,38,38,0.5)" : "#dc2626",
          color: "#fff",
          fontSize: 13,
          fontWeight: 600,
          border: "none",
          cursor: state === "running" ? "wait" : "pointer",
        }}
      >
        {state === "running" ? "Retry in corso…" : "Retry ora tutte le failed"}
      </button>
      {msg && (
        <span style={{ fontSize: 12, color: state === "error" ? "#fca5a5" : "#86efac" }}>
          {msg}
        </span>
      )}
    </div>
  );
}
