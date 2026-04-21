import type { NextRequest } from "next/server";

/**
 * CSRF leggero via Origin/Referer check.
 * Usa-lo su endpoint custom che modificano stato ma non sono protetti
 * da NextAuth (signup, password reset, GDPR delete, ecc.).
 *
 * Funziona insieme a cookie SameSite=Lax (default Next.js) come difesa
 * in profondità.
 */
export function checkOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  const host = request.headers.get("host");
  if (!host) return false;

  // Lista di host accettabili: host attuale + AUTH_URL/SITE_URL se configurati
  const allowed = new Set<string>();
  allowed.add(host);
  for (const envUrl of [
    process.env.AUTH_URL,
    process.env.NEXT_PUBLIC_SITE_URL,
  ]) {
    if (!envUrl) continue;
    try {
      allowed.add(new URL(envUrl).host);
    } catch {
      // ignore malformed env
    }
  }

  const checkHost = (urlStr: string | null) => {
    if (!urlStr) return false;
    try {
      return allowed.has(new URL(urlStr).host);
    } catch {
      return false;
    }
  };

  if (origin) return checkHost(origin);
  if (referer) return checkHost(referer);
  // Niente Origin né Referer: tipico di alcuni browser/extension.
  // In dev passiamo, in prod rifiutiamo.
  return process.env.NODE_ENV !== "production";
}
