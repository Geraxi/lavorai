import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { currentWorkerIneligibility, hasPotentialSubmission, NOT_SUBMITTED, SUBMISSION_STARTED, type WorkerGateRow } from "../src/lib/application-worker-gates";

const now = new Date();
const base = {
  id: "app", userId: "user", jobId: "job", sessionId: "round", status: "queued", startedAt: null, consentGrantedAt: null,
  cvDocxPath: null, submittedAt: null, submittedVia: null, submitConfirmation: null,
  canaryLog: null, answersUsedJson: null, viewedAt: null, lastReplyAt: null, replyCount: 0, userStatus: null,
  job: { closedAt: null, url: "https://boards.greenhouse.io/acme/jobs/123", title: "Product Designer", company: "Acme", description: "Product Designer", location: "Milano", remote: false, contractType: "employee", salaryMin: 60000, salaryMax: 70000 }, session: { id: "round", userId: "user", status: "active", sentCount: 27, targetCount: 30, title: "Product Designer", label: "Design" },
  user: { email: "synthetic@example.invalid", tier: "pro", createdAt: now, trialEndsAt: null, trialGraceEndsAt: null,
    subscriptionStatus: "active", currentPeriodEnd: new Date(+now + 86400000), pausedUntil: null, suspendedAt: null,
    emailVerified: now, privacyConsentAt: now, avoidCompanies: null,
    cvProfile: { firstName: "", lastName: "", email: "", phone: "", city: "", title: "Product Designer", summary: "",
      experiencesJson: "[]", educationJson: "[]", skillsJson: "[]", languagesJson: "[]", linksJson: "[]" },
    preferences: { autoApplyMode: "auto", rolesJson: '["Product Designer"]', locationsJson: '["Milano"]', salaryMin: 50, employmentType: "employee", matchMin: 50 } },
} satisfies WorkerGateRow;
assert.equal(currentWorkerIneligibility(base), null);
for (const status of ["paused", "completed", "cancelled", "unknown"]) {
  assert.equal(currentWorkerIneligibility({ ...base, session: { ...base.session, status } }), "session_inactive");
}
assert.equal(currentWorkerIneligibility({ ...base, session: { ...base.session, sentCount: 30 } }), "session_capacity_reached");
for (const patch of [{ suspendedAt: now }, { privacyConsentAt: null }, { emailVerified: null },
  { subscriptionStatus: "past_due" }, { subscriptionStatus: "paused" }, { currentPeriodEnd: new Date(0) },
  { pausedUntil: new Date(+now + 86400000) }, { preferences: { ...base.user.preferences, autoApplyMode: "off" } }]) {
  assert.notEqual(currentWorkerIneligibility({ ...base, user: { ...base.user, ...patch } }), null);
}
assert.equal(currentWorkerIneligibility({ ...base, job: { ...base.job, closedAt: now } }), "job_closed");
assert.equal(currentWorkerIneligibility({ ...base, user: { ...base.user, avoidCompanies: "  ACME  " } }), "company_avoided");
for (const mode of ["manual", "hybrid"]) {
  const row = { ...base, user: { ...base.user, preferences: { ...base.user.preferences, autoApplyMode: mode, matchMin: 100, locationsJson: '["Berlin"]' } } };
  assert.equal(currentWorkerIneligibility(row), "auto_apply_not_enabled");
  assert.equal(currentWorkerIneligibility({ ...row, consentGrantedAt: now }), null);
}
assert.equal(currentWorkerIneligibility({ ...base, consentGrantedAt: now, user: { ...base.user, preferences: { ...base.user.preferences, autoApplyMode: "off" } } }), "auto_apply_not_enabled");
assert.equal(currentWorkerIneligibility({ ...base, user: { ...base.user, preferences: { ...base.user.preferences, locationsJson: '["Berlin"]' } } }), "preference_location");
assert.equal(currentWorkerIneligibility({ ...base, user: { ...base.user, preferences: { ...base.user.preferences, locationsJson: "broken" } } }), "preferences_unverified");
assert.equal(currentWorkerIneligibility({ ...base, user: { ...base.user, preferences: { ...base.user.preferences, matchMin: 100 } } }), "preference_match_threshold");
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
