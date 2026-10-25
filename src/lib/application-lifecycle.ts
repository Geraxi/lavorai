/**
 * Explicit application lifecycle, DERIVED from the columns the worker already
 * writes (status, submitConfirmation, submittedVia, submissionReceiptJson,
 * email attempts...). Nothing here writes to the database and no historical
 * row is rewritten: old rows get the same derivation as new ones.
 *
 *   draft                 prepared or preparing, waiting on the user (approve / answer questions)
 *   approved              the user approved (explicit consent or auto mode); queued, preparing or held
 *   submitting            a delivery attempt is in flight right now
 *   confirmed_submitted   ATS-accepted only: stored receipt / candidate id / destination response (confirmedAt)
 *   submitted_unverified  sent or possibly sent: provider-accepted, Resend delivered, mailbox no-bounce, unknown outcome
 *   failed                stopped before/without delivery, with a typed reason
 *   needs_manual          no supported automated route: apply URL + prepared documents for the user
 *
 * Server-side module (imports DB-bound constants); the UI reads the result
 * through GET /api/applications/lifecycle. See docs/application-lifecycle.md.
 */
import { hasVerifiedSubmissionReceipt, parseVerifiedSubmissionReceipt } from "@/lib/submission-receipt";
import { ROLLOUT_BUDGET_HELD_MESSAGE } from "@/lib/application-rollout";
import { JOB_CLOSED_HELD_MESSAGE, JOB_LIVENESS_UNKNOWN_HELD_MESSAGE } from "@/lib/job-liveness";
import { isAiCreditFailure } from "@/lib/credit-failure-retry";
import { DUPLICATE_POSTING_MESSAGE } from "@/lib/posting-key";
import { SKIPPED_ATS_MANUAL_MESSAGE } from "@/lib/ats-skip-hosts";
import type { Prisma } from "@prisma/client";
import { attemptOutcomeLabel, deriveAttemptOutcome, type AttemptOutcome } from "@/lib/attempt-outcome";

export const LIFECYCLE_STATUSES = [
  "draft", "approved", "submitting", "confirmed_submitted", "submitted_unverified", "failed", "needs_manual",
] as const;
export type LifecycleStatus = (typeof LIFECYCLE_STATUSES)[number];

export type FailureReason =
  | "job_closed" | "duplicate_posting" | "ai_unavailable" | "transient_error" | "cv_missing"
  | "ats_form_unsupported" | "email_bounced" | "email_rejected" | "email_complaint" | "cancelled" | "unknown";

export type ManualReason =
  | "captcha" | "unsupported_route" | "no_recruiter_email" | "ats_handoff" | "destination_unverified"
  | "portal_session_required" | "daily_cap_held" | "skip_list";

export type EvidenceType =
  | "ats_http_receipt" | "ats_confirmation_page" | "email_delivered" | "email_accepted"
  | "email_no_bounce" | "outcome_unknown" | "user_reported" | "legacy_detected_no_receipt" | "none";

export type NextAction =
  | "none" | "wait" | "approve" | "answer_questions" | "apply_manually" | "verify_on_portal" | "fix_account";

export interface LifecycleInput {
  status: string;
  submittedVia: string | null;
  submitConfirmation: string | null;
  submissionReceiptJson?: string | null;
  errorMessage?: string | null;
  consentGrantedAt?: Date | null;
  startedAt?: Date | null;
  completedAt?: Date | null;
  submittedAt?: Date | null;
  confirmedAt?: Date | string | null;
  createdAt?: Date;
  retryCount?: number;
  cvPdfPath?: string | null;
  cvDocxPath?: string | null;
  coverLetterPath?: string | null;
  coverLetterText?: string | null;
  /** Internal-only: used to surface an ALREADY captured screenshot key to admins. */
  canaryLog?: string | null;
  submitClickPerformedAt?: Date | string | null;
  outboundSubmissionJson?: string | null;
  job?: { url: string | null; source?: string | null } | null;
  /** Newest first, as every other evidence reader queries them. */
  emailAttempts?: Array<{
    status: string; providerEmailId: string | null; acceptedAt?: Date | null; createdAt?: Date;
    lastEventAt?: Date | null; lastEventType?: string | null; failureReason?: string | null;
  }>;
}

export interface DeliveryEvidenceRecord {
  type: EvidenceType;
  /** When the evidence was produced (ISO), when known. */
  at: string | null;
  /** ATS provider ("greenhouse", "ashby"...) or "email". */
  ats: string | null;
  /** Short, PII-free description of the proof. */
  snippet: string | null;
  receiptId: string | null;
  httpStatus: number | null;
  /** Only with { internal: true }: an already-captured screenshot reference. */
  screenshotKey?: string | null;
}

export interface Localized { it: string; en: string }

export interface ApplicationLifecycle {
  status: LifecycleStatus;
  /** The raw pipeline status the derivation started from (for debugging). */
  legacyStatus: string;
  failureReason: FailureReason | null;
  manualReason: ManualReason | null;
  /** Held while approved (daily cap, liveness re-check, account gate). */
  held: boolean;
  evidence: DeliveryEvidenceRecord;
  nextAction: NextAction;
  label: Localized;
  message: Localized;
  tone: "positive" | "neutral" | "warning" | "negative";
  manual: { applyUrl: string | null; documents: { cvPdf: boolean; cvDocx: boolean; coverLetter: boolean } } | null;
  retry: RetryDecision;
  /** Diagnostics, demos and dry runs never count in metrics or quotas. */
  excludedFromMetrics: boolean;
  /** Standardised attempt outcome, or null while no attempt has finished. */
  attemptOutcome: AttemptOutcome | null;
}

export interface RetryDecision { automatic: boolean; reason: RetryReason }
export type RetryReason =
  | "allowed" | "possible_submission" | "not_failed" | "not_transient" | "retry_budget_exhausted" | "automatic_retries_disabled";

/** Bounded: at most one automatic retry, and only before any delivery boundary. */
export const MAX_AUTOMATIC_RETRIES = 1;

const TRANSIENT_PATTERN = /\b(?:timeout|timed out|etimedout|econnreset|econnrefused|socket hang up|network error|fetch failed|overloaded|rate limit|too many requests|temporarily unavailable|service unavailable|bad gateway|gateway timeout|50[234])\b/i;

const LABELS: Record<LifecycleStatus, Localized> = {
  draft: { it: "Bozza", en: "Draft" },
  approved: { it: "Approvata, in coda", en: "Approved, queued" },
  submitting: { it: "Invio in corso", en: "Submitting" },
  confirmed_submitted: { it: "Inviata, confermata", en: "Submitted, confirmed" },
  submitted_unverified: { it: "Inviata, non verificata", en: "Submitted, unverified" },
  failed: { it: "Non inviata", en: "Not submitted" },
  needs_manual: { it: "Da inviare a mano", en: "Apply manually" },
};

export const FAILURE_MESSAGES: Record<FailureReason, Localized> = {
  job_closed: { it: "L'annuncio è stato chiuso dall'azienda. Nessun invio effettuato.", en: "The company closed this posting. Nothing was sent." },
  duplicate_posting: { it: "Hai già una candidatura per questo stesso annuncio. Non la inviamo due volte.", en: "You already have an application for this same posting. We never send it twice." },
  ai_unavailable: { it: "Il servizio che prepara CV e lettera non era disponibile. Nessun invio effettuato.", en: "The service that prepares your CV and letter was unavailable. Nothing was sent." },
  transient_error: { it: "Errore temporaneo prima dell'invio. Nessun invio effettuato.", en: "A temporary error happened before sending. Nothing was sent." },
  cv_missing: { it: "Manca il CV nel tuo profilo. Caricalo per preparare le candidature.", en: "Your profile has no CV. Upload one to prepare applications." },
  ats_form_unsupported: { it: "Il modulo del portale non è compilabile in automatico. Nessun invio effettuato.", en: "The portal form could not be filled automatically. Nothing was sent." },
  email_bounced: { it: "L'email al recruiter è tornata indietro (indirizzo non valido). Non la reinviamo.", en: "The email to the recruiter bounced. We will not resend it." },
  email_rejected: { it: "Il provider email ha rifiutato l'invio. Nessuna email consegnata.", en: "The email provider rejected the send. No email was delivered." },
  email_complaint: { it: "Il destinatario ha segnalato l'email. Non effettuiamo altri invii.", en: "The recipient reported the email. No further sends." },
  cancelled: { it: "Candidatura annullata. Nessun invio effettuato.", en: "Application cancelled. Nothing was sent." },
  unknown: { it: "La candidatura si è fermata prima dell'invio. Non è un rifiuto dell'azienda.", en: "The application stopped before sending. This is not a rejection by the company." },
};

export const MANUAL_MESSAGES: Record<ManualReason, Localized> = {
  captcha: { it: "Il portale chiede un captcha: CV e lettera sono pronti, completa tu l'invio dal link.", en: "The portal requires a captcha: your CV and letter are ready, finish the submission from the link." },
  unsupported_route: { it: "Questo portale non supporta l'invio automatico. CV e lettera sono pronti: candidati dal link.", en: "This portal does not support automatic sending. Your CV and letter are ready: apply from the link." },
  no_recruiter_email: { it: "Nessun canale di invio verificato per questo annuncio. CV e lettera sono pronti: candidati dal link.", en: "No verified sending channel for this posting. Your CV and letter are ready: apply from the link." },
  ats_handoff: { it: "L'azienda usa un portale ufficiale: candidati da lì con CV e lettera già pronti.", en: "The company uses an official portal: apply there with your ready CV and letter." },
  skip_list: { it: "Documenti pronti: invia sul sito dell'azienda. Invio automatico non disponibile su questo portale (CAPTCHA / verifica manuale).", en: "Documents ready: apply on the company site. Automatic sending is not available on this portal (CAPTCHA / manual verification)." },
  destination_unverified: { it: "Non abbiamo potuto collegare con certezza il portale a questo annuncio. Verifica il link ufficiale e candidati da lì.", en: "We could not reliably match the portal to this posting. Check the official link and apply there." },
  portal_session_required: { it: "Serve collegare il tuo account del portale, oppure candidati dal link.", en: "Connect your portal account, or apply from the link." },
  daily_cap_held: { it: "Limite giornaliero raggiunto: la candidatura è conservata e non inviata.", en: "Daily limit reached: the application is kept and not sent." },
};

const iso = (d: Date | string | null | undefined) => {
  if (d instanceof Date && Number.isFinite(+d)) return d.toISOString();
  if (typeof d === "string" && Number.isFinite(Date.parse(d))) return new Date(d).toISOString();
  return null;
};
const noEvidence: DeliveryEvidenceRecord = { type: "none", at: null, ats: null, snippet: null, receiptId: null, httpStatus: null };

function screenshotFrom(canaryLog: string | null | undefined): string | null {
  if (!canaryLog || canaryLog.length > 200_000) return null;
  try {
    const parsed = JSON.parse(canaryLog) as Record<string, unknown>;
    const key = parsed.postSubmitScreenshotUrl ?? parsed.preSubmitScreenshotUrl;
    return typeof key === "string" && /^https:\/\//.test(key) && key.length < 600 ? key : null;
  } catch { return null; }
}

export function classifyFailure(input: Pick<LifecycleInput, "status" | "submitConfirmation" | "errorMessage">): FailureReason {
  const message = input.errorMessage ?? "";
  if (input.submitConfirmation === "REJECTED_NOT_SENT" || /rifiutato la candidatura \(validazione\)/i.test(message)) return "ats_form_unsupported";
  if (input.submitConfirmation === "JOB_CLOSED" || input.submitConfirmation === "EXPIRED" || message === JOB_CLOSED_HELD_MESSAGE || /annuncio (?:non più online|chiuso)/i.test(message)) return "job_closed";
  if (message === DUPLICATE_POSTING_MESSAGE) return "duplicate_posting";
  if (isAiCreditFailure(message)) return "ai_unavailable";
  if (/^CV utente mancante/i.test(message)) return "cv_missing";
  if (/form_not_found|Submit sul portale .* non confermato|^Portal [^:]+:/i.test(message)) return "ats_form_unsupported";
  if (TRANSIENT_PATTERN.test(message)) return "transient_error";
  if (input.status === "cancelled") return "cancelled";
  return "unknown";
}

function manualReasonFor(input: LifecycleInput): ManualReason {
  const message = input.errorMessage ?? "";
  if (input.submitConfirmation === "CAPTCHA") return "captcha";
  if (input.status === "needs_session") return "portal_session_required";
  if (message === SKIPPED_ATS_MANUAL_MESSAGE || /CAPTCHA \/ verifica manuale/i.test(message)) return "skip_list";
  if (/non correlabile/i.test(message)) return "destination_unverified";
  if (/sistema di candidatura ufficiale|copia da aggregatore/i.test(message)) return "ats_handoff";
  if (/email del recruiter|senza email recruiter|Email non inviata/i.test(message)) return "no_recruiter_email";
  return "unsupported_route";
}

/** Pure retry policy. Automatic retries are allowed only for a transient
 * failure with proof that nothing crossed a delivery boundary, at most
 * MAX_AUTOMATIC_RETRIES times, and only when the global policy permits it
 * (historicalRetriesBlocked() keeps them off today). */
export function automaticRetryDecision(
  input: LifecycleInput,
  lifecycle: Pick<ApplicationLifecycle, "status" | "failureReason">,
  policy: { retriesBlocked: boolean },
): RetryDecision {
  const attempt = input.emailAttempts?.[0];
  const possibleSubmission = !!(input.submittedAt || input.submittedVia || input.submissionReceiptJson
    || attempt?.providerEmailId || (attempt && !["failed"].includes(attempt.status))
    || ["SUBMISSION_STARTED", "UNCONFIRMED", "EMAIL_SENT", "MANUAL"].includes(input.submitConfirmation ?? "")
    || !!input.submitClickPerformedAt || !!input.outboundSubmissionJson
    || (input.submitConfirmation ?? "").startsWith("DETECTED"));
  if (possibleSubmission || ["submitting", "confirmed_submitted", "submitted_unverified"].includes(lifecycle.status)) {
    return { automatic: false, reason: "possible_submission" };
  }
  if (lifecycle.status !== "failed") return { automatic: false, reason: "not_failed" };
  if (!["transient_error", "ai_unavailable"].includes(lifecycle.failureReason ?? "")) return { automatic: false, reason: "not_transient" };
  if ((input.retryCount ?? 0) >= MAX_AUTOMATIC_RETRIES) return { automatic: false, reason: "retry_budget_exhausted" };
  if (policy.retriesBlocked) return { automatic: false, reason: "automatic_retries_disabled" };
  return { automatic: true, reason: "allowed" };
}

function receiptEvidence(json: string | null | undefined, submittedVia: string | null): DeliveryEvidenceRecord | null {
  const receipt = parseVerifiedSubmissionReceipt(json, submittedVia);
  if (!receipt) return null;
  return receipt.kind === "http"
    ? { type: "ats_http_receipt", at: receipt.capturedAt, ats: receipt.provider, receiptId: receipt.receiptId ?? null, httpStatus: receipt.httpStatus ?? null,
        snippet: `${receipt.provider} ${receipt.operation ?? "submit"} → HTTP ${receipt.httpStatus} (${receipt.signal})` }
    : { type: "ats_confirmation_page", at: receipt.capturedAt, ats: receipt.provider, receiptId: receipt.receiptId ?? null, httpStatus: null,
        snippet: `${receipt.provider} confirmation page shown and application form removed` };
}

/** Derive the explicit lifecycle of one application. Deterministic and pure. */
export function deriveApplicationLifecycle(
  input: LifecycleInput,
  options: { internal?: boolean; retriesBlocked?: boolean } = {},
): ApplicationLifecycle {
  const attempt = input.emailAttempts?.[0];
  const portal = input.submittedVia?.startsWith("portal_") ? input.submittedVia.slice("portal_".length) : null;
  let status: LifecycleStatus = "draft";
  let failureReason: FailureReason | null = null;
  let manualReason: ManualReason | null = null;
  let held = false;
  let nextAction: NextAction = "none";
  let evidence: DeliveryEvidenceRecord = { ...noEvidence };
  let excludedFromMetrics = false;
  let messageOverride: Localized | null = null;

  if (input.status === "diagnostic" || input.submittedVia === "mock_demo" || input.submitConfirmation === "DRY_RUN") {
    excludedFromMetrics = true;
    status = "draft";
    messageOverride = { it: "Anteprima o test: nessuna candidatura inviata.", en: "Preview or test: nothing was sent." };
  } else if (input.confirmedAt) {
    status = "confirmed_submitted";
    evidence = { ...noEvidence, type: "ats_confirmation_page", ats: portal ?? "email", at: iso(input.confirmedAt),
      snippet: "Destination confirmation stored (ATS receipt email). Not mailbox no-bounce." };
  } else if (input.submittedVia?.startsWith("mailbox_")) {
    const at = iso(input.submittedAt ?? input.completedAt ?? null);
    if (input.submitConfirmation === "MAILBOX_BOUNCED") {
      status = "failed"; failureReason = "email_bounced";
      evidence = { ...noEvidence, ats: "email", at, snippet: "Bounce (DSN) found in the mailbox thread" };
    } else if (input.submitConfirmation === "MAILBOX_NO_BOUNCE") {
      status = "submitted_unverified"; nextAction = "wait";
      evidence = { ...noEvidence, type: "email_no_bounce", ats: "email", at,
        snippet: "Sent from the user's mailbox; no bounce after the observation window. Not confirmed acceptance." };
      messageOverride = { it: "Inviata dalla tua casella, nessun rimbalzo. Non è una conferma di ricezione dell'azienda.", en: "Sent from your mailbox, no bounce. This is not an employer receipt." };
    } else if (input.submitConfirmation === "MAILBOX_ACCEPTED") {
      status = "submitted_unverified"; nextAction = "wait";
      evidence = { ...noEvidence, type: "email_accepted", ats: "email", at, snippet: "Accepted by the user's mail provider; bounce window still open" };
    } else {
      status = "submitted_unverified"; nextAction = "verify_on_portal";
      evidence = { ...noEvidence, type: "outcome_unknown", ats: "email", at, snippet: "Mailbox send outcome unknown" };
    }
  } else if (attempt && (input.submittedVia === "email_recruiter" || !input.submittedVia)) {
    const at = iso(attempt.lastEventAt ?? attempt.acceptedAt ?? attempt.createdAt ?? null);
    if (["failed", "bounced", "complained"].includes(attempt.status)) {
      status = "failed";
      failureReason = attempt.status === "bounced" ? "email_bounced" : attempt.status === "complained" ? "email_complaint" : "email_rejected";
      evidence = { ...noEvidence, ats: "email", at, snippet: `Email provider reported ${attempt.status}` };
    } else if (attempt.status === "delivered" && attempt.providerEmailId) {
      status = "submitted_unverified"; nextAction = "wait";
      evidence = { ...noEvidence, type: "email_delivered", ats: "email", at, snippet: "Provider delivered event: recipient mail server accepted the message. Not an employer receipt." };
    } else if (attempt.providerEmailId && ["accepted", "delayed"].includes(attempt.status)) {
      status = "submitted_unverified";
      evidence = { ...noEvidence, type: "email_accepted", ats: "email", at,
        snippet: attempt.status === "delayed" ? "Email accepted by provider, delivery delayed" : "Email accepted by provider, delivery not yet confirmed" };
      nextAction = "wait";
    } else if (input.status === "applying" && attempt.status === "sending") {
      status = "submitting"; nextAction = "wait";
    } else {
      status = "submitted_unverified"; nextAction = "verify_on_portal";
      evidence = { ...noEvidence, type: "outcome_unknown", ats: "email", at, snippet: "Email send outcome unknown" };
    }
  } else if (input.status === "success" && portal && hasVerifiedSubmissionReceipt(input.submissionReceiptJson, input.submittedVia)) {
    status = "confirmed_submitted";
    evidence = receiptEvidence(input.submissionReceiptJson, input.submittedVia) ?? evidence;
  } else if (input.submittedVia === "manual" || input.submitConfirmation === "MANUAL") {
    status = "submitted_unverified";
    evidence = { ...noEvidence, type: "user_reported", at: iso(input.submittedAt ?? input.completedAt ?? input.createdAt), snippet: "Reported as sent by the user" };
    messageOverride = { it: "Candidatura segnata come inviata da te. LavorAI non ne ha verificato l'invio.", en: "You marked this application as sent. LavorAI has not verified it." };
  } else if (input.status === "success") {
    status = "submitted_unverified"; nextAction = "verify_on_portal";
    evidence = { ...noEvidence, type: (input.submitConfirmation ?? "").startsWith("DETECTED") ? "legacy_detected_no_receipt" : "none",
      ats: portal ?? (input.submittedVia === "email_recruiter" ? "email" : null), at: iso(input.submittedAt ?? input.completedAt),
      snippet: input.submitConfirmation ? `Recorded as ${input.submitConfirmation} without a verifiable receipt` : null };
  } else if (["applying", "submitting", "answers_claimed"].includes(input.status)) {
    status = "submitting"; nextAction = "wait";
  } else if (input.submitConfirmation === "REJECTED_NOT_SENT") {
    status = "failed"; failureReason = "ats_form_unsupported"; nextAction = "apply_manually";
    messageOverride = { it: "Il portale ha rifiutato la candidatura (validazione). Nessun invio accettato.", en: "The portal rejected the application (validation). Nothing was accepted." };
  } else if (["SUBMISSION_STARTED", "UNCONFIRMED"].includes(input.submitConfirmation ?? "")) {
    // A delivery boundary may have been crossed: never shown as failed, never retried.
    status = "submitted_unverified"; nextAction = "verify_on_portal";
    evidence = { ...noEvidence, snippet: "Submission attempted; no confirmation captured" };
  } else if (input.submitConfirmation === "EXPIRED" || input.submitConfirmation === "JOB_CLOSED") {
    status = "failed"; failureReason = "job_closed";
  } else if (input.submitConfirmation === "LOGIN_REQUIRED" || input.submitConfirmation === "NOT_ELIGIBLE" || (input.submitConfirmation ?? "").startsWith("FAILED:")) {
    status = "failed";
    failureReason = classifyFailure(input);
    messageOverride = attemptOutcomeLabel(input.submitConfirmation as AttemptOutcome);
  } else if (input.status === "failed" || input.status === "cancelled") {
    status = "failed";
    failureReason = classifyFailure(input);
  } else if (input.status === "needs_answers") {
    status = "draft"; nextAction = "answer_questions";
    messageOverride = { it: "Il modulo ha domande a cui solo tu puoi rispondere. Rispondi per completare l'invio.", en: "The form has questions only you can answer. Answer them to complete the submission." };
  } else if (input.status === "awaiting_consent") {
    status = "draft"; nextAction = "approve";
    messageOverride = { it: "CV e lettera sono pronti. Approva l'invio per procedere.", en: "Your CV and letter are ready. Approve the submission to continue." };
  } else if (["needs_session", "needs_2fa"].includes(input.status)) {
    status = "needs_manual"; manualReason = "portal_session_required"; nextAction = "apply_manually";
  } else if (input.status === "ready_to_apply") {
    if (input.submitConfirmation === "NOT_SUBMITTED" && input.errorMessage === ROLLOUT_BUDGET_HELD_MESSAGE) {
      status = "approved"; held = true; nextAction = "wait";
      messageOverride = MANUAL_MESSAGES.daily_cap_held;
    } else if (input.errorMessage === SKIPPED_ATS_MANUAL_MESSAGE) {
      status = "needs_manual"; manualReason = "skip_list"; nextAction = "apply_manually";
    } else if (input.submitConfirmation === "CAPTCHA" || input.submitConfirmation === "NOT_SUBMITTED" || input.completedAt) {
      status = "needs_manual"; manualReason = manualReasonFor(input); nextAction = "apply_manually";
    } else {
      status = "approved"; nextAction = "wait"; // prepared, delivery step pending
    }
  } else if (input.status === "queued" || input.status === "optimizing") {
    status = "approved"; nextAction = "wait";
    const message = input.errorMessage ?? "";
    if (input.status === "queued" && input.startedAt && message) {
      held = true;
      if (message === JOB_LIVENESS_UNKNOWN_HELD_MESSAGE) {
        messageOverride = { it: "Stiamo verificando che l'annuncio sia ancora online. Nessun invio effettuato.", en: "We are checking that the posting is still online. Nothing was sent." };
      } else if (/^Invio in attesa:/.test(message)) {
        nextAction = /consenso|verific|abbonamento|account/i.test(message) ? "fix_account" : "wait";
        messageOverride = { it: message, en: "Held before sending: an account or preference check must pass first. Nothing was sent." };
      }
    }
  }

  if (options.internal && status !== "draft") {
    evidence = { ...evidence, screenshotKey: screenshotFrom(input.canaryLog) };
  }

  const label = held && status === "approved" ? { it: "Approvata, in attesa", en: "Approved, on hold" } : LABELS[status];
  const message: Localized = messageOverride
    ?? (failureReason ? FAILURE_MESSAGES[failureReason] : null)
    ?? (manualReason ? MANUAL_MESSAGES[manualReason] : null)
    ?? defaultMessage(status);
  const tone: ApplicationLifecycle["tone"] = status === "confirmed_submitted" ? "positive"
    : status === "failed" ? "negative"
    : ["submitted_unverified", "needs_manual"].includes(status) || held ? "warning" : "neutral";
  const lifecycleCore = { status, failureReason };
  const retry = automaticRetryDecision(input, lifecycleCore, { retriesBlocked: options.retriesBlocked ?? true });
  const hasDocs = { cvPdf: !!input.cvPdfPath, cvDocx: !!input.cvDocxPath, coverLetter: !!(input.coverLetterPath || input.coverLetterText) };
  return {
    status, legacyStatus: input.status, failureReason, manualReason, held, evidence, nextAction, label, message, tone,
    manual: status === "needs_manual" ? { applyUrl: safeHttpUrl(input.job?.url ?? null), documents: hasDocs } : null,
    retry, excludedFromMetrics,
    attemptOutcome: deriveAttemptOutcome(input),
  };
}

function defaultMessage(status: LifecycleStatus): Localized {
  switch (status) {
    case "confirmed_submitted": return { it: "Il portale o il server email ha confermato la ricezione. L'azienda decide se e quando rispondere.", en: "The portal or mail server confirmed receipt. The company decides whether and when to reply." };
    case "submitted_unverified": return { it: "Inviata o forse inviata, senza una conferma verificabile. Non la reinviamo per evitare duplicati: controlla il portale o la tua email.", en: "Sent or possibly sent, without verifiable confirmation. We will not resend it to avoid duplicates: check the portal or your email." };
    case "submitting": return { it: "Invio in corso.", en: "Submission in progress." };
    case "approved": return { it: "Approvata: la prepariamo e la inviamo appena possibile.", en: "Approved: we will prepare and send it as soon as possible." };
    case "failed": return FAILURE_MESSAGES.unknown;
    case "needs_manual": return MANUAL_MESSAGES.unsupported_route;
    default: return { it: "Bozza: non ancora inviata.", en: "Draft: not sent yet." };
  }
}

function safeHttpUrl(value: string | null): string | null {
  if (!value) return null;
  try { const url = new URL(value); return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null; } catch { return null; }
}

/** Prisma select covering every field the derivation reads (no CV/letter bodies). */
export const lifecycleSelect = {
  id: true, status: true, submittedVia: true, submitConfirmation: true, submissionReceiptJson: true, errorMessage: true,
  consentGrantedAt: true, startedAt: true, completedAt: true, submittedAt: true, createdAt: true, retryCount: true,
  submitClickPerformedAt: true, outboundSubmissionJson: true,
  cvPdfPath: true, cvDocxPath: true, coverLetterPath: true,
  job: { select: { url: true, source: true } },
  emailAttempts: { orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 1,
    select: { status: true, providerEmailId: true, acceptedAt: true, createdAt: true, lastEventAt: true, lastEventType: true, failureReason: true } },
} satisfies Prisma.ApplicationSelect;
