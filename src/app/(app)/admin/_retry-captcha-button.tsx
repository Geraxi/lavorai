"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";

/**
 * Ri-accoda le candidature ATS bloccate dal vecchio falso positivo captcha
 * (ready_to_apply + CAPTCHA) e le failed "non confermato". Chiama
 * /api/admin/retry-captcha (sessione admin).
 */
export function RetryCaptchaButton() {
  const [state, setState] = useState<"idle" | "running" | "done" | "error">("idle");
  const [msg, setMsg] = useState("");

  async function run() {
    if (!window.confirm("Ri-accodare le candidature ATS bloccate dal captcha (ultimi 30 giorni)? Verranno inviate davvero dal worker.")) return;
    setState("running");
    setMsg("");
    try {
      const r = await fetch("/api/admin/retry-captcha", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ days: 30, limit: 200 }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      setState("done");
      setMsg(`${j.requeued} rimesse in coda (${j.found} trovate, ${j.withAdapter} con adapter ATS)`);
    } catch (err) {
      setState("error");
      setMsg(err instanceof Error ? err.message : "errore");
    }
  }

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
      <button type="button" className="adm-btn primary" onClick={run} disabled={state === "running"}>
        <RefreshCw size={13} style={state === "running" ? { animation: "spin 1s linear infinite" } : undefined} />
        {state === "running" ? "Ri-accodo…" : "Ri-accoda bloccate da captcha"}
      </button>
      {msg && <span style={{ fontSize: 12, color: state === "error" ? "#f87171" : "hsl(var(--primary))" }}>{msg}</span>}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </span>
  );
}
