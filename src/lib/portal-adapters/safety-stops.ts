/**
 * Hard safety stops for portal automation. Independently specified — we never
 * grant camera/mic/location, never do video/selfie/ID verification, never
 * sign up for contractor marketplaces, never attempt SSO login.
 * No captcha-solving service.
 */

export const MARKETPLACE_HOSTS = [
  "mercor.com", "toptal.com", "upwork.com", "freelancer.com", "fiverr.com",
  "guru.com", "peopleperhour.com", "toptal.net",
] as const;

export const UNSAFE_PERMISSIONS = ["camera", "microphone", "geolocation"] as const;

const SSO_RE = /\b(?:sign in with (?:google|microsoft|apple|linkedin|okta|onelogin|auth0)|continue with (?:google|microsoft|apple|linkedin)|accedi con (?:google|microsoft|apple|linkedin)|sso|single sign[- ]on|saml)\b/i;
const ID_VERIFY_RE = /\b(?:video (?:interview|selfie)|record a (?:video|selfie)|take a selfie|liveness|id verification|identity verification|upload (?:your )?(?:passport|driver'?s license|government id)|verifica (?:identit[aà]|documento)|foto tessera|riconoscimento facciale)\b/i;
const NOT_A_JOB_RE = /\b(?:create (?:an )?account to (?:apply|continue)|join our talent (?:network|community)|contractor marketplace|become a freelancer)\b/i;
const LOGIN_WALL_RE = /\b(?:sign in to (?:continue|apply)|log in to (?:continue|apply)|accedi per (?:continuare|candidarti)|please (?:log|sign) in)\b/i;
const NOT_ELIGIBLE_RE = /\b(?:you (?:do not|don't) meet|not eligible|we are (?:only|not) (?:hiring|accepting).{0,40}(?:location|work (?:auth|permit)|visa|citizenship)|requisiti (?:non |di (?:residenza|visto)))\b/i;

export function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

export function isContractorMarketplace(url: string): boolean {
  const host = hostOf(url);
  if (!host) return false;
  return MARKETPLACE_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
}

export function isSsoLoginPrompt(text: string): boolean {
  return SSO_RE.test(text);
}

export function isIdOrVideoVerification(text: string): boolean {
  return ID_VERIFY_RE.test(text);
}

export function isNotAJobApplication(text: string): boolean {
  return NOT_A_JOB_RE.test(text);
}

export function isLoginWall(text: string): boolean {
  return LOGIN_WALL_RE.test(text);
}

export function isNotEligiblePrompt(text: string): boolean {
  return NOT_ELIGIBLE_RE.test(text);
}

export type SafetyStop =
  | { outcome: "FAILED:marketplace"; error: string }
  | { outcome: "FAILED:sso_required"; error: string }
  | { outcome: "FAILED:id_verification"; error: string }
  | { outcome: "FAILED:not_a_job_application"; error: string }
  | { outcome: "FAILED:unsafe_permissions"; error: string }
  | { outcome: "LOGIN_REQUIRED"; error: string }
  | { outcome: "NOT_ELIGIBLE"; error: string };

export function pageSafetyStop(url: string, bodyText: string): SafetyStop | null {
  if (isContractorMarketplace(url)) {
    return { outcome: "FAILED:marketplace", error: "Contractor marketplace: we never create accounts on Mercor, Toptal, Upwork or similar. Nothing was sent." };
  }
  const text = bodyText.slice(0, 8_000);
  if (isIdOrVideoVerification(text)) {
    return { outcome: "FAILED:id_verification", error: "Video, selfie or ID verification requested. We never complete identity checks. Nothing was sent." };
  }
  if (isSsoLoginPrompt(text)) {
    return { outcome: "FAILED:sso_required", error: "SSO / social login required. We never sign in with Google, Microsoft or similar. Nothing was sent." };
  }
  if (isNotAJobApplication(text)) {
    return { outcome: "FAILED:not_a_job_application", error: "This page is not a job application form. Nothing was sent." };
  }
  if (isLoginWall(text)) {
    return { outcome: "LOGIN_REQUIRED", error: "The portal requires an account login before apply. Nothing was sent." };
  }
  if (isNotEligiblePrompt(text)) {
    return { outcome: "NOT_ELIGIBLE", error: "The posting rejects this location or work-authorisation profile. Nothing was sent." };
  }
  return null;
}

/** Playwright: refuse camera / microphone / geolocation. Never grant. */
export async function denyUnsafePermissions(context: {
  grantPermissions?: (permissions: string[], options?: { origin?: string }) => Promise<void>;
  clearPermissions?: () => Promise<void>;
}): Promise<void> {
  if (typeof context.clearPermissions === "function") {
    await context.clearPermissions().catch(() => void 0);
  }
  // Do not call grantPermissions for camera/microphone/geolocation.
  void context.grantPermissions;
}

export function isUnsafePermissionName(name: string): boolean {
  return (UNSAFE_PERMISSIONS as readonly string[]).includes(name);
}
