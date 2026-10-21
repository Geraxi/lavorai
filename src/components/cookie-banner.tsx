"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLocale } from "next-intl";
import { useConsent } from "@/components/consent/use-consent";
import { saveConsent } from "@/lib/consent/client-store";
import { currentConsentNotice, type ConsentPurpose } from "@/lib/consent/notice";
import { OPEN_COOKIE_SETTINGS_EVENT, type ConsentChoice } from "@/lib/consent/state";

/**
 * Consent banner + preferences dialog.
 * - Shown in every region until both purposes are answered.
 * - Accept and Reject have identical styling and weight.
 * - Analytics and advertising are separate choices.
 * - "Cookie settings" (footer, settings page, privacy page) reopens the
 *   preferences with the saved answers pre-filled; it never resets them.
 */
export function CookieBanner() {
  const { answers, effective } = useConsent();
  const en = useLocale() === "en";
  const text = currentConsentNotice().text[en ? "en" : "it"];
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [draft, setDraft] = useState<Record<ConsentPurpose, boolean>>({ analytics: false, advertising: false });

  function openPrefs() {
    // Pre-fill with what is in force: an unanswered purpose starts OFF.
    setDraft({ analytics: answers.analytics === "granted", advertising: answers.advertising === "granted" });
    setPrefsOpen(true);
  }

  useEffect(() => {
    const onOpen = () => openPrefs();
    window.addEventListener(OPEN_COOKIE_SETTINGS_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_COOKIE_SETTINGS_EVENT, onOpen);
  });

  function choose(next: Record<ConsentPurpose, ConsentChoice>, source: "banner" | "settings") {
    saveConsent(next, source);
    setPrefsOpen(false);
  }
  const all = (c: ConsentChoice) => ({ analytics: c, advertising: c });

  if (prefsOpen) {
    return (
      <>
        <div role="dialog" aria-modal="true" aria-labelledby="lavorai-cookie-prefs-title" className="lavorai-cookie-banner lavorai-cookie-prefs">
          <div style={{ display: "flex", flexDirection: "column", gap: 12, width: "100%" }}>
            <div id="lavorai-cookie-prefs-title" style={{ fontWeight: 600, fontSize: 14 }}>{text.settingsLink}</div>
            <p style={{ margin: 0, lineHeight: 1.5 }}>{text.body}</p>
            <label className="lavorai-cookie-row">
              <input type="checkbox" checked disabled aria-describedby="lavorai-cookie-essential" />
              <span>
                <strong>{en ? "Essential" : "Necessari"}</strong>
                <span id="lavorai-cookie-essential" className="lavorai-cookie-desc">
                  {en ? "Login, security and language. Always on." : "Accesso, sicurezza e lingua. Sempre attivi."}
                </span>
              </span>
            </label>
            {(["analytics", "advertising"] as const).map((p) => (
              <label key={p} className="lavorai-cookie-row">
                <input
                  type="checkbox"
                  name={`consent-${p}`}
                  checked={draft[p]}
                  onChange={(e) => setDraft((d) => ({ ...d, [p]: e.target.checked }))}
                />
                <span>
                  <strong>{text.purposes[p].label}</strong>
                  <span className="lavorai-cookie-desc">
                    {text.purposes[p].description} {en ? "Recipients" : "Destinatari"}: {text.purposes[p].recipients}.
                  </span>
                </span>
              </label>
            ))}
            <Link href="/privacy" className="lavorai-cookie-link">{text.privacyLink}</Link>
            <div className="lavorai-cookie-actions">
              <button type="button" className="ds-btn ds-btn-sm" onClick={() => choose(all("denied"), "settings")}>{text.choices.rejectAll}</button>
              <button type="button" className="ds-btn ds-btn-sm" onClick={() => choose(all("granted"), "settings")}>{text.choices.acceptAll}</button>
              <button
                type="button"
                className="ds-btn ds-btn-sm"
                onClick={() => choose({ analytics: draft.analytics ? "granted" : "denied", advertising: draft.advertising ? "granted" : "denied" }, "settings")}
              >
                {text.choices.save}
              </button>
            </div>
            <button type="button" className="lavorai-cookie-close" aria-label={text.choices.close} onClick={() => setPrefsOpen(false)}>×</button>
          </div>
        </div>
        <BannerStyles />
      </>
    );
  }

  if (!effective.showBanner) return null;

  return (
    <>
      <div role="dialog" aria-label={text.title} className="lavorai-cookie-banner">
        <div style={{ flex: 1, lineHeight: 1.5 }}>
          {text.body}{" "}
          <Link href="/privacy" className="lavorai-cookie-link">{text.privacyLink}</Link>.
        </div>
        <div className="lavorai-cookie-actions">
          <button type="button" className="ds-btn ds-btn-sm" onClick={() => choose(all("denied"), "banner")}>{text.choices.rejectAll}</button>
          <button type="button" className="ds-btn ds-btn-sm" onClick={() => choose(all("granted"), "banner")}>{text.choices.acceptAll}</button>
          <button type="button" className="ds-btn ds-btn-sm lavorai-cookie-customize" onClick={openPrefs}>{text.choices.customize}</button>
        </div>
      </div>
      <BannerStyles />
    </>
  );
}

function BannerStyles() {
  return (
    <style>{`
      .lavorai-cookie-banner {
        position: fixed;
        inset: auto 28px 28px auto;
        z-index: 90;
        max-width: 520px;
        margin: 0;
        padding: 12px 14px;
        display: flex;
        flex-direction: column;
        align-items: stretch;
        gap: 12px;
        border: 1px solid var(--border-ds);
        border-radius: 4px;
        background: rgba(4, 12, 21, .92);
        backdrop-filter: blur(16px);
        box-shadow: var(--shadow-lg);
        color: #F4F7FA;
        font-size: 13px;
      }
      /* The panel is always dark, so text colours are fixed rather than theme
         variables (the light theme's --fg made the copy unreadable). */
      .lavorai-cookie-banner strong { color: #FFFFFF; }
      .lavorai-cookie-link { color: #BFE9CF; text-decoration: underline; text-underline-offset: 3px; }
      .lavorai-cookie-link:hover { color: #FFFFFF; }
      .lavorai-cookie-banner .ds-btn { background: #D3EBDC; border: 1px solid #D3EBDC; color: #0B1A14; }
      .lavorai-cookie-banner .ds-btn:hover { background: #FFFFFF; border-color: #FFFFFF; }
      .lavorai-cookie-prefs { max-width: 460px; padding: 16px; }
      .lavorai-cookie-actions { display: flex; gap: 8px; flex-shrink: 0; flex-wrap: wrap; }
      .lavorai-cookie-actions > .ds-btn { flex: 1; justify-content: center; }
      .lavorai-cookie-actions > .lavorai-cookie-customize { flex-basis: 100%; }
      .lavorai-cookie-row { display: flex; gap: 10px; align-items: flex-start; cursor: pointer; }
      .lavorai-cookie-row input { margin-top: 3px; }
      .lavorai-cookie-desc { display: block; color: #C9D3DD; font-size: 12px; line-height: 1.45; margin-top: 2px; }
      .lavorai-cookie-close { position: absolute; top: 6px; right: 10px; background: none; border: 0; color: #C9D3DD; font-size: 18px; cursor: pointer; }
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
      }
    `}</style>
  );
}
