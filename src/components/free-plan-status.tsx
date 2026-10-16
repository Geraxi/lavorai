"use client";
import { captureFunnel } from "@/lib/posthog/client";
import { useEffect, useRef, useState } from "react";

const FREE_TOTAL = 5;

/** Counts from 0 to the real value once on mount. The server markup and
 * reduced-motion users get the real value straight away. */
function useCountUp(value: number) {
  const [shown, setShown] = useState(value);
  const frame = useRef(0);
  useEffect(() => {
    if (typeof window === "undefined" || value <= 0) { setShown(value); return; }
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) { setShown(value); return; }
    const start = performance.now();
    const duration = 600;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      setShown(Math.round(value * (1 - Math.pow(1 - t, 3))));
      if (t < 1) frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame.current);
  }, [value]);
  return shown;
}

export function FreePlanStatus({ remaining }: { remaining: number }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const shown = useCountUp(remaining);
  useEffect(() => { if (remaining === 0) captureFunnel("upgrade_wall_viewed"); }, [remaining]);
  async function upgrade() {
    captureFunnel("upgrade_clicked", { target_plan: "pro" });
    captureFunnel("plan_selected", { plan: "pro" });
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/stripe/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tier: "pro" }) });
      const body = await response.json();
      if (!response.ok || !body.url) throw new Error(body.message ?? "Checkout non disponibile.");
      window.location.assign(body.url);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Errore di rete."); setBusy(false); }
  }
  return <div className={`free-plan-status${remaining === 0 ? " is-empty" : ""}`}>
    <p className="free-plan-status-count" aria-live="off"><span className="sr-only">{remaining} di 5 candidature gratuite rimaste</span><span aria-hidden="true">{shown} di 5 candidature gratuite rimaste</span></p>
    <div className="free-plan-status-meter" aria-hidden="true">
      {Array.from({ length: FREE_TOTAL }, (_, index) => <i key={index} className={index < shown ? "is-on" : undefined} />)}
    </div>
    {remaining === 0 && <button type="button" className="ds-btn ds-btn-accent mt-2" disabled={busy} onClick={upgrade}>{busy ? "Apro Stripe…" : "Passa a Pro, EUR 19,99/mese"}</button>}
    {error && <p role="alert">{error}</p>}
  </div>;
}
