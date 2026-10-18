/**
 * Region detection for consent.
 *
 * The handoff asked for a same-origin `/cdn-cgi/trace` fetch. LavorAI runs on
 * Vercel (not behind Cloudflare), so that path 404s. Instead `/api/geo`
 * (same origin) answers in the SAME `key=value` trace format, filled from
 * Vercel's `x-vercel-ip-country` edge header. The client parses `loc=` exactly
 * as it would from Cloudflare, so moving behind Cloudflare later only means
 * changing GEO_TRACE_PATH.
 *
 * Unknown, failed, timed-out, `XX` (unknown) and `T1` (Tor) all resolve to
 * "consent required" so the banner is shown and advertising stays off.
 */

export const GEO_TRACE_PATH = "/api/geo";
export const GEO_TIMEOUT_MS = 2000;
export const REGION_SESSION_KEY = "lavorai-consent-region";

/** EU 27 + EEA (IS, LI, NO) + UK + Switzerland. */
export const CONSENT_REQUIRED_COUNTRIES: ReadonlySet<string> = new Set([
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT",
  "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE",
  "IS", "LI", "NO",
  "GB", "CH",
]);

export interface ResolvedRegion {
  /** ISO 3166-1 alpha-2 when known; null when unresolved. */
  country: string | null;
  requiresConsent: boolean;
}

/** Extracts a usable country from a trace body (`loc=IT`). Null when unusable. */
export function parseTraceLoc(body: string | null | undefined): string | null {
  if (!body) return null;
  for (const line of body.split(/\r?\n/)) {
    const idx = line.indexOf("=");
    if (idx <= 0) continue;
    if (line.slice(0, idx).trim() !== "loc") continue;
    const value = line.slice(idx + 1).trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(value)) return null;
    if (value === "XX" || value === "T1") return null;
    return value;
  }
  return null;
}

export function regionFromCountry(country: string | null): ResolvedRegion {
  if (!country) return { country: null, requiresConsent: true };
  return { country, requiresConsent: CONSENT_REQUIRED_COUNTRIES.has(country) };
}

type FetchLike = (input: string, init?: { signal?: AbortSignal; cache?: RequestCache; credentials?: RequestCredentials }) => Promise<{ ok: boolean; text(): Promise<string> }>;

export async function fetchRegion(
  fetchImpl: FetchLike,
  timeoutMs = GEO_TIMEOUT_MS,
): Promise<ResolvedRegion> {
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    const timeout = new Promise<null>((resolve) => {
      timer = setTimeout(() => {
        controller?.abort();
        resolve(null);
      }, timeoutMs);
    });
    const request = (async () => {
      const res = await fetchImpl(GEO_TRACE_PATH, { signal: controller?.signal, cache: "no-store", credentials: "same-origin" });
      if (!res.ok) return null;
      return parseTraceLoc(await res.text());
    })().catch(() => null);
    const country = await Promise.race([request, timeout]);
    return regionFromCountry(country);
  } catch {
    return regionFromCountry(null);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

interface SessionStore { getItem(k: string): string | null; setItem(k: string, v: string): void }

/**
 * Resolve once per visit: memory → sessionStorage → network. Only a resolved
 * country is cached; an unresolved result is retried on the next visit.
 */
export async function resolveRegionForVisit(
  fetchImpl: FetchLike,
  session: SessionStore | null,
  timeoutMs = GEO_TIMEOUT_MS,
): Promise<ResolvedRegion> {
  try {
    const cached = session?.getItem(REGION_SESSION_KEY);
    if (cached && /^[A-Z]{2}$/.test(cached)) return regionFromCountry(parseTraceLoc(`loc=${cached}`));
  } catch {
    /* storage blocked */
  }
  const region = await fetchRegion(fetchImpl, timeoutMs);
  if (region.country) {
    try { session?.setItem(REGION_SESSION_KEY, region.country); } catch { /* storage blocked */ }
  }
  return region;
}
