import { defineRouting } from "next-intl/routing";

/**
 * i18n config: italiano è il default (lavorai.it è italiano),
 * inglese a /en/*. Geo-detect su Vercel reindirizza visitatori non-IT
 * su /en al primo accesso (vedi src/middleware.ts).
 */
export const routing = defineRouting({
  locales: ["it", "en"],
  defaultLocale: "it",
  localePrefix: "as-needed",
});

export type Locale = (typeof routing.locales)[number];
