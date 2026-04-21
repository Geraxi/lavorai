"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const KEY = "lavorai-cookie-consent";

/**
 * GDPR cookie banner — essential only (no analytics/marketing cookies
 * in this version, quindi il banner è solo notifica + accept).
 * Quando aggiungi analytics: estendere con granular consent (categorie).
 */
export function CookieBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(KEY);
    if (!saved) setVisible(true);
  }, []);

  if (!visible) return null;

  function accept() {
    localStorage.setItem(KEY, "accepted");
    setVisible(false);
  }

  return (
    <div
      role="dialog"
      aria-label="Informativa cookie"
      style={{
        position: "fixed",
        bottom: 16,
        left: 16,
        right: 16,
        zIndex: 90,
        maxWidth: 560,
        margin: "0 auto",
        background: "var(--bg-elev)",
        border: "1px solid var(--border-ds)",
        borderRadius: "var(--radius)",
        boxShadow: "var(--shadow-lg)",
        padding: "14px 18px",
        display: "flex",
        alignItems: "center",
        gap: 16,
        color: "var(--fg)",
        fontSize: 13,
      }}
    >
      <div style={{ flex: 1, lineHeight: 1.5 }}>
        Usiamo solo cookie tecnici essenziali per autenticazione e
        preferenze. Nessun tracker di marketing o profilazione. Vedi la{" "}
        <Link href="/privacy" style={{ color: "var(--fg-muted)" }}>
          privacy policy
        </Link>
        .
      </div>
      <button
        type="button"
        className="ds-btn ds-btn-primary ds-btn-sm"
        onClick={accept}
      >
        Ho capito
      </button>
    </div>
  );
}
