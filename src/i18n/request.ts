import { getRequestConfig } from "next-intl/server";
import { cookies, headers } from "next/headers";

const SUPPORTED = ["it", "en"] as const;
type Locale = (typeof SUPPORTED)[number];

/**
 * Risolve il locale per ogni request server-side, senza modificare gli URL:
 *   1. Cookie `NEXT_LOCALE` (override esplicito dell'utente)
 *   2. Header `x-vercel-ip-country` (geo Vercel edge) → IT default, altri → EN
 *   3. Header `Accept-Language` fallback
 *   4. Default `it` (siamo lavorai.it)
 *
 * Il middleware imposta il cookie alla prima visita basandosi sul geo,
 * così pageload successivi non rifanno il check.
 */
function isLocale(v: string | undefined | null): v is Locale {
  return !!v && (SUPPORTED as readonly string[]).includes(v);
}

export default getRequestConfig(async () => {
  // LANCIO: locale fissato a "it" finché messages/en.json non è tradotto
  // completamente. La detection geo + cookie resta cablata sotto (chiamata
  // a cookies/headers per side-effects RSC e non rompere le firme) ma
  // qualsiasi valore viene scartato. Sblocchiamo `en` quando le stringhe
  // sono state tradotte e QA'd — vedi TODO-LAUNCH.md.
  await cookies();
  await headers();
  const locale: Locale = "it";

  // riferimenti tenuti vivi per evitare warning "unused" durante il freeze.
  void isLocale;

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
