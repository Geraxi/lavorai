import { defineRouting } from "next-intl/routing";

/**
 * i18n config: italiano è il default (lavorai.it è italiano),
 * inglese a /en/*. Geo-detect su Vercel reindirizza visitatori non-IT
 * su /en al primo accesso (vedi src/middleware.ts).
 */
// it = default. en riabilitato dopo traduzione completa di
// messages/en.json (418 chiavi, tutte EN native). Detection geo +
// cookie + Accept-Language gestita in src/i18n/request.ts.
export const routing = defineRouting({
  locales: ["it", "en"],
  defaultLocale: "it",
  localePrefix: "as-needed",
});

export type Locale = (typeof routing.locales)[number];
