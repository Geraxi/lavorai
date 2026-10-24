import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { canonicalPostingKey, DUPLICATE_POSTING_MESSAGE } from "../src/lib/posting-key";
import { automaticRetryDecision, classifyFailure, deriveApplicationLifecycle, LIFECYCLE_STATUSES, MAX_AUTOMATIC_RETRIES, type LifecycleInput } from "../src/lib/application-lifecycle";
import { postingAlreadyClaimed, NOT_SUBMITTED, SUBMISSION_STARTED } from "../src/lib/application-worker-gates";
import { ROLLOUT_BUDGET_HELD_MESSAGE } from "../src/lib/application-rollout";
import { JOB_CLOSED_HELD_MESSAGE, JOB_LIVENESS_UNKNOWN_HELD_MESSAGE } from "../src/lib/job-liveness";
import { SKIPPED_ATS_MANUAL_MESSAGE } from "../src/lib/ats-skip-hosts";
import { submissionSubjectKey } from "../src/lib/application-submission-budget";

// ── posting keys ───────────────────────────────────────────────────────
const gh = ["https://boards.greenhouse.io/acme/jobs/123", "https://job-boards.greenhouse.io/acme/jobs/123?gh_src=abc", "https://careers.acme.example/?gh_jid=123", "https://boards.greenhouse.io/embed/job_app?for=acme&token=123"];
for (const url of gh) assert.equal(canonicalPostingKey(url), "greenhouse:123", url);
assert.equal(canonicalPostingKey("https://jobs.ashbyhq.com/acme/0f3a6b2e-1111-2222-3333-444455556666/application"), "ashby:0f3a6b2e-1111-2222-3333-444455556666");
assert.equal(canonicalPostingKey("https://jobs.ashbyhq.com/acme/0F3A6B2E-1111-2222-3333-444455556666?utm_source=x"), "ashby:0f3a6b2e-1111-2222-3333-444455556666");
assert.equal(canonicalPostingKey("https://jobs.lever.co/acme/abcd-ef/apply"), canonicalPostingKey("https://jobs.lever.co/acme/abcd-ef?lever-source=linkedin"));
assert.equal(canonicalPostingKey("https://apply.workable.com/acme/j/AB12CD/"), "workable:ab12cd");
assert.notEqual(canonicalPostingKey("https://acme.recruitee.com/o/designer"), canonicalPostingKey("https://other.recruitee.com/o/designer"), "tenant-scoped slugs differ per tenant");
assert.equal(canonicalPostingKey("https://www.Example-Careers.it/lavora/123/?utm_campaign=a&b=2&a=1#top"), "url:example-careers.it/lavora/123?a=1&b=2");
assert.equal(canonicalPostingKey("https://example-careers.it/lavora/123/apply"), "url:example-careers.it/lavora/123");
for (const bad of [null, "", "mailto:x@y.z", "javascript:alert(1)", "not a url", "https://user:pw@host/x"]) assert.equal(canonicalPostingKey(bad as string), null);

// ── lifecycle derivation (every legacy shape → one explicit status) ─────
const now = new Date("2026-10-18T10:00:00.000Z");
const base: LifecycleInput = { status: "queued", submittedVia: null, submitConfirmation: null, submissionReceiptJson: null, errorMessage: null,
  consentGrantedAt: null, startedAt: null, completedAt: null, submittedAt: null, createdAt: now, retryCount: 0,
  cvPdfPath: "blob/cv.pdf", cvDocxPath: "blob/cv.docx", coverLetterPath: "blob/cl.docx", job: { url: "https://boards.greenhouse.io/acme/jobs/123", source: "greenhouse" }, emailAttempts: [] };
const receipt = JSON.stringify({ version: 1, provider: "greenhouse", kind: "http", capturedAt: now.toISOString(), jobId: "123",
  endpoint: "https://boards-api.greenhouse.io/v1/boards/acme/jobs/123", operation: "application.create", httpStatus: 201, signal: "application_id", receiptId: "998877" });
const s = (patch: Partial<LifecycleInput>, internal = false) => deriveApplicationLifecycle({ ...base, ...patch }, { internal });

const confirmed = s({ status: "success", submittedVia: "portal_greenhouse", submitConfirmation: "DETECTED_HTTP_2xx", submissionReceiptJson: receipt, submittedAt: now });
assert.equal(confirmed.status, "confirmed_submitted");
assert.equal(confirmed.evidence.type, "ats_http_receipt");
assert.equal(confirmed.evidence.ats, "greenhouse");
assert.equal(confirmed.evidence.httpStatus, 201);
assert.equal(confirmed.evidence.receiptId, "998877");
assert.equal(confirmed.evidence.at, now.toISOString());
assert.equal(confirmed.tone, "positive");
assert.equal(confirmed.attemptOutcome, "APPLIED");
assert.equal(confirmed.retry.automatic, false);
assert.equal(confirmed.evidence.screenshotKey, undefined, "screenshot keys are internal-only");
assert.equal(s({ status: "success", submittedVia: "portal_greenhouse", submissionReceiptJson: receipt, canaryLog: JSON.stringify({ preSubmitScreenshotUrl: "https://blob.example/s.png" }) }, true).evidence.screenshotKey, "https://blob.example/s.png");

// legacy success without a receipt is NEVER shown as confirmed
for (const patch of [{ submitConfirmation: "DETECTED_DOM" }, { submitConfirmation: "DETECTED_HTTP_2xx", submissionReceiptJson: '{"forged":true}' }, { submitConfirmation: null }]) {
  const view = s({ status: "success", submittedVia: "portal_greenhouse", ...patch });
  assert.equal(view.status, "submitted_unverified", JSON.stringify(patch));
}
assert.equal(s({ status: "success", submittedVia: "portal_greenhouse", submitConfirmation: "DETECTED_DOM" }).evidence.type, "legacy_detected_no_receipt");
// receipt from another provider than the channel is rejected
assert.equal(s({ status: "success", submittedVia: "portal_lever", submissionReceiptJson: receipt }).status, "submitted_unverified");

// email channel
const email = (status: string, providerEmailId: string | null = "re_1") => s({ status: "success", submittedVia: "email_recruiter", submitConfirmation: "EMAIL_SENT", submittedAt: now,
  emailAttempts: [{ status, providerEmailId, acceptedAt: now, createdAt: now, lastEventAt: now, lastEventType: `email.${status}` }] });
assert.equal(email("delivered").status, "submitted_unverified", "Resend delivered is not an employer receipt");
assert.equal(email("delivered").evidence.type, "email_delivered");
assert.equal(email("accepted").status, "submitted_unverified");
assert.equal(email("delayed").status, "submitted_unverified");
assert.equal(email("delivered", null).status, "submitted_unverified", "no provider id → no proof");
assert.deepEqual([email("bounced").status, email("bounced").failureReason], ["failed", "email_bounced"]);
assert.equal(email("complained").failureReason, "email_complaint");
assert.equal(email("failed").failureReason, "email_rejected");
assert.equal(email("unknown").status, "submitted_unverified");
assert.equal(s({ status: "applying", submitConfirmation: SUBMISSION_STARTED, emailAttempts: [{ status: "sending", providerEmailId: null }] }).status, "submitting");

// in-flight and possibly-sent rows
for (const status of ["applying", "submitting", "answers_claimed"]) assert.equal(s({ status, submitConfirmation: SUBMISSION_STARTED }).status, "submitting");
for (const patch of [{ status: "ready_to_apply", submitConfirmation: "UNCONFIRMED" }, { status: "failed", submitConfirmation: SUBMISSION_STARTED }, { status: "failed", submitConfirmation: "UNCONFIRMED" }]) {
  const view = s(patch);
  assert.equal(view.status, "submitted_unverified", `possibly sent must never read as failed: ${JSON.stringify(patch)}`);
  assert.equal(view.nextAction, "verify_on_portal");
  assert.deepEqual(view.retry, { automatic: false, reason: "possible_submission" });
}
assert.equal(s({ status: "success", submittedVia: "manual", submitConfirmation: "MANUAL" }).evidence.type, "user_reported");

// failures with typed reasons
assert.equal(s({ status: "failed", submitConfirmation: "JOB_CLOSED", errorMessage: "Annuncio non più online (chiuso dall'azienda). Nessun invio effettuato." }).failureReason, "job_closed");
assert.equal(s({ status: "failed", submitConfirmation: "JOB_CLOSED", errorMessage: JOB_CLOSED_HELD_MESSAGE }).failureReason, "job_closed");
assert.equal(s({ status: "failed", submitConfirmation: NOT_SUBMITTED, errorMessage: DUPLICATE_POSTING_MESSAGE }).failureReason, "duplicate_posting");
assert.equal(s({ status: "failed", errorMessage: "CREDITI AI ESAURITI: ricarica" }).failureReason, "ai_unavailable");
assert.equal(s({ status: "failed", errorMessage: "CV utente mancante." }).failureReason, "cv_missing");
assert.equal(s({ status: "failed", submitConfirmation: NOT_SUBMITTED, errorMessage: "Submit sul portale ashby non confermato (form cambiato o campo mancante). Esito da verificare prima di un altro tentativo." }).failureReason, "ats_form_unsupported");
assert.equal(s({ status: "failed", errorMessage: "OpenAI 503 Service Unavailable" }).failureReason, "transient_error");
assert.equal(s({ status: "cancelled" }).failureReason, "cancelled");
assert.equal(s({ status: "failed", errorMessage: "boom" }).failureReason, "unknown");
assert.equal(classifyFailure({ status: "failed", submitConfirmation: null, errorMessage: "ETIMEDOUT while fetching" }), "transient_error");

// drafts, approvals, holds, manual fallback
assert.equal(s({ status: "awaiting_consent" }).status, "draft");
assert.equal(s({ status: "awaiting_consent" }).nextAction, "approve");
assert.equal(s({ status: "needs_answers" }).nextAction, "answer_questions");
assert.equal(s({ status: "queued" }).status, "approved");
assert.equal(s({ status: "optimizing" }).status, "approved");
const heldConsent = s({ status: "queued", startedAt: now, submitConfirmation: NOT_SUBMITTED, errorMessage: "Invio in attesa: Consenso privacy mancante. Questa elaborazione non ha effettuato nuovi invii." });
assert.deepEqual([heldConsent.status, heldConsent.held, heldConsent.nextAction], ["approved", true, "fix_account"]);
assert.equal(s({ status: "queued", startedAt: now, errorMessage: JOB_LIVENESS_UNKNOWN_HELD_MESSAGE }).held, true);
const capped = s({ status: "ready_to_apply", submitConfirmation: NOT_SUBMITTED, errorMessage: ROLLOUT_BUDGET_HELD_MESSAGE });
assert.deepEqual([capped.status, capped.held], ["approved", true]);
const captcha = s({ status: "ready_to_apply", submitConfirmation: "CAPTCHA" });
assert.deepEqual([captcha.status, captcha.manualReason, captcha.nextAction], ["needs_manual", "captcha", "apply_manually"]);
assert.equal(captcha.attemptOutcome, "CAPTCHA");
assert.equal(s({ status: "failed", submitConfirmation: "JOB_CLOSED", errorMessage: "Annuncio non più online." }).attemptOutcome, "EXPIRED");
assert.equal(s({ status: "failed", submitConfirmation: "LOGIN_REQUIRED" }).attemptOutcome, "LOGIN_REQUIRED");
assert.equal(s({ status: "failed", submitConfirmation: "NOT_ELIGIBLE" }).attemptOutcome, "NOT_ELIGIBLE");
assert.equal(s({ status: "failed", submitConfirmation: "FAILED:stuck" }).attemptOutcome, "FAILED:stuck");
assert.equal(s({ status: "needs_answers", submitConfirmation: "NEEDS_ANSWERS" }).attemptOutcome, "NEEDS_ANSWERS");
assert.equal(s({ status: "success", submittedVia: "portal_greenhouse", submitConfirmation: null }).attemptOutcome, null, "success without confirmation is not APPLIED");
assert.equal(captcha.manual?.applyUrl, "https://boards.greenhouse.io/acme/jobs/123");
assert.deepEqual(captcha.manual?.documents, { cvPdf: true, cvDocx: true, coverLetter: true });
assert.equal(s({ status: "ready_to_apply", completedAt: now, errorMessage: "Questo portale non è supportato per invio automatico." }).manualReason, "unsupported_route");
assert.equal(s({ status: "ready_to_apply", submitConfirmation: NOT_SUBMITTED, errorMessage: "Destinazione ATS non correlabile con certezza a questo annuncio." }).manualReason, "destination_unverified");
assert.equal(s({ status: "ready_to_apply", completedAt: now, errorMessage: "Acme usa un sistema di candidatura ufficiale (ATS)." }).manualReason, "ats_handoff");
const skipList = s({ status: "ready_to_apply", completedAt: now, errorMessage: SKIPPED_ATS_MANUAL_MESSAGE, job: { url: "https://jobs.ashbyhq.com/acme/uuid", source: "ashby" } });
assert.deepEqual([skipList.status, skipList.manualReason, skipList.nextAction], ["needs_manual", "skip_list", "apply_manually"]);
assert.match(skipList.message.it, /Documenti pronti: invia sul sito dell'azienda/);
assert.equal(s({ status: "needs_session" }).manualReason, "portal_session_required");
assert.equal(s({ status: "ready_to_apply", job: { url: "javascript:alert(1)" }, submitConfirmation: "CAPTCHA" }).manual?.applyUrl, null, "only http(s) apply links");
assert.equal(s({ status: "ready_to_apply" }).status, "approved");

// exclusions
for (const patch of [{ status: "diagnostic" }, { submittedVia: "mock_demo", status: "success" }, { status: "ready_to_apply", submitConfirmation: "DRY_RUN" }]) {
  assert.equal(s(patch).excludedFromMetrics, true);
}

// every output is in the declared enum and has both languages
for (const legacy of ["queued", "optimizing", "applying", "submitting", "ready_to_apply", "awaiting_consent", "needs_answers", "needs_session", "success", "failed", "cancelled", "diagnostic", "answers_claimed", "something_new"]) {
  const view = s({ status: legacy });
  assert(LIFECYCLE_STATUSES.includes(view.status), legacy);
  assert(view.label.it && view.label.en && view.message.it && view.message.en, legacy);
}

// ── retry rules ────────────────────────────────────────────────────────
const transient = { ...base, status: "failed", errorMessage: "OpenAI 503 Service Unavailable" };
const transientLifecycle = deriveApplicationLifecycle(transient);
assert.deepEqual(automaticRetryDecision(transient, transientLifecycle, { retriesBlocked: false }), { automatic: true, reason: "allowed" });
assert.deepEqual(automaticRetryDecision(transient, transientLifecycle, { retriesBlocked: true }), { automatic: false, reason: "automatic_retries_disabled" });
assert.deepEqual(automaticRetryDecision({ ...transient, retryCount: MAX_AUTOMATIC_RETRIES }, transientLifecycle, { retriesBlocked: false }), { automatic: false, reason: "retry_budget_exhausted" });
for (const evidence of [{ submittedAt: now }, { submittedVia: "email_recruiter" }, { submitConfirmation: SUBMISSION_STARTED }, { submitConfirmation: "UNCONFIRMED" }, { submitConfirmation: "DETECTED_DOM" },
  { emailAttempts: [{ status: "accepted", providerEmailId: "re_1" }] }, { emailAttempts: [{ status: "unknown", providerEmailId: null }] }, { emailAttempts: [{ status: "bounced", providerEmailId: "re_1" }] }]) {
  const row = { ...transient, ...evidence };
  assert.deepEqual(automaticRetryDecision(row, deriveApplicationLifecycle(row), { retriesBlocked: false }), { automatic: false, reason: "possible_submission" }, JSON.stringify(evidence));
}
for (const msg of ["boom", JOB_CLOSED_HELD_MESSAGE, DUPLICATE_POSTING_MESSAGE, "CV utente mancante."]) {
  const row = { ...base, status: "failed", errorMessage: msg };
  assert.equal(automaticRetryDecision(row, deriveApplicationLifecycle(row), { retriesBlocked: false }).automatic, false, msg);
}
assert.equal(deriveApplicationLifecycle(transient).retry.automatic, false, "default policy keeps historicalRetriesBlocked semantics");

// ── duplicate prevention: one submission per user + posting ────────────
type Row = { id: string; userId: string; jobId: string; status: string; job: { url: string } } & Record<string, unknown>;
const clean = { submittedAt: null, submittedVia: null, submitConfirmation: null, canaryLog: null, answersUsedJson: null, viewedAt: null, lastReplyAt: null, replyCount: 0, userStatus: null };
function fakeTx(rows: Row[], reservations: { subjectKey: string }[] = []) {
  return {
    application: { findMany: async ({ where }: any) => rows.filter((r) => r.userId === where.userId && r.id !== where.id.not) },
    applicationSubmissionReservation: { findFirst: async ({ where }: any) => reservations.find((r) => where.subjectKey.in.includes(r.subjectKey)) ?? null },
  } as any;
}
const me = { id: "a1", userId: "u1", jobId: "j1", job: { url: "https://boards.greenhouse.io/acme/jobs/123" } };
(async () => {
  assert.equal(await postingAlreadyClaimed(fakeTx([]), me), false);
  // same posting through another Job row, already sent → duplicate
  assert.equal(await postingAlreadyClaimed(fakeTx([{ ...clean, id: "a2", userId: "u1", jobId: "j2", status: "success", submittedVia: "portal_greenhouse", job: { url: "https://job-boards.greenhouse.io/acme/jobs/123?gh_src=x" } }]), me), true);
  // in-flight sibling (SUBMISSION_STARTED) → duplicate
  assert.equal(await postingAlreadyClaimed(fakeTx([{ ...clean, id: "a2", userId: "u1", jobId: "j2", status: "ready_to_apply", submitConfirmation: SUBMISSION_STARTED, job: { url: "https://careers.acme.example/?gh_jid=123" } }]), me), true);
  // sibling with a reservation but no row evidence → duplicate (conservative)
  assert.equal(await postingAlreadyClaimed(fakeTx([{ ...clean, id: "a2", userId: "u1", jobId: "j2", status: "queued", job: { url: "https://boards.greenhouse.io/acme/jobs/123" } }], [{ subjectKey: submissionSubjectKey("u1", "j2") }]), me), true);
  // sibling that provably never sent (closed / NOT_SUBMITTED) → not a duplicate
  assert.equal(await postingAlreadyClaimed(fakeTx([{ ...clean, id: "a2", userId: "u1", jobId: "j2", status: "failed", submitConfirmation: "JOB_CLOSED", job: { url: "https://boards.greenhouse.io/acme/jobs/123" } }]), me), false);
  assert.equal(await postingAlreadyClaimed(fakeTx([{ ...clean, id: "a2", userId: "u1", jobId: "j2", status: "queued", job: { url: "https://boards.greenhouse.io/acme/jobs/123" } }]), me), false, "a queued sibling alone does not block; the first to begin wins");
  // a different posting or another user never blocks
  assert.equal(await postingAlreadyClaimed(fakeTx([{ ...clean, id: "a2", userId: "u1", jobId: "j2", status: "success", submittedVia: "portal_greenhouse", job: { url: "https://boards.greenhouse.io/acme/jobs/124" } }]), me), false);
  assert.equal(await postingAlreadyClaimed(fakeTx([{ ...clean, id: "a2", userId: "u2", jobId: "j1", status: "success", submittedVia: "portal_greenhouse", job: { url: "https://boards.greenhouse.io/acme/jobs/123" } }]), me), false);

  // structural: gate runs inside the locked begin transaction, before any reservation, on every channel
  const gates = readFileSync(new URL("../src/lib/application-worker-gates.ts", import.meta.url), "utf8");
  const begin = gates.slice(gates.indexOf("export async function beginApplicationSubmission"), gates.indexOf("export async function recheckApplicationSubmission"));
  assert(begin.includes("withLockedApplication(id, db"));
  assert(begin.indexOf("postingAlreadyClaimed(tx, row)") > begin.indexOf("hasPotentialSubmission(row)"));
  assert(begin.indexOf("postingAlreadyClaimed(tx, row)") < begin.indexOf("reserveSubmissionBudget("));
  assert(begin.includes("errorMessage: DUPLICATE_POSTING_MESSAGE"));
  const rollout = readFileSync(new URL("../src/lib/application-rollout.ts", import.meta.url), "utf8");
  assert(/export function historicalRetriesBlocked\(\): boolean \{ return true; \}/.test(rollout), "historicalRetriesBlocked() must stay");
  console.log("PASS application lifecycle: explicit status mapping for every legacy shape, typed failures, evidence (no PII, internal-only screenshots), manual fallback, bounded retry rules (never after possible submission), one submission per user+posting.");
})().catch((error) => { console.error(error); process.exit(1); });
