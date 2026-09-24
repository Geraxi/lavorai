"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLocale } from "next-intl";

const KEY = "lavorai-cookie-consent";

/** Consent esplicito per strumenti esterni di analytics e advertising. */
export function CookieBanner() {
  const [visible, setVisible] = useState(false);
  const en = useLocale() === "en";

  useEffect(() => {
    const saved = localStorage.getItem(KEY);
    if (!saved) setVisible(true);
  }, []);

  if (!visible) return null;

  function choose(value: "accepted" | "essential") {
    localStorage.setItem(KEY, value);
    window.dispatchEvent(new CustomEvent("lavorai-consent-changed", { detail: value }));
    setVisible(false);
  }

  return (
    <>
      <div
        role="dialog"
        aria-label={en ? "Cookie notice" : "Informativa cookie"}
        className="lavorai-cookie-banner"
      >
        <div style={{ flex: 1, lineHeight: 1.5 }}>
          {en
            ? "We use essential cookies for login and preferences. With your permission, optional Google and Meta tools help us measure and improve results. See the "
            : "Usiamo cookie essenziali per accesso e preferenze. Con il tuo consenso, gli strumenti facoltativi di Google e Meta ci aiutano a misurare e migliorare i risultati. Vedi la "}
          <Link href="/privacy" style={{ color: "var(--fg-muted)" }}>
            {en ? "privacy policy" : "informativa privacy"}
          </Link>
          .
        </div>
        <div className="lavorai-cookie-actions">
          <button
            type="button"
            className="ds-btn ds-btn-sm"
            onClick={() => choose("essential")}
          >
            {en ? "Essential only" : "Solo essenziali"}
          </button>
          <button
            type="button"
            className="ds-btn ds-btn-primary ds-btn-sm"
            onClick={() => choose("accepted")}
          >
            {en ? "Allow analytics" : "Consenti analisi"}
          </button>
        </div>
      </div>
      <style>{`
        .lavorai-cookie-banner {
          position: fixed;
          inset: auto 16px 16px;
          z-index: 90;
          max-width: 620px;
          margin: 0 auto;
          padding: 14px 18px;
          display: flex;
          align-items: center;
          gap: 16px;
          border: 1px solid var(--border-ds);
          border-radius: var(--radius);
          background: var(--bg-elev);
          box-shadow: var(--shadow-lg);
          color: var(--fg);
          font-size: 13px;
        }
        .lavorai-cookie-actions { display: flex; gap: 8px; flex-shrink: 0; }
        @media (max-width: 640px) {
          .lavorai-cookie-banner {
            inset: auto 8px 8px;
            padding: 14px;
            flex-direction: column;
            align-items: stretch;
            gap: 12px;
            font-size: 12.5px;
          }
          .lavorai-cookie-actions { width: 100%; }
          .lavorai-cookie-actions > button { flex: 1; justify-content: center; }
        }
      `}</style>
    </>
  );
}
