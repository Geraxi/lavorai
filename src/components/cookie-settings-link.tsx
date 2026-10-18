"use client";

import { useLocale } from "next-intl";
import { OPEN_COOKIE_SETTINGS_EVENT } from "@/lib/consent/state";
import { currentConsentNotice } from "@/lib/consent/notice";

/** Persistent "Cookie settings" entry: opens preferences without resetting the saved choice. */
export function CookieSettingsLink({ className, style }: { className?: string; style?: React.CSSProperties }) {
  const en = useLocale() === "en";
  const text = currentConsentNotice().text[en ? "en" : "it"];
  return (
    <button
      type="button"
      className={className}
      style={{ background: "none", border: 0, padding: 0, font: "inherit", color: "inherit", cursor: "pointer", textAlign: "left", ...style }}
      onClick={() => window.dispatchEvent(new CustomEvent(OPEN_COOKIE_SETTINGS_EVENT))}
    >
      {text.settingsLink}
    </button>
  );
}

export function openCookieSettings() {
  window.dispatchEvent(new CustomEvent(OPEN_COOKIE_SETTINGS_EVENT));
}
