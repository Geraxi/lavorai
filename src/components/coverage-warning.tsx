"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

interface Coverage {
  level: "high" | "medium" | "low";
  expectedSubmitRate: string;
  recommendedMode: "auto" | "hybrid";
  reason: string;
  currentMode: string;
  rolesCount: number;
}

const DISMISS_KEY = "lavorai-coverage-warning-dismissed";

/**
 * Banner ONESTO in-app che mostra all'utente la copertura reale del
 * suo verticale per l'auto-apply. Se coverage=low + mode=auto, warn
 * esplicito con CTA "passa a hybrid".
 *
 * Rende invisibile per: coverage high, utente già in modalità
 * raccomandata, utente ha dismisso.
 *
 * Aggiunto dopo il caso Giuseppe (08/08) per evitare che altri paganti
 * si trovino in silenzio con verticale non coperto.
 */
export function CoverageWarning() {
  const [cov, setCov] = useState<Coverage | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.localStorage.getItem(DISMISS_KEY) === "1") {
      setDismissed(true);
      return;
    }
    fetch("/api/user/coverage")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: Coverage | null) => data && setCov(data))
      .catch(() => {
        /* silenzioso */
      });
  }, []);

  if (dismissed || !cov) return null;
  if (cov.rolesCount === 0) return null; // nessun ruolo → non ha ancora completato onboarding

  // Non renderizzare se già in modalità raccomandata o coverage alta
  const shouldShow =
    cov.level === "low" && cov.currentMode === "auto";
  if (!shouldShow) return null;

  return (
    <div
      role="status"
      aria-label="Avviso copertura auto-apply"
      style={{
        margin: "12px 24px 0",
        padding: "14px 16px",
        borderRadius: 12,
        background: "rgba(234,179,8,0.08)",
        border: "1px solid rgba(234,179,8,0.3)",
        display: "flex",
        alignItems: "flex-start",
        gap: 12,
        flexWrap: "wrap",
      }}
    >
      <span aria-hidden style={{ fontSize: 20, lineHeight: 1 }}>
        ⚠️
      </span>
      <div style={{ flex: "1 1 260px", minWidth: 0 }}>
        <div
          style={{
            fontSize: 13.5,
            fontWeight: 700,
            color: "var(--fg)",
            marginBottom: 4,
          }}
        >
          Il tuo verticale ha auto-submit limitato ({cov.expectedSubmitRate})
        </div>
        <div
          style={{
            fontSize: 12.5,
            color: "var(--fg-muted)",
            lineHeight: 1.55,
          }}
        >
          {cov.reason}
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
        <Link
          href="/preferences"
          style={{
            padding: "8px 14px",
            borderRadius: 8,
            background: "#eab308",
            color: "#0f172a",
            fontSize: 13,
            fontWeight: 700,
            textDecoration: "none",
            whiteSpace: "nowrap",
          }}
        >
          Passa a Hybrid →
        </Link>
        <button
          type="button"
          onClick={() => {
            if (typeof window !== "undefined")
              window.localStorage.setItem(DISMISS_KEY, "1");
            setDismissed(true);
          }}
          aria-label="Nascondi avviso"
          style={{
            padding: "8px 10px",
            borderRadius: 8,
            background: "transparent",
            border: "1px solid var(--border-ds)",
            color: "var(--fg-muted)",
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          ✕
        </button>
      </div>
    </div>
  );
}
