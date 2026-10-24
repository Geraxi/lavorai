import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { currentWorkerIneligibility, hasPotentialSubmission, continuationDestination, NOT_SUBMITTED, SUBMISSION_STARTED, type WorkerGateRow } from "../src/lib/application-worker-gates";

const now = new Date();
for (const url of ["https://boards.greenhouse.io/acme/jobs/123", "https://job-boards.greenhouse.io/acme/jobs/123?source=test", "https://boards.greenhouse.io/acme/jobs/123?gh_jid=456", "https://boards.greenhouse.io/embed/job_app?for=acme&token=123", "https://careers.example.invalid/?gh_jid=123"]) assert.equal(continuationDestination("portal_greenhouse", url), "greenhouse:123");
for (const url of ["https://greenhouse.io.evil.invalid/acme/jobs/123", "http://boards.greenhouse.io/acme/jobs/123", "https://boards.greenhouse.io/acme/jobs/123bad"]) assert.equal(continuationDestination("portal_greenhouse", url), null);
process.env.APPLICATION_SENDING_MODE = "manual_only";
process.env.APPLICATION_ROLLOUT_START_AT = new Date(+now - 60000).toISOString();
process.env.APPLY_GLOBAL_DAILY_CAP = "10";
const base = {
  id: "app", userId: "user", jobId: "job", sessionId: "round", status: "queued", startedAt: null, consentGrantedAt: now, createdAt: now, retryCount: 0,
  submissionReceiptJson: null, userProvidedAnswersJson: null, answerContinuationJson: null, pendingQuestionsJson: null, completedAt: null,
  cvDocxPath: null, submittedAt: null, submittedVia: null, submitConfirmation: null,
  canaryLog: null, answersUsedJson: null, viewedAt: null, lastReplyAt: null, replyCount: 0, userStatus: null,
  job: { closedAt: null, url: "https://boards.greenhouse.io/acme/jobs/123", recruiterEmail: null, title: "Product Designer", company: "Acme", description: "Product Designer", location: "Milano", remote: false, contractType: "employee", salaryMin: 60000, salaryMax: 70000 }, session: { id: "round", userId: "user", status: "active", sentCount: 27, targetCount: 30, title: "Product Designer", label: "Design" },
  user: { email: "synthetic@example.invalid", name: "Alex Example", yearsExperience: null, englishLevel: null, noticePeriod: null, tier: "pro", createdAt: now, trialEndsAt: null, trialGraceEndsAt: null,
    subscriptionStatus: "active", currentPeriodEnd: new Date(+now + 86400000), pausedUntil: null, suspendedAt: null,
    emailVerified: now, privacyConsentAt: now, avoidCompanies: null,
    cvProfile: { firstName: "", lastName: "", email: "", phone: "", city: "", title: "Product Designer", summary: "",
      experiencesJson: "[]", educationJson: "[]", skillsJson: "[]", languagesJson: "[]", linksJson: "[]" },
    preferences: { applicationAnswersJson: "{}", autoApplyMode: "auto", rolesJson: '["Product Designer"]', locationsJson: '["Milano"]', salaryMin: 50, employmentType: "employee", matchMin: 50, sourcesJson: '["sede"]' } },
} satisfies WorkerGateRow;
assert.equal(currentWorkerIneligibility(base), null);
for (const status of ["paused", "completed", "cancelled", "unknown"]) {
  assert.equal(currentWorkerIneligibility({ ...base, session: { ...base.session, status } }), "session_inactive");
}
assert.equal(currentWorkerIneligibility({ ...base, session: { ...base.session, sentCount: 30 } }), "session_capacity_reached");
for (const patch of [{ suspendedAt: now }, { privacyConsentAt: null }, { emailVerified: null },
  { subscriptionStatus: "paused" },
  { pausedUntil: new Date(+now + 86400000) }, { preferences: { ...base.user.preferences, autoApplyMode: "off" } }]) {
  assert.notEqual(currentWorkerIneligibility({ ...base, user: { ...base.user, ...patch } }), null);
}
// Billing lapses fall back to the free weekly quota (enforced under lock).
for (const patch of [{ subscriptionStatus: "pending_payment_method" }, { subscriptionStatus: "canceled" }, { subscriptionStatus: "past_due" }, { currentPeriodEnd: new Date(0) }]) {
  assert.equal(currentWorkerIneligibility({ ...base, user: { ...base.user, ...patch } }), null);
}
process.env.FREE_WEEKLY_APPLY_QUOTA = "0";
assert.equal(currentWorkerIneligibility({ ...base, user: { ...base.user, subscriptionStatus: "past_due" } }), "billing_ineligible", "quota 0 disables the free path");
delete process.env.FREE_WEEKLY_APPLY_QUOTA;
assert.equal(currentWorkerIneligibility({ ...base, job: { ...base.job, closedAt: now } }), "job_closed");
assert.equal(currentWorkerIneligibility({ ...base, user: { ...base.user, avoidCompanies: "  ACME  " } }), "company_avoided");
for (const mode of ["manual", "hybrid"]) {
  const row = { ...base, user: { ...base.user, preferences: { ...base.user.preferences, autoApplyMode: mode, matchMin: 100, locationsJson: '["Berlin"]' } } };
  assert.equal(currentWorkerIneligibility({ ...row, consentGrantedAt: null }), "rollout_explicit_consent_required");
  assert.equal(currentWorkerIneligibility({ ...row, consentGrantedAt: now }), null);
}
assert.equal(currentWorkerIneligibility({ ...base, consentGrantedAt: now, user: { ...base.user, preferences: { ...base.user.preferences, autoApplyMode: "off" } } }), "auto_apply_not_enabled");
assert.equal(currentWorkerIneligibility({ ...base, user: { ...base.user, preferences: { ...base.user.preferences, locationsJson: '["Berlin"]' } } }), null, "Location is a soft signal and explicit consent still delivers");
assert.equal(currentWorkerIneligibility({ ...base, user: { ...base.user, preferences: { ...base.user.preferences, locationsJson: "broken" } } }), null, "Explicit job consent overrides search preferences");
assert.equal(currentWorkerIneligibility({ ...base, user: { ...base.user, preferences: { ...base.user.preferences, matchMin: 100 } } }), null, "Explicit job consent overrides search preferences");
assert.equal(hasPotentialSubmission(base), false);
for (const patch of [{ submitConfirmation: SUBMISSION_STARTED }, { submitConfirmation: "UNCONFIRMED" },
  { submittedAt: now }, { submittedVia: "email_recruiter" }, { canaryLog: "{}" },
  { answersUsedJson: "[]" }, { replyCount: 1 }, { viewedAt: now }]) {
  assert.equal(hasPotentialSubmission({ ...base, ...patch }), true);
}
assert.equal(hasPotentialSubmission({ ...base, submitConfirmation: NOT_SUBMITTED, canaryLog: "{}" }), false);
assert.equal(hasPotentialSubmission({ ...base, submitConfirmation: NOT_SUBMITTED, submittedAt: now }), true);
const worker = readFileSync(new URL("../src/lib/application-worker.ts", import.meta.url), "utf8");
assert(worker.indexOf("reserveApplicationWork(applicationId)") < worker.indexOf("result = await optimizeCV("));
assert(worker.includes("if (prepared.count !== 1) return;"));
assert(worker.includes("published recruiter email"), "Verified published recruiter email must win over portal submit");
assert(worker.includes("findVerifiedRecruiterEmail"), "Recruiter email is resolved before portal submit");
assert(worker.includes("recruiterFromAddress"), "Recruiter From must use lavorai.it, not UserInbox");
assert(worker.includes("recruiterEmailAttemptKey"), "Recruiter send key must be per application/job/recipient");
assert(!worker.includes("ensureUserInbox"), "Recruiter send must not create a UserInbox");
assert(worker.includes('notSubmitted("failed", "recruiter_email_not_sent")'), "Email failure must persist proof-of-send");
assert(worker.includes('notSubmitted("needs_user", "recruiter_email_acceptance_unknown")'), "Uncertain email must persist proof-of-send");
const postgresFailureVm = readFileSync(new URL("./test-send-receive-postgres.ts", import.meta.url), "utf8");
assert(postgresFailureVm.includes("notSubmitted,"), "Postgres email-failure VM must bind notSubmitted");
assert(worker.includes('status: "optimizing", startedAt: workToken'));
assert(!worker.includes("MAX_ATTEMPTS"), "Unknown portal outcomes must not be retried");
assert(!worker.includes("markSessionSentSuccess"), "Success accounting must be atomic with the application result");
assert(!worker.includes('submitConfirmation: "DETECTED_LEGACY"'), "A click is not a confirmed receipt");
const claim = readFileSync(new URL("../src/lib/application-claim.ts", import.meta.url), "utf8");
assert(claim.includes('["applying", "submitting"].includes(app.status) || hasPotentialSubmission(app)'));
assert(claim.includes('status: app.status, startedAt: app.startedAt, completedAt: null'));
const healing = readFileSync(new URL("../src/lib/auto-apply-self-heal.ts", import.meta.url), "utf8");
assert(healing.includes("await recoverStuckApplications()"));
assert(healing.includes("...NO_PRIOR_DELIVERY"));
assert(!healing.includes('status: { in: ["queued", "optimizing", "applying", "submitting"] }'));
console.log("PASS worker current eligibility, delivery evidence, reservation integration and no ambiguous replay");
