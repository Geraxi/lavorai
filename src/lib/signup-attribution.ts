/**
 * First-touch signup attribution, shared by:
 *  - src/proxy.ts            → sets `lv_attrib` server-side on the first page request
 *                              (works before JS hydrates, keeps the real Referer header)
 *  - <TrackAttribution/>     → client fallback, same format, never overwrites
 *  - /api/auth/signup        → email/password signups
 *  - lib/auth.ts createUser  → Google / magic-link signups (previously not attributed)
 *
 * Cookie payload (pipe-separated, URI-encoded values):
 *   "r=google.com|s=cpc|m=paid|c=brand|p=/auto-candidatura"
 *
 * Pure functions only: no Next/Prisma imports, so it is unit-testable.
 */
export const ATTRIB_COOKIE = "lv_attrib";
export const ATTRIB_MAX_AGE_SECONDS = 30 * 24 * 3600;

export interface SignupAttribution {
  signupReferrer: string | null;
  signupUtmSource: string | null;
  signupUtmMedium: string | null;
  signupUtmCampaign: string | null;
  signupLandingPath: string | null;
}

export function normalizeHost(urlOrHost: string | null | undefined): string {
  if (!urlOrHost) return "";
  try {
    const host = urlOrHost.includes("://") ? new URL(urlOrHost).hostname : urlOrHost;
    return host.toLowerCase().replace(/:\d+$/, "").replace(/^www\./, "");
  } catch {
    return "";
  }
}

/** Builds the cookie value from the first page the visitor landed on. */
export function buildAttribPayload(input: {
  referrer: string | null | undefined;
  currentHost: string | null | undefined;
  search: string;
  pathname: string;
}): string {
  const params = new URLSearchParams(input.search);
  const referrerHost = normalizeHost(input.referrer);
  const currentHost = normalizeHost(input.currentHost);
  // A referrer on our own domain is not an external source.
  const externalReferrer = referrerHost && referrerHost !== currentHost ? referrerHost : "";
  const data: Record<string, string> = {
    r: externalReferrer || "direct",
    s: (params.get("utm_source") || "").slice(0, 60),
    m: (params.get("utm_medium") || "").slice(0, 60),
    c: (params.get("utm_campaign") || "").slice(0, 80),
    p: (input.pathname || "/").slice(0, 120),
  };
  return Object.entries(data)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join("|");
}

/** Parses the cookie into the User.signup* fields (null when absent). */
export function parseAttribCookie(raw: string | null | undefined): SignupAttribution {
  const attrib: Record<string, string> = {};
  for (const pair of (raw ?? "").split("|")) {
    const idx = pair.indexOf("=");
    if (idx <= 0) continue;
    const k = pair.slice(0, idx);
    const v = pair.slice(idx + 1);
    if (!v) continue;
    try {
      attrib[k] = decodeURIComponent(v).slice(0, 120);
    } catch {
      /* malformed value: skip */
    }
  }
  return {
    signupReferrer: attrib.r ?? null,
    signupUtmSource: attrib.s ?? null,
    signupUtmMedium: attrib.m ?? null,
    signupUtmCampaign: attrib.c ?? null,
    signupLandingPath: attrib.p ?? null,
  };
}

/**
 * Plan chosen before an OAuth signup, recovered from the NextAuth
 * callback-url cookie (e.g. "/settings?upgrade=pro_plus"). Best-effort.
 */
export function planFromCallbackUrl(raw: string | null | undefined): "free" | "pro" | "pro_plus" {
  if (!raw) return "free";
  try {
    const url = new URL(decodeURIComponent(raw), "https://lavorai.it");
    const plan = url.searchParams.get("upgrade") ?? url.searchParams.get("plan");
    return plan === "pro" || plan === "pro_plus" ? plan : "free";
  } catch {
    return "free";
  }
}
