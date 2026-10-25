import { hasVerifiedSubmissionReceipt } from "@/lib/submission-receipt";

/**
 * Standardised submit-attempt outcomes. Every portal/email attempt ends in
 * exactly one of these. Stored on Application.submitConfirmation (except
 * APPLIED, which is derived from a stored ATS receipt or destination response).
 * MAILBOX_NO_BOUNCE / EMAIL_SENT / DETECTED_* without a stored receipt are
 * never APPLIED.
 *
 * No new database columns.
 */
export const STANDARD_ATTEMPT_OUTCOMES = [
  "APPLIED",
  "EXPIRED",
  "CAPTCHA",
  "LOGIN_REQUIRED",
  "NOT_ELIGIBLE",
  "NEEDS_ANSWERS",
] as const;

export const FAILED_REASONS = [
  "page_error",
  "stuck",
  "unsafe_permissions",
  "not_a_job_application",
  "sso_required",
  "marketplace",
  "id_verification",
  "unknown",
] as const;

export type StandardAttemptOutcome = (typeof STANDARD_ATTEMPT_OUTCOMES)[number];
export type FailedReason = (typeof FAILED_REASONS)[number] | (string & {});
export type AttemptOutcome = StandardAttemptOutcome | `FAILED:${string}`;

export function failedOutcome(reason: string): `FAILED:${string}` {
  const clean = reason.replace(/[^a-z0-9_:-]/gi, "_").slice(0, 48).toLowerCase() || "unknown";
  return `FAILED:${clean}`;
}

export function isFailedOutcome(value: string | null | undefined): value is `FAILED:${string}` {
  return !!value && value.startsWith("FAILED:");
}

export function failedReasonOf(value: string | null | undefined): string | null {
  return isFailedOutcome(value) ? value.slice("FAILED:".length) : null;
}

/** Values we persist on submitConfirmation for a non-applied outcome. */
export function persistAttemptConfirmation(outcome: AttemptOutcome): string {
  if (outcome === "APPLIED") {
    throw new Error("APPLIED is derived from DETECTED_* / EMAIL_SENT confirmation, never written directly");
  }
  return outcome;
}

/** Map an adapter failure status to the confirmation stored on the row. */
export function confirmationForFailureStatus(status: string): AttemptOutcome | null {
  switch (status) {
    case "login_required": return "LOGIN_REQUIRED";
    case "not_eligible": return "NOT_ELIGIBLE";
    case "job_closed": return "EXPIRED";
    case "needs_user_input": return "NEEDS_ANSWERS";
    case "captcha": return "CAPTCHA";
    case "stuck": return "FAILED:stuck";
    case "unsafe_permissions": return "FAILED:unsafe_permissions";
    case "sso_required": return "FAILED:sso_required";
    case "marketplace": return "FAILED:marketplace";
    case "id_verification": return "FAILED:id_verification";
    case "not_a_job_application": return "FAILED:not_a_job_application";
    default: return isFailedOutcome(status) ? status : status.startsWith("FAILED:") ? status as AttemptOutcome : null;
  }
}

export type OutcomeRow = {
  status: string;
  submitConfirmation: string | null;
  submittedVia?: string | null;
  submittedAt?: Date | null;
  submissionReceiptJson?: string | null;
  confirmedAt?: Date | string | null;
  errorMessage?: string | null;
};

/**
 * Exactly one outcome, or null while the row has not finished an attempt.
 * APPLIED only when an ATS receipt or destination confirmation is stored.
 */
export function deriveAttemptOutcome(row: OutcomeRow): AttemptOutcome | null {
  const conf = row.submitConfirmation ?? "";
  if (row.submittedVia !== "mock_demo" && conf !== "DRY_RUN"
    && (row.confirmedAt || hasVerifiedSubmissionReceipt(row.submissionReceiptJson, row.submittedVia))) {
    return "APPLIED";
  }
  if (conf === "EXPIRED" || conf === "JOB_CLOSED") return "EXPIRED";
  if (conf === "CAPTCHA") return "CAPTCHA";
  if (conf === "LOGIN_REQUIRED") return "LOGIN_REQUIRED";
  if (conf === "NOT_ELIGIBLE") return "NOT_ELIGIBLE";
  if (conf === "NEEDS_ANSWERS" || row.status === "needs_answers") return "NEEDS_ANSWERS";
  if (isFailedOutcome(conf)) return conf;
  if (row.status === "failed") {
    const msg = row.errorMessage ?? "";
    if (/annuncio (?:non più|chiuso)|job closed|no longer (?:accepting|open)/i.test(msg) || conf === "JOB_CLOSED") return "EXPIRED";
    if (/captcha/i.test(msg)) return "CAPTCHA";
    if (/login|sign in|accedi/i.test(msg)) return "LOGIN_REQUIRED";
    if (/eligib|work auth|location|visto|visa|not eligible/i.test(msg)) return "NOT_ELIGIBLE";
    return failedOutcome(/stuck/i.test(msg) ? "stuck" : /permission|camera|microfon|geoloc/i.test(msg) ? "unsafe_permissions" : "unknown");
  }
  return null;
}

export const ATTEMPT_OUTCOME_LABELS: Record<StandardAttemptOutcome, { it: string; en: string }> = {
  APPLIED: { it: "Inviata e confermata", en: "Submitted and confirmed" },
  EXPIRED: { it: "Annuncio chiuso", en: "Posting closed" },
  CAPTCHA: { it: "Captcha: completa a mano", en: "Captcha: finish by hand" },
  LOGIN_REQUIRED: { it: "Serve accedere al portale", en: "Portal login required" },
  NOT_ELIGIBLE: { it: "Requisiti non soddisfatti", en: "Not eligible" },
  NEEDS_ANSWERS: { it: "Servono le tue risposte", en: "Your answers are needed" },
};

export function attemptOutcomeLabel(outcome: AttemptOutcome | null): { it: string; en: string } | null {
  if (!outcome) return null;
  if (outcome === "APPLIED" || outcome === "EXPIRED" || outcome === "CAPTCHA"
    || outcome === "LOGIN_REQUIRED" || outcome === "NOT_ELIGIBLE" || outcome === "NEEDS_ANSWERS") {
    return ATTEMPT_OUTCOME_LABELS[outcome];
  }
  const reason = failedReasonOf(outcome) ?? "unknown";
  return {
    it: `Invio fermato: ${reason.replace(/_/g, " ")}. Nessuna candidatura inviata.`,
    en: `Stopped: ${reason.replace(/_/g, " ")}. Nothing was sent.`,
  };
}
