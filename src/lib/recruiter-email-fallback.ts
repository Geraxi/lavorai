/**
 * Recruiter-email fallback is opt-in. Default off: skip-list recheck may
 * record a found address but must not queue a send.
 *
 * When enabled, only a posting-specific published inbox is accepted.
 * Generic company contacts are rejected and the reason is recorded.
 */
import type { VerifiedRecruiterEmail } from "@/lib/recruiter-email";

export const GENERIC_COMPANY_LOCALS = [
  "info", "contact", "hello", "support", "privacy", "press", "sales", "admin",
  "noreply", "no-reply", "donotreply", "do-not-reply",
] as const;

const APPLY_NAMED_LOCALS = new Set(["careers", "jobs", "job"]);

const JOB_SPECIFIC_SOURCES = new Set([
  "job_description",
  "employer_job_page",
  "json_ld_application_contact",
]);

export function recruiterEmailFallbackEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  const raw = (env.RECRUITER_EMAIL_FALLBACK_ENABLED ?? "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "on" || raw === "yes";
}

export function postingNamesApplyAddress(
  description: string | null | undefined,
  email: string,
): boolean {
  if (!description?.trim() || !email.trim()) return false;
  const text = description.toLowerCase();
  const addr = email.trim().toLowerCase();
  const local = addr.split("@")[0] ?? "";
  const idx = text.indexOf(addr);
  const window = idx >= 0
    ? text.slice(Math.max(0, idx - 140), idx + addr.length + 50)
    : text;
  if (!/(?:send|invia|apply|candidat|cv\b|curriculum|candidatura)/i.test(window)) return false;
  return idx >= 0 || (local.length >= 3 && text.includes(`${local}@`));
}

export function genericCompanyContactReason(
  email: string,
  postingNamesApply: boolean,
): string | null {
  const local = (email.split("@")[0] ?? "").toLowerCase().split("+")[0];
  if (!local) return "invalid_recipient";
  if (GENERIC_COMPANY_LOCALS.includes(local as (typeof GENERIC_COMPANY_LOCALS)[number])
    || local.startsWith("noreply") || local.startsWith("no-reply")) {
    return "generic_company_contact";
  }
  if (APPLY_NAMED_LOCALS.has(local) && !postingNamesApply) return "generic_careers_inbox";
  return null;
}

export function postingSpecificRecruiterDecision(
  hit: Pick<VerifiedRecruiterEmail, "email" | "provenance">,
  job: { description?: string | null },
): { ok: true } | { ok: false; reason: string } {
  const named = postingNamesApplyAddress(job.description, hit.email);
  const generic = genericCompanyContactReason(hit.email, named);
  if (generic) return { ok: false, reason: generic };
  const jobSpecific = JOB_SPECIFIC_SOURCES.has(hit.provenance.sourceType)
    || hit.provenance.extraction === "json_ld_application_contact"
    || named;
  if (!jobSpecific) return { ok: false, reason: "not_job_specific_inbox" };
  return { ok: true };
}

/** Skip-list may persist a found inbox; queuing a send requires the flag + policy. */
export function skipListEmailSendDecision(
  hit: Pick<VerifiedRecruiterEmail, "email" | "provenance">,
  job: { description?: string | null },
  env: Record<string, string | undefined> = process.env,
): { ok: true } | { ok: false; reason: string } {
  if (!recruiterEmailFallbackEnabled(env)) return { ok: false, reason: "recruiter_email_fallback_disabled" };
  return postingSpecificRecruiterDecision(hit, job);
}
