"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app-error]", error);
  }, [error]);

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        background: "var(--bg)",
      }}
    >
      <div style={{ maxWidth: 480, textAlign: "center" }}>
        <div
          className="mono"
          style={{
            fontSize: 14,
            color: "var(--fg-subtle)",
            marginBottom: 8,
          }}
        >
          500 {error.digest ? `· ${error.digest}` : ""}
        </div>
        <h1
          style={{
            fontSize: 28,
            fontWeight: 600,
            letterSpacing: "-0.025em",
            margin: 0,
          }}
        >
          Qualcosa è andato storto
        </h1>
        <p
          style={{
            marginTop: 10,
            color: "var(--fg-muted)",
            fontSize: 14,
            lineHeight: 1.5,
          }}
        >
          Abbiamo ricevuto la segnalazione. Prova a ricaricare o torna alla
          dashboard.
        </p>
        <div
          style={{
            marginTop: 24,
            display: "flex",
            gap: 8,
            justifyContent: "center",
          }}
        >
          <button type="button" onClick={reset} className="ds-btn">
            Riprova
          </button>
          <Link href="/" className="ds-btn ds-btn-primary">
            Torna alla home
          </Link>
        </div>
      </div>
    </div>
  );
}
