"use client";

import { useState } from "react";

interface SyncResult {
  ok?: boolean;
  greenhouse?: number;
  lever?: number;
  ashby?: number;
  smartrecruiters?: number;
  workable?: number;
  linkedin?: number;
  demand?: number;
  demandQueries?: number;
  total?: number;
  error?: string;
  message?: string;
}

export function AdminSyncButton() {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<SyncResult | null>(null);

  async function run() {
    if (running) return;
    setRunning(true);
    setResult(null);
    try {
      const res = await fetch("/api/admin/sync-jobs", { method: "POST" });
      setResult((await res.json()) as SyncResult);
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
        {running ? "Sync in corso… (può richiedere ~1-2 min)" : "Sync job ora"}
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
              <strong style={{ color: "var(--fg)" }}>Sync completato.</strong>{" "}
              {result.total} job upsertati.
              <div style={{ marginTop: 4 }}>
                greenhouse {result.greenhouse} · lever {result.lever} · ashby{" "}
                {result.ashby} · smartrec {result.smartrecruiters} · workable{" "}
                {result.workable} · linkedin {result.linkedin} ·{" "}
                <strong style={{ color: "hsl(var(--primary))" }}>
                  demand {result.demand} ({result.demandQueries} query)
                </strong>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
