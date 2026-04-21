"use client";

import { useEffect, useRef } from "react";

/**
 * Client-only: se l'utente aveva scelto Pro/Pro+ pre-verify email,
 * localStorage['lavorai.selectedPlan'] è settato. Al primo caricamento di
 * una pagina autenticata (es. dashboard), triggeriamo il checkout Stripe.
 * Mount questo componente nella root app layout o in dashboard.
 */
export function PostLoginCheckout() {
  const firedRef = useRef(false);

  useEffect(() => {
    if (firedRef.current) return;
    let plan: string | null = null;
    try {
      plan = localStorage.getItem("lavorai.selectedPlan");
    } catch {
      return;
    }
    if (!plan || (plan !== "pro" && plan !== "pro_plus")) return;
    firedRef.current = true;
    // Consuma l'intent — così niente loop se checkout fallisce
    try {
      localStorage.removeItem("lavorai.selectedPlan");
    } catch {
      /* noop */
    }
    (async () => {
      try {
        const res = await fetch("/api/stripe/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tier: plan }),
        });
        const body = await res.json().catch(() => ({}));
        if (res.ok && body?.url) {
          window.location.href = body.url;
        }
        // altrimenti fail silent: l'utente può riprovare da /preferences
      } catch {
        /* noop */
      }
    })();
  }, []);

  return null;
}
