/**
 * t124u gates: recovery-release default off, uncertain auto-retry standalone,
 * recruiter-email fallback default off. Fakes only.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import {
  CONTROLLED_RELEASE_MESSAGE,
  createMemoryReleaseDb,
  recoveryReleaseAllowlist,
  tryConsumeRecoveryRelease,
} from "../src/lib/application-recovery-release";
import { blocksUncertainAutoRetry, uncertainAutoRetryReason, UNCERTAIN_SUBMISSION_MESSAGE } from "../src/lib/uncertain-submission";
import {
  genericCompanyContactReason,
  postingSpecificRecruiterDecision,
  recruiterEmailFallbackEnabled,
  skipListEmailSendDecision,
} from "../src/lib/recruiter-email-fallback";
import { skipListBlocksAutoSend } from "../src/lib/queue-sendability";
import { historicalRetriesBlocked } from "../src/lib/application-rollout";
import { SKIPPED_ATS_MANUAL_MESSAGE } from "../src/lib/ats-skip-hosts";
import * as rollout from "../src/lib/application-rollout";
import * as continuation from "../src/lib/application-answer-continuation";
import * as paidPriority from "../src/lib/paid-priority";
import * as skipHosts from "../src/lib/ats-skip-hosts";
import * as drainLimits from "../src/lib/drain-limits";
import * as sendability from "../src/lib/queue-sendability";
import * as billing from "../src/lib/billing";
import { hasPotentialSubmission } from "../src/lib/application-worker-gates";
import * as applicationLease from "../src/lib/application-lease";
import * as recoveryRelease from "../src/lib/application-recovery-release";
import * as uncertainSubmission from "../src/lib/uncertain-submission";

assert.equal(historicalRetriesBlocked(), true, "historical replay stays disabled");
assert.deepEqual(recoveryReleaseAllowlist({}), { enabled: false, allowIds: new Set() });
assert.equal(recoveryReleaseAllowlist({ APPLICATION_RECOVERY_RELEASE: "on" }).enabled, false, "on without ids releases nothing");
assert.equal(recoveryReleaseAllowlist({ APPLICATION_RECOVERY_RELEASE: "a,b,c,d,e,f" }).enabled, false, "more than 5 ids fails closed");
assert.deepEqual([...recoveryReleaseAllowlist({ APPLICATION_RECOVERY_RELEASE: "app-a,app-b", APPLICATION_RECOVERY_RELEASE_CAP: "99" }).allowIds], ["app-a", "app-b"]);
assert.match(CONTROLLED_RELEASE_MESSAGE, /in attesa di rilascio controllato/);

assert.equal(uncertainAutoRetryReason({ submitStartedAt: new Date() }), "uncertain_submit_started");
assert.equal(uncertainAutoRetryReason({ submitClickPerformedAt: new Date() }), "uncertain_submit_started");
assert.equal(uncertainAutoRetryReason({ outboundSubmissionJson: "{}" }), "uncertain_outbound_request");
assert.equal(uncertainAutoRetryReason({ submitConfirmation: "UNCONFIRMED" }), "uncertain_submission");
assert.equal(uncertainAutoRetryReason({ submitConfirmation: "REJECTED_NOT_SENT" }), null, "explicit 4xx rejection is not uncertain");
assert.equal(uncertainAutoRetryReason({ submittedAt: new Date() }), "uncertain_prior_attempt");
assert.equal(uncertainAutoRetryReason({}), null);
assert.equal(blocksUncertainAutoRetry({ submitConfirmation: "UNCONFIRMED" }), true);
assert.equal(blocksUncertainAutoRetry({ submitConfirmation: "REJECTED_NOT_SENT" }), false);
assert.equal(UNCERTAIN_SUBMISSION_MESSAGE.includes("Nessun nuovo invio automatico"), true);

assert.equal(recruiterEmailFallbackEnabled({}), false);
assert.equal(skipListBlocksAutoSend({ url: "https://jobs.ashbyhq.com/acme/x", recruiterEmail: "talent@acme.com" }), true);
assert.equal(skipListEmailSendDecision({
  email: "hiring@acme.com",
  provenance: { sourceType: "job_description", extraction: "job_description" } as never,
}, { description: "Send your CV to hiring@acme.com" }).ok, false, "flag default off refuses send");
assert.deepEqual(skipListEmailSendDecision({
  email: "hiring@acme.com",
  provenance: { sourceType: "job_description", extraction: "job_description" } as never,
}, { description: "Send your CV to hiring@acme.com" }, { RECRUITER_EMAIL_FALLBACK_ENABLED: "on" }), { ok: true });
assert.equal(genericCompanyContactReason("privacy@acme.com", false), "generic_company_contact");
assert.equal(postingSpecificRecruiterDecision({
  email: "jobs@acme.com",
  provenance: { sourceType: "job_description", extraction: "job_description" } as never,
}, { description: "Apply on the site." }).ok, false);

process.env.APPLICATION_SENDING_MODE = "automatic";
process.env.APPLICATION_ROLLOUT_START_AT = new Date(Date.now() - 3_600_000).toISOString();
delete process.env.APPLICATION_RECOVERY_RELEASE;

const start = new Date(process.env.APPLICATION_ROLLOUT_START_AT);
const freshAt = new Date(+start + 60_000);
const now = new Date();

function loadClaim(prisma: unknown) {
  const dependencies: Record<string, unknown> = {
    "@/lib/application-rollout": rollout,
    "@/lib/application-pause": { applicationsPaused: () => false },
    "@/lib/application-answer-continuation": continuation,
    "./application-answer-continuation": continuation,
    "@/lib/paid-priority": paidPriority,
    "@/lib/drain-limits": drainLimits,
    "@/lib/queue-sendability": sendability,
    "@/lib/ats-skip-hosts": skipHosts,
    "@/lib/billing": billing,
    "@/lib/application-worker-gates": { hasPotentialSubmission },
    "@/lib/job-liveness": { JOB_LIVENESS_UNKNOWN_HELD_MESSAGE: "liveness-held" },
    "@/lib/application-lease": applicationLease,
    "./application-lease": applicationLease,
    "@/lib/application-recovery-release": recoveryRelease,
    "@/lib/uncertain-submission": uncertainSubmission,
    "@/lib/db": { prisma },
  };
  const module = { exports: {} as Record<string, unknown> };
  const code = ts.transpileModule(readFileSync("src/lib/application-claim.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(code, {
    module, exports: module.exports, Date, Map, Set, URL, console,
    process: { env: process.env },
    require: (name: string) => {
      if (!(name in dependencies)) throw new Error(`Unexpected dependency ${name}`);
      return dependencies[name];
    },
  }, { filename: "src/lib/application-claim.ts" });
  return module.exports as { recoverExpiredQueuedClaims: (now?: Date) => Promise<number> };
}

function match(value: any, condition: any): boolean {
  if (condition === null || typeof condition !== "object" || condition instanceof Date) {
    return value instanceof Date && condition instanceof Date ? +value === +condition : value === condition;
  }
  return Object.entries(condition).every(([key, expected]: [string, any]) => {
    if (key === "gt") return value != null && +value > +expected;
    if (key === "gte") return value != null && +value >= +expected;
    if (key === "lt") return value != null && +value < +expected;
    if (key === "lte") return value != null && +value <= +expected;
    if (key === "in") return expected.includes(value);
    if (key === "not") return expected === null ? value != null : !match(value, expected);
    if (key === "OR") return expected.some((c: any) => match(value, c));
    if (key === "AND") return expected.every((c: any) => match(value, c));
    return match(value?.[key], expected);
  });
}

async function testRecoveredLeaseStaysHeld() {
  const stale = new Date(Date.now() - 25 * 60_000);
  const rows = [{
    id: "expired", userId: "paid", status: "queued", createdAt: freshAt, consentGrantedAt: freshAt,
    answerContinuationJson: null, retryCount: 0, startedAt: stale, leaseToken: "dead",
    leaseExpiresAt: new Date(Date.now() - 1000), submitStartedAt: null, completedAt: null,
    submittedAt: null, submittedVia: null, submitConfirmation: null, canaryLog: null,
    answersUsedJson: null, viewedAt: null, lastReplyAt: null, replyCount: 0, userStatus: null,
    errorMessage: null,
  }];
  const prisma = {
    application: {
      findMany: async ({ where }: any) => rows.filter((r) => match(r, where)),
      updateMany: async ({ where, data }: any) => {
        const hits = rows.filter((r) => match(r, where));
        for (const r of hits) Object.assign(r, data);
        return { count: hits.length };
      },
    },
  };
  const claims = loadClaim(prisma);
  const recovered = await claims.recoverExpiredQueuedClaims(now);
  assert.equal(recovered, 1);
  assert.ok(rows[0].startedAt, "default gate keeps the recovered row held");
  assert.equal(rows[0].errorMessage, CONTROLLED_RELEASE_MESSAGE);
  assert.notEqual(rows[0].startedAt, null);
}

function testSourceFences() {
  const claim = readFileSync("src/lib/application-claim.ts", "utf8");
  assert.match(claim, /blocksUncertainAutoRetry/);
  assert.match(claim, /tryConsumeRecoveryRelease/);
  const gates = readFileSync("src/lib/application-worker-gates.ts", "utf8");
  assert.match(gates, /controlled_release/);
  const retry = readFileSync("src/app/api/admin/retry-captcha/route.ts", "utf8");
  assert.match(retry, /blocksUncertainAutoRetry/);
  const requeue = readFileSync("src/app/api/admin/requeue-stuck/route.ts", "utf8");
  assert.match(requeue, /blocksUncertainAutoRetry/);
  const recheck = readFileSync("src/lib/skip-list-handoff-recheck.ts", "utf8");
  assert.match(recheck, /skipListEmailSendDecision/);
  assert.match(recheck, /recruiter_email_fallback_disabled|skipListEmailSendDecision/);
  assert.equal(SKIPPED_ATS_MANUAL_MESSAGE.includes("Nessun invio effettuato"), true);
}

async function testDbBackedAllowlist() {
  const env = { APPLICATION_RECOVERY_RELEASE: "keep-me,also" };
  const db = createMemoryReleaseDb();
  assert.equal(await tryConsumeRecoveryRelease("keep-me", { db, env }), true);
  assert.equal(await tryConsumeRecoveryRelease("keep-me", { db, env }), false, "never released twice");
  assert.equal(await tryConsumeRecoveryRelease("also", { db, env }), true);
  assert.equal(await tryConsumeRecoveryRelease("other", { db, env }), false);
  assert.equal(await tryConsumeRecoveryRelease("any", { db, env: {} }), false);
  const on = createMemoryReleaseDb();
  assert.equal(await tryConsumeRecoveryRelease("any", { db: on, env: { APPLICATION_RECOVERY_RELEASE: "on" } }), false);
}

async function main() {
  await testDbBackedAllowlist();
  await testRecoveredLeaseStaysHeld();
  testSourceFences();
  console.log("PASS incident release gates: recovery default off, uncertain standalone, recruiter-email fallback held");
}
main().catch((error) => { console.error(error); process.exit(1); });
