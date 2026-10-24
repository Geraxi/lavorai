/**
 * ATS hosts the auto-apply engine must not queue for portal submit.
 * Default: Ashby public boards (invisible reCAPTCHA). Override with ATS_SKIP_HOSTS
 * (comma-separated hostnames). An explicit empty value disables the defaults.
 */

export const DEFAULT_SKIP_PORTAL_HOSTS = ["ashbyhq.com", "jobs.ashbyhq.com"] as const;
export const PREFERRED_PORTAL_FAMILIES = ["greenhouse", "lever", "workable", "recruitee"] as const;

export const SKIPPED_ATS_MANUAL_MESSAGE =
  "Invio automatico non disponibile su questo portale (CAPTCHA / verifica manuale). Completa la candidatura dal link dell'annuncio. Nessun invio effettuato.";

/** Statuses the cheap skip-list miss may convert into a visible manual handoff. */
export const SKIP_LIST_HANDOFF_FROM_STATUSES = [
  "queued",
  "ready_to_apply",
  "answers_claimed",
  "needs_answers",
] as const;

/** Proof-of-no-send confirmations a paused/resumed skip-list row may already carry. */
export const SKIP_LIST_HANDOFF_CONFIRMATIONS = ["NOT_SUBMITTED", "NEEDS_ANSWERS"] as const;

/** CAS filter: never match a row that may already have crossed a send boundary. */
export function skipListManualHandoffWhere(applicationId: string) {
  return {
    id: applicationId,
    status: { in: [...SKIP_LIST_HANDOFF_FROM_STATUSES] },
    submittedAt: null,
    submittedVia: null,
    canaryLog: null,
    answersUsedJson: null,
    submitStartedAt: null,
    OR: [
      { submitConfirmation: null },
      { submitConfirmation: { in: [...SKIP_LIST_HANDOFF_CONFIRMATIONS] } },
    ],
  };
}

/** Explicit user-action handoff: clear the work lease so the row is not reserved. */
export function skipListManualHandoffData(now = new Date(), extra: { sendFailureReason?: string | null } = {}) {
  return {
    status: "ready_to_apply" as const,
    errorMessage: SKIPPED_ATS_MANUAL_MESSAGE,
    completedAt: now,
    recruiterEmailRecheckedAt: now,
    startedAt: null,
    leaseToken: null,
    leaseExpiresAt: null,
    ...(extra.sendFailureReason ? { sendFailureReason: extra.sendFailureReason } : {}),
  };
}

export function skipPortalHosts(env: Record<string, string | undefined> = process.env): string[] {
  if (!Object.prototype.hasOwnProperty.call(env, "ATS_SKIP_HOSTS")) {
    return [...DEFAULT_SKIP_PORTAL_HOSTS];
  }
  const raw = env.ATS_SKIP_HOSTS ?? "";
  return [...new Set(raw.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean))];
}

export function isSkippedPortalHost(host: string, env: Record<string, string | undefined> = process.env): boolean {
  const h = host.trim().toLowerCase().replace(/\.$/, "");
  return skipPortalHosts(env).some((listed) => h === listed || h.endsWith(`.${listed}`));
}

export function isSkippedPortalUrl(url: string, env: Record<string, string | undefined> = process.env): boolean {
  try {
    return isSkippedPortalHost(new URL(url).hostname, env);
  } catch {
    return false;
  }
}

export function portalFamily(url: string): string {
  const u = url.toLowerCase();
  if (u.includes("greenhouse")) return "greenhouse";
  if (u.includes("lever.co")) return "lever";
  if (u.includes("workable.com")) return "workable";
  if (u.includes("ashbyhq.com")) return "ashby";
  if (u.includes("smartrecruiters.com")) return "smartrecruiters";
  if (u.includes("recruitee.com") || /\/o\/[^/]+/.test(u)) return "recruitee";
  if (u.includes("breezy.hr")) return "breezy";
  if (u.includes("pinpointhq.com")) return "pinpoint";
  if (u.includes("personio.")) return "personio";
  if (u.includes("teamtailor.com")) return "teamtailor";
  if (u.includes("bamboohr.com")) return "bamboohr";
  return "other";
}

/** Higher = enqueue / claim first. Recruiter email and captcha-free ATS win. */
export function jobDeliveryPriority(job: { url: string; recruiterEmail?: string | null }): number {
  let n = 0;
  if (job.recruiterEmail?.trim()) n += 100;
  if ((PREFERRED_PORTAL_FAMILIES as readonly string[]).includes(portalFamily(job.url))) n += 10;
  if (isSkippedPortalUrl(job.url) && !job.recruiterEmail?.trim()) n -= 100;
  return n;
}

export function compareJobsForAutoApply<T extends { url: string; recruiterEmail?: string | null }>(a: T, b: T): number {
  return jobDeliveryPriority(b) - jobDeliveryPriority(a);
}

/** After recruiter-email lookup failed: portal is skip-list and no inbox. */
export function requiresManualAtsHandoff(job: { url: string; recruiterEmail?: string | null }, env: Record<string, string | undefined> = process.env): boolean {
  return isSkippedPortalUrl(job.url, env) && !job.recruiterEmail?.trim();
}
