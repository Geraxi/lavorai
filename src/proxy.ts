import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/db";
import { isApplicationAccessPaused } from "@/lib/billing";
import { isAdmin } from "@/lib/admin";
import { requiresTrialAccess } from "@/lib/trial-access";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isBotUserAgent } from "@/lib/bot-ua";
import { ATTRIB_COOKIE, ATTRIB_MAX_AGE_SECONDS, buildAttribPayload } from "@/lib/signup-attribution";

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

  // Un solo dominio canonico. Ha effetto non appena www.lavorai.it viene
  // assegnato a questo progetto Vercel (oggi punta ancora al vecchio sito).
  // Mai redirigere /api/*: Stripe (e altri webhook) non seguono i 308, quindi
  // /api/stripe/webhook su www.lavorai.it fallirebbe con ogni evento.
  const requestHost = request.headers.get("host")?.split(":")[0]?.toLowerCase();
  const isApi = pathname === "/api" || pathname.startsWith("/api/");
  if (!isApi && (requestHost === "www.lavorai.it" || request.nextUrl.hostname.toLowerCase() === "www.lavorai.it")) {
    const canonical = request.nextUrl.clone();
    canonical.hostname = "lavorai.it";
    canonical.port = "";
    return NextResponse.redirect(canonical, 308);
  }

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

  if (!response && requiresTrialAccess(pathname)) {
    const secureCookie = request.cookies.getAll().some(({ name }) => name.startsWith("__Secure-authjs.session-token"));
    const token = await getToken({ req: request, secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET, secureCookie });
    if (token?.sub) {
      const user = await prisma.user.findUnique({ where: { id: token.sub } });
      if (user && !isAdmin(user.email) && isApplicationAccessPaused(user)) {
        return pathname.startsWith("/api/")
          ? NextResponse.json({ error: "trial_expired", message: "Free trial expired", redirect: "/trial-expired" }, { status: 402 })
          : NextResponse.redirect(new URL("/trial-expired", request.url));
      }
    }
  }

  if (!response) response = NextResponse.next();

  // ── Geo-detect i18n cookie (skip su API e asset) ───────────────────
  const skipI18n =
    pathname.startsWith("/api/") ||
    pathname.startsWith("/_next/") ||
    /\.[a-z0-9]+$/i.test(pathname); // file con estensione (favicon, .png, ecc.)

  // I crawler non ricevono cookie di lingua: vedono sempre l'italiano
  // (vedi src/i18n/request.ts). Senza questo Googlebot, che esplora da IP
  // USA, indicizzerebbe la versione inglese di lavorai.it.
  const isBot = isBotUserAgent(request.headers.get("user-agent"));

  // ── First-touch attribution (landing page / UTM / referrer) ─────────
  // Set server-side on the first real page request so it is captured even
  // if the visitor signs up (e.g. with Google) before <TrackAttribution/>
  // hydrates. Never overwritten: first-touch. Prefetches are skipped.
  const isPrefetch =
    request.headers.get("next-router-prefetch") === "1" ||
    request.headers.get("purpose") === "prefetch" ||
    request.headers.get("sec-purpose")?.includes("prefetch");
  if (
    !skipI18n &&
    !isBot &&
    !isPrefetch &&
    request.method === "GET" &&
    !request.cookies.get(ATTRIB_COOKIE)
  ) {
    const payload = buildAttribPayload({
      referrer: request.headers.get("referer"),
      currentHost: requestHost ?? request.nextUrl.hostname,
      search: request.nextUrl.search,
      pathname,
    });
    if (payload) {
      response.cookies.set(ATTRIB_COOKIE, payload, {
        path: "/",
        maxAge: ATTRIB_MAX_AGE_SECONDS,
        sameSite: "lax",
      });
    }
  }

  if (!skipI18n && !isBot) {
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
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
