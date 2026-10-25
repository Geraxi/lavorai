/**
 * Default-off recruiter/fallback email gate covers every employer
 * application-email entry point. User-facing notification emails (to our
 * own users) stay allowed. An empty address is not a control.
 * Fakes only — no Resend, no live send.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { recruiterEmailFallbackEnabled, skipListEmailSendDecision } from "../src/lib/recruiter-email-fallback";
import { skipListBlocksAutoSend } from "../src/lib/queue-sendability";
import { sendRecruiterEmailOnce } from "../src/lib/recruiter-delivery";
import { applicationsPaused } from "../src/lib/application-pause";

const posting = {
  email: "hiring@acme.com",
  provenance: { sourceType: "job_description", extraction: "job_description" } as never,
};
const job = { description: "Send your CV to hiring@acme.com" };

assert.equal(recruiterEmailFallbackEnabled({}), false);
assert.equal(recruiterEmailFallbackEnabled({ RECRUITER_EMAIL_FALLBACK_ENABLED: "" }), false);
assert.equal(applicationsPaused(), false);

function load(path: string, extra: Record<string, unknown> = {}): any {
  const source = readFileSync(path, "utf8");
  const exports = {};
  const mocks: Record<string, unknown> = {
    "next/server": { NextResponse: { json: (body: unknown, options?: { status?: number }) => ({ body, status: options?.status ?? 200 }) } },
    "@/lib/application-pause": { applicationsPaused: () => false },
    "@/lib/deployed-version": { deployedAppVersion: () => "test-sha" },
    ...extra,
  };
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  new Function("require", "exports", js)((name: string) => {
    if (!(name in mocks)) throw new Error(`Unexpected dependency ${name} from ${path}`);
    return mocks[name];
  }, exports);
  return exports;
}

const GATED_PATHS: Array<{ name: string; file: string; needle: RegExp; note: string }> = [
  {
    name: "auto-apply cron admit",
    file: "src/lib/auto-apply-cron.ts",
    needle: /skipListEmailSendDecision/,
    note: "/api/cron/auto-apply (0 8,9,12,13,16,17 UTC) records an inbox but will not queue a send",
  },
  {
    name: "auto-apply HTTP route",
    file: "src/app/api/cron/auto-apply/route.ts",
    needle: /runAutoApplyCron|drainQueuedApplications/,
    note: "route only creates/drains; employer Resend is the worker gate",
  },
  {
    name: "drain-queue HTTP route",
    file: "src/app/api/cron/drain-queue/route.ts",
    needle: /drainQueuedApplications/,
    note: "/api/cron/drain-queue every 5 min; GitHub Actions backup hits this same endpoint",
  },
  {
    name: "drain worker sendability",
    file: "src/lib/queue-sendability.ts",
    needle: /recruiterEmailFallbackEnabled/,
    note: "drain will not claim skip-list rows while the gate is off",
  },
  {
    name: "processApplication employer email",
    file: "src/lib/application-worker.ts",
    needle: /recruiterEmail && recruiterEmailFallbackEnabled\(\)/,
    note: "drain / process / admin test-apply / captcha-fallback all share this send",
  },
  {
    name: "nudges cascade (self-heal + auto-apply)",
    file: "src/app/api/cron/nudges/route.ts",
    needle: /runCronSelfHeal|runAutoApplyCron/,
    note: "/api/cron/nudges 0 10 UTC: job sync, self-heal (skip-list recheck), auto-apply, then user nudges",
  },
  {
    name: "skip-list recheck",
    file: "src/lib/skip-list-handoff-recheck.ts",
    needle: /skipListEmailSendDecision/,
    note: "recheck may persist an address; it must not enqueue while the gate is off",
  },
  {
    name: "cron self-heal",
    file: "src/lib/cron-self-heal.ts",
    needle: /recheckSkippedAtsHandoffs/,
    note: "self-heal only invokes the recheck; it has no employer Resend of its own",
  },
  {
    name: "admin test-apply",
    file: "src/app/api/admin/test-apply/route.ts",
    needle: /processApplication/,
    note: "admin test-apply is the same worker send path",
  },
  {
    name: "Resend employer boundary",
    file: "src/lib/recruiter-delivery.ts",
    needle: /recruiterEmailFallbackEnabled/,
    note: "sendRecruiterEmailOnce refuses before contacting Resend",
  },
];

for (const entry of GATED_PATHS) {
  const source = readFileSync(entry.file, "utf8");
  assert.match(source, entry.needle, `${entry.name} (${entry.file}): ${entry.note}`);
  if (entry.file.startsWith("src/app/api/cron/") || entry.file === "src/lib/queue-sendability.ts") {
    assert.doesNotMatch(source, /sendRecruiterEmailOnce|new Resend\(/, `${entry.file} must not open its own employer Resend client`);
  }
}

const USER_FACING: Array<{ name: string; file: string; to: RegExp }> = [
  { name: "mailbox-digest cron", file: "src/app/api/cron/mailbox-digest/route.ts", to: /runMailboxDigest/ },
  { name: "mailbox-delivery cron", file: "src/app/api/cron/mailbox-delivery/route.ts", to: /checkMailboxDeliveries/ },
  { name: "weekly digest", file: "src/lib/weekly-digest.ts", to: /to:\s*u\.email/ },
  { name: "daily summary", file: "src/lib/daily-summary.ts", to: /to:\s*user\.email/ },
  { name: "onboarding nudge", file: "src/lib/onboarding-nudge.ts", to: /to:\s*u\.email|to:\s*c\.email/ },
  { name: "mailbox notify", file: "src/lib/application-mailbox-notify.ts", to: /userEmail|Never auto-replies to employers/ },
];

for (const entry of USER_FACING) {
  const source = readFileSync(entry.file, "utf8");
  assert.match(source, entry.to, `${entry.name} emails our users, not employers`);
  assert.doesNotMatch(source, /sendRecruiterEmailOnce|deliverApplicationToRecruiter/, `${entry.name} is not an employer application send`);
}

const worker = readFileSync("src/lib/application-worker.ts", "utf8");
assert.ok(
  worker.indexOf("recruiterEmailFallbackEnabled") < worker.indexOf("deliverApplicationToRecruiter"),
  "Gate must run before the employer Resend wrapper",
);
assert.match(worker, /clickedOrPosted \|\| !recruiterEmailFallbackEnabled/, "Captcha email fallback is gated");

const selfHeal = readFileSync("src/lib/auto-apply-self-heal.ts", "utf8");
assert.match(selfHeal, /ADMIN_ALERT_EMAIL/, "Self-heal Resend is the admin alert, not an employer application");
assert.doesNotMatch(selfHeal, /deliverApplicationToRecruiter|sendRecruiterEmailOnce/);

assert.equal(skipListBlocksAutoSend({ url: "https://jobs.ashbyhq.com/acme/x", recruiterEmail: "talent@acme.com" }), true);
assert.equal(skipListEmailSendDecision(posting, job).ok, false);
assert.equal(skipListEmailSendDecision(posting, job).ok === false && skipListEmailSendDecision(posting, job).reason, "recruiter_email_fallback_disabled");

async function main() {
const previous = process.env.RECRUITER_EMAIL_FALLBACK_ENABLED;
delete process.env.RECRUITER_EMAIL_FALLBACK_ENABLED;
let sends = 0;
const gated = await sendRecruiterEmailOnce({
  applicationId: "synthetic",
  attemptKey: "gate-off",
  recipient: "hiring@acme.com",
  recipientProvenanceJson: "{}",
  payload: { from: "test@example.invalid", to: "hiring@acme.com", subject: "Test", text: "Synthetic" },
}, {
  send: async () => { sends++; throw new Error("gate off must not call Resend"); },
  createAttempt: async () => { throw new Error("gate off must not persist an attempt"); },
  withinQuota: async () => { throw new Error("gate off must not take quota"); },
  findAttempt: async () => null,
  accepted: async () => {},
  uncertain: async () => {},
});
assert.deepEqual(gated, { kind: "not_sent", reason: "recruiter_email_fallback_disabled" });
assert.equal(sends, 0, "sendRecruiterEmailOnce: no Resend when the gate is off");

const cronSecret = "synthetic-gate-test";
process.env.CRON_SECRET = cronSecret;
const auth = { headers: { get: (n: string) => n.toLowerCase() === "authorization" ? `Bearer ${cronSecret}` : null } };

assert.match(readFileSync("src/app/api/cron/drain-queue/route.ts", "utf8"), /applicationsPaused\(\)/);
assert.match(readFileSync("src/app/api/cron/auto-apply/route.ts", "utf8"), /applicationsPaused\(\)/);
assert.match(readFileSync("src/lib/auto-apply-cron.ts", "utf8"), /skipListEmailSendDecision/);
assert.match(readFileSync("src/lib/queue-drain.ts", "utf8"), /processApplication/);

{
  let digestSends = 0;
  const digest = load("src/app/api/cron/mailbox-digest/route.ts", {
    "@/lib/application-mailbox-digest": { runMailboxDigest: async ({ send }: { send: (m: { to: string }) => Promise<string | null> }) => {
      await send({ to: "user@example.test" });
      return { sent: 1, skipped: 0, errors: 0 };
    } },
    "@/lib/application-mailbox-notify": { createResendMailboxMailer: () => async (m: { to: string }) => { digestSends++; assert.match(m.to, /@example\.test$/); return "user-mail"; } },
  });
  const out = await digest.GET(auth);
  assert.equal(out.body.ok, true);
  assert.equal(digestSends, 1, "mailbox-digest may email our users while the employer gate is off");
}

{
  let checked = 0;
  const delivery = load("src/app/api/cron/mailbox-delivery/route.ts", {
    "@/lib/mailbox/service": { checkMailboxDeliveries: async () => { checked++; return { checked: 0, confirmed: 0, bounced: 0, unverified: 0 }; } },
    "@/lib/mailbox/runtime": { realMailboxDeps: () => ({}) },
  });
  const out = await delivery.GET(auth);
  assert.equal(out.body.ok, true);
  assert.equal(checked, 1, "mailbox-delivery is a bounce reread, not an employer send");
  assert.doesNotMatch(readFileSync("src/app/api/cron/mailbox-delivery/route.ts", "utf8"), /sendRecruiterEmailOnce|sendApprovedMailbox/);
}

{
  let heal = 0;
  let apply = 0;
  let userMail = 0;
  const unavailable = () => { throw new Error("unused nudge dependency"); };
  const nudges = load("src/app/api/cron/nudges/route.ts", {
    "@/lib/onboarding-nudge": { runOnboardingNudges: async () => { userMail++; return { sent: 0 }; } },
    "@/lib/upgrade-nudge": { runUpgradeNudges: async () => { userMail++; return { sent: 0 }; } },
    "@/lib/auto-apply-cron": { runAutoApplyCron: async () => { apply++; return { applicationsEnqueued: 0 }; } },
    "@/lib/scrapers/sync-jobs": { syncAtsJobs: async () => ({}) },
    "@/lib/cron-self-heal": { runCronSelfHeal: async () => { heal++; return { appsRecoveredSafely: 0 }; } },
    "@/lib/no-reply-followup": { runNoReplyFollowups: async () => ({}) },
    "@/lib/daily-summary": { runDailySummary: async () => { userMail++; return { sent: 0 }; } },
    "@/lib/weekly-digest": { runWeeklyDigest: async () => { userMail++; return { sent: 0 }; } },
    "@/lib/trial": { runTrialNudges: async () => { userMail++; return { sent: 0 }; } },
    "@/lib/checkout-recovery": { runCheckoutRecovery: async () => { userMail++; return { sent: 0 }; } },
    "@/lib/application-mailbox-digest": { runMailboxDigest: async () => { userMail++; return { sent: 0 }; } },
    "@/lib/application-mailbox-notify": { createResendMailboxMailer: () => async () => "user-mail" },
    "@/lib/application-mailbox-store": { purgeExpiredMailbox: async () => ({}) },
  });
  void unavailable;
  const out = await nudges.GET(auth);
  assert.equal(out.body.ok, true);
  assert.equal(heal, 1, "nudges cascade runs self-heal (skip-list recheck) when not paused");
  assert.equal(apply, 1, "nudges cascade runs auto-apply when not paused");
  assert.ok(userMail >= 1, "nudges still send user-facing mail");
}

const vercel = readFileSync("vercel.json", "utf8");
assert.match(vercel, /"path": "\/api\/cron\/mailbox-delivery"/);
assert.match(vercel, /"path": "\/api\/cron\/mailbox-digest"/);
assert.match(vercel, /"path": "\/api\/cron\/drain-queue"/);
assert.match(vercel, /"path": "\/api\/cron\/auto-apply"/);
assert.match(vercel, /"path": "\/api\/cron\/nudges"/);
assert.match(readFileSync(".github/workflows/drain-queue.yml", "utf8"), /https:\/\/lavorai\.it\/api\/cron\/drain-queue/);

if (previous === undefined) delete process.env.RECRUITER_EMAIL_FALLBACK_ENABLED;
else process.env.RECRUITER_EMAIL_FALLBACK_ENABLED = previous;
delete process.env.CRON_SECRET;

console.log("PASS employer-email gate: every employer application entry point is default-off; user-facing mail stays allowed");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
