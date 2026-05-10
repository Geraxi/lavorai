import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Proxy (ex-middleware in Next 15): due responsabilità accoppiate
 * perché Next supporta un solo proxy file.
 *
 *  1. Auth gate: route protette richiedono una sessione next-auth.
 *     In dev: se NEXTAUTH non è configurata (AUTH_SECRET mancante),
 *     bypassa così il demo user continua a funzionare.
 *
 *  2. Geo-detect i18n: alla prima visita setta il cookie NEXT_LOCALE
 *     in base a `x-vercel-ip-country`. Country = "IT" → italiano,
 *     tutto il resto → inglese. L'utente può sovrascriverlo dal
 *     LanguageSwitcher.
 */

const PROTECTED_PREFIXES = [
  "/dashboard",
  "/applications",
  "/cv",
  "/preferences",
  "/analytics",
  "/inbox",
  "/settings",
];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ── Auth gate ──────────────────────────────────────────────────────
  const needsAuth = PROTECTED_PREFIXES.some((p) => pathname.startsWith(p));
  let response: NextResponse | null = null;
  if (needsAuth && process.env.NODE_ENV === "production") {
    const token =
      request.cookies.get("authjs.session-token")?.value ??
      request.cookies.get("__Secure-authjs.session-token")?.value;
    if (!token) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("next", pathname);
      response = NextResponse.redirect(loginUrl);
    }
  }

  if (!response) response = NextResponse.next();

  // ── Geo-detect i18n cookie (skip su API e asset) ───────────────────
  const skipI18n =
    pathname.startsWith("/api/") ||
    pathname.startsWith("/_next/") ||
    /\.[a-z0-9]+$/i.test(pathname); // file con estensione (favicon, .png, ecc.)

  if (!skipI18n) {
    const existing = request.cookies.get("NEXT_LOCALE")?.value;
    if (existing !== "it" && existing !== "en") {
      const country = (
        request.headers.get("x-vercel-ip-country") ?? ""
      ).toUpperCase();
      const accept = (
        request.headers.get("accept-language") ?? ""
      ).toLowerCase();

      let locale: "it" | "en" = "it";
      if (country && country !== "IT") locale = "en";
      else if (!country && accept.startsWith("en")) locale = "en";

      response.cookies.set("NEXT_LOCALE", locale, {
        path: "/",
        maxAge: 60 * 60 * 24 * 365,
        sameSite: "lax",
      });
    }
  }

  return response;
}

export const config = {
  matcher: [
    // Auth gate paths
    "/dashboard/:path*",
    "/applications/:path*",
    "/cv/:path*",
    "/preferences/:path*",
    "/analytics/:path*",
    "/inbox/:path*",
    "/settings/:path*",
    // Pagine pubbliche per geo-detect i18n cookie
    "/",
    "/login",
    "/signup",
    "/optimize",
    "/onboarding/:path*",
    "/forgot-password",
    "/reset-password",
    "/privacy",
    "/termini",
    "/contatti",
  ],
};
