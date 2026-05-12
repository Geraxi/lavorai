"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";

/**
 * Sticky bottom bar che appare quando l'utente scrolla oltre il 60%
 * della pagina. Dismissible con la X (memorizzato in sessionStorage).
 */
export function StickyCta() {
  const t = useTranslations("stickyCta");
  const [show, setShow] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (sessionStorage.getItem("sticky-cta-dismissed") === "1") {
      setDismissed(true);
      return;
    }
    const onScroll = () => {
      const total = document.documentElement.scrollHeight - window.innerHeight;
      const pct = total > 0 ? window.scrollY / total : 0;
      setShow(pct > 0.6);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (dismissed || !show) return null;

  return (
    <div
      role="region"
      aria-label="Banner promo"
      style={{
        position: "fixed",
        left: 16,
        right: 16,
        bottom: 16,
        zIndex: 60,
        margin: "0 auto",
        maxWidth: 720,
        borderRadius: 14,
        border: "1px solid rgba(255,255,255,0.15)",
        background: "rgba(255,255,255,0.03)",
        backdropFilter: "blur(40px) saturate(200%)",
        WebkitBackdropFilter: "blur(40px) saturate(200%)",
        boxShadow: "0 32px 64px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.1)",
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "12px 14px 12px 18px",
        fontSize: 14,
      }}
    >
      <span
        aria-hidden
        style={{
          width: 8,
          height: 8,
          borderRadius: 999,
          background: "hsl(var(--primary))",
          boxShadow: "0 0 8px hsl(var(--primary) / 0.7)",
          flex: "none",
        }}
      />
      <span style={{ flex: 1, lineHeight: 1.4 }}>
        {t.rich("message", {
          strong: (chunks) => <strong>{chunks}</strong>,
        })}
      </span>
      <Link
        href="/optimize"
        className="ds-btn ds-btn-sm ds-btn-primary"
        style={{ flex: "none", whiteSpace: "nowrap" }}
      >
        {t("cta")}
      </Link>
      <button
        type="button"
        aria-label={t("dismiss")}
        onClick={() => {
          setDismissed(true);
          if (typeof sessionStorage !== "undefined") {
            sessionStorage.setItem("sticky-cta-dismissed", "1");
          }
        }}
        style={{
          flex: "none",
          width: 26,
          height: 26,
          borderRadius: 6,
          border: "1px solid var(--border-ds)",
          background: "transparent",
          color: "var(--fg-muted)",
          cursor: "pointer",
          fontSize: 13,
          lineHeight: 1,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        ✕
      </button>
    </div>
  );
}
