import { defineRouting } from "next-intl/routing";

/**
 * i18n config: italiano è il default (lavorai.it è italiano),
 * inglese a /en/*. Geo-detect su Vercel reindirizza visitatori non-IT
 * su /en al primo accesso (vedi src/middleware.ts).
 */
// LANCIO: solo italiano. "en" rimosso dalla list finché messages/en.json
// non è completamente tradotto (oggi contiene ~80% stringhe IT — vedi
// TODO-LAUNCH.md per il piano di unfreeze).
export const routing = defineRouting({
  locales: ["it"],
  defaultLocale: "it",
  localePrefix: "as-needed",
});

export type Locale = (typeof routing.locales)[number];
