"use client";

import { useState } from "react";

interface Result {
  ok?: boolean;
  found?: number;
  processed?: number;
  failed?: number;
  results?: Array<{ email: string; status: string; profile?: string }>;
  error?: string;
  message?: string;
}

export function AdminReparseCvButton() {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  async function run() {
    if (running) return;
    if (
      !confirm(
        "Ri-parsare tutti i CV con profile vuoto? Usa la chiave Anthropic (consumo crediti).",
      )
    )
      return;
    setRunning(true);
    setResult(null);
    try {
      const res = await fetch("/api/admin/reparse-cv-profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: 50 }),
      });
      setResult((await res.json()) as Result);
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
        {running ? "Re-parse in corso… (~30s per utente)" : "Ri-parsa CV profiles"}
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
                {result.processed} riparsati, {result.failed} falliti
              </strong>{" "}
              su {result.found} trovati
              {result.results && result.results.length > 0 && (
                <div style={{ marginTop: 8, display: "grid", gap: 3 }}>
                  {result.results.map((r, i) => (
                    <div
                      key={i}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 8,
                      }}
                    >
                      <span>{r.email}</span>
                      <span
                        style={{
                          color: r.status === "ok"
                            ? "hsl(var(--primary))"
                            : r.status.startsWith("error")
                              ? "#fca5a5"
                              : "var(--fg-subtle)",
                          whiteSpace: "nowrap",
                          maxWidth: "60%",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                        title={r.profile ?? r.status}
                      >
                        {r.status === "ok" ? (r.profile ?? "ok") : r.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
