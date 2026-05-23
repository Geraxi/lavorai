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
  // Risoluzione locale (en.json ora tradotto integralmente):
  //   1. Cookie NEXT_LOCALE = scelta esplicita utente (override massimo)
  //   2. Geo Vercel edge: IT → it, qualsiasi altro paese → en
  //   3. Accept-Language fallback (in dev senza geo header)
  //   4. Default it (siamo lavorai.it)
  const c = await cookies();
  const fromCookie = c.get("NEXT_LOCALE")?.value;
  let locale: Locale = "it";

  if (isLocale(fromCookie)) {
    locale = fromCookie;
  } else {
    const h = await headers();
    const country = (h.get("x-vercel-ip-country") ?? "").toUpperCase();
    if (country && country !== "IT") {
      locale = "en";
    } else if (!country) {
      const accept = (h.get("accept-language") ?? "").toLowerCase();
      if (accept.startsWith("en")) locale = "en";
    }
  }

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
