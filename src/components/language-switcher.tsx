"use client";

import { useLocale, useTranslations } from "next-intl";
import { useTransition } from "react";
import { useRouter } from "next/navigation";

/**
 * Switcher manuale IT ⇄ EN. Setta il cookie `NEXT_LOCALE` e ricarica.
 * Il middleware geo-detect non sovrascrive un cookie già impostato.
 */
export function LanguageSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const t = useTranslations("nav");
  const [pending, start] = useTransition();

  const switchTo = (next: "it" | "en") => {
    if (next === locale) return;
    document.cookie = `NEXT_LOCALE=${next}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
    start(() => router.refresh());
  };

  return (
    <div
      className="flex items-center rounded-md border border-border/50 text-xs"
      style={{ height: 44 }}
    >
      <button
        onClick={() => switchTo("it")}
        aria-label={t("italian")}
        disabled={pending}
        className={`px-2.5 py-1 rounded-l-md transition-colors ${
          locale === "it"
            ? "bg-card text-foreground font-semibold"
            : "text-muted-foreground hover:bg-card/70"
        }`}
      >
        IT
      </button>
      <button
        onClick={() => switchTo("en")}
        aria-label={t("english")}
        disabled={pending}
        className={`px-2.5 py-1 rounded-r-md transition-colors ${
          locale === "en"
            ? "bg-card text-foreground font-semibold"
            : "text-muted-foreground hover:bg-card/70"
        }`}
      >
        EN
      </button>
    </div>
  );
}
