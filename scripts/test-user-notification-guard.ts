import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import ts from "typescript";
import {
  isScheduledUserNotificationKind,
  isStaleScheduledReminder,
  parseUserNotificationsCutoff,
  resetUserNotificationsHoldLogForTests,
  romeYmd,
  scheduledUserNotificationsHeld,
  userNotificationsHoldFlag,
  weeklyDigestMondayRome,
  weeklyDigestWeekEligible,
} from "../src/lib/user-notification-guard";
import { onboardingNudgeDueAt } from "../src/lib/onboarding-nudge";
import { upgradeNudgeEventAt } from "../src/lib/upgrade-nudge";
import { trialStageEntryAt } from "../src/lib/trial";

const CUTOFF = "2026-10-25T16:00:00.000Z";
const CUTOFF_DATE = new Date(CUTOFF);

function load(path: string, mocks: Record<string, unknown> = {}): any {
  const exports = {};
  const source = ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  new Function("require", "exports", source)((name: string) => mocks[name] ?? {}, exports);
  return exports;
}

function withEnv(values: Record<string, string | undefined>, run: () => void | Promise<void>) {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(values)) {
    previous.set(key, process.env[key]);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  const restore = () => {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    resetUserNotificationsHoldLogForTests();
  };
  try {
    const result = run();
    if (result && typeof (result as Promise<void>).then === "function") {
      return (result as Promise<void>).finally(restore);
    }
    restore();
  } catch (error) {
    restore();
    throw error;
  }
}

function resendSpy() {
  const sends: unknown[] = [];
  return {
    sends,
    Resend: class {
      emails = {
        send: async (payload: unknown) => {
          sends.push(payload);
          return { data: { id: "re_mock" }, error: null };
        },
      };
    },
  };
}

function quotaAllow() {
  return {
    sendWithinQuota: async (_kind: string, _to: string, sendFn: () => Promise<void>) => {
      await sendFn();
      return { sent: true, reason: null };
    },
  };
}

async function main() {
  resetUserNotificationsHoldLogForTests();
  assert.equal(parseUserNotificationsCutoff({ USER_NOTIFICATIONS_NOT_BEFORE: CUTOFF })?.toISOString(), CUTOFF);
  assert.equal(parseUserNotificationsCutoff({ USER_NOTIFICATIONS_NOT_BEFORE: "2026-10-25T18:00:00+02:00" })?.toISOString(), CUTOFF);
  assert.equal(parseUserNotificationsCutoff({ USER_NOTIFICATIONS_NOT_BEFORE: "2026-10-25" }), null);
  assert.equal(parseUserNotificationsCutoff({ USER_NOTIFICATIONS_NOT_BEFORE: "2026-10-25T16:00:00" }), null);
  assert.equal(parseUserNotificationsCutoff({}), null);
  assert.equal(userNotificationsHoldFlag({ USER_NOTIFICATIONS_HOLD: "true" }), true);
  assert.equal(userNotificationsHoldFlag({ USER_NOTIFICATIONS_HOLD: "false" }), false);

  assert.deepEqual(scheduledUserNotificationsHeld({ USER_NOTIFICATIONS_HOLD: "true", USER_NOTIFICATIONS_NOT_BEFORE: CUTOFF }), {
    held: true, reason: "hold",
  });
  resetUserNotificationsHoldLogForTests();
  assert.deepEqual(scheduledUserNotificationsHeld({}), { held: true, reason: "cutoff_unset" });
  resetUserNotificationsHoldLogForTests();
  assert.deepEqual(scheduledUserNotificationsHeld({ USER_NOTIFICATIONS_NOT_BEFORE: CUTOFF }), {
    held: false, cutoff: CUTOFF_DATE,
  });

  assert.equal(isStaleScheduledReminder(new Date("2026-10-25T15:59:59.000Z"), CUTOFF_DATE), true);
  assert.equal(isStaleScheduledReminder(CUTOFF_DATE, CUTOFF_DATE), false);
  assert.equal(isScheduledUserNotificationKind("onboarding_nudge"), true);
  assert.equal(isScheduledUserNotificationKind("welcome"), false);
  assert.equal(isScheduledUserNotificationKind("daily_summary"), false);

  const signup = new Date("2026-10-01T10:00:00.000Z");
  const firstDue = onboardingNudgeDueAt({
    step: "cv", createdAt: signup, emailVerified: signup, firstCvAt: null, preferencesUpdatedAt: null, lastNudgeAt: null,
  });
  assert.equal(firstDue.toISOString(), "2026-10-01T16:00:00.000Z");
  assert.equal(isStaleScheduledReminder(firstDue, CUTOFF_DATE), true);

  const laterStageDue = onboardingNudgeDueAt({
    step: "preferences",
    createdAt: signup,
    emailVerified: signup,
    firstCvAt: new Date("2026-10-26T09:00:00.000Z"),
    preferencesUpdatedAt: null,
    lastNudgeAt: null,
  });
  assert.equal(laterStageDue.toISOString(), "2026-10-26T15:00:00.000Z");
  assert.equal(isStaleScheduledReminder(laterStageDue, CUTOFF_DATE), false);

  const nextAfterNudge = onboardingNudgeDueAt({
    step: "cv", createdAt: signup, emailVerified: signup, firstCvAt: null, preferencesUpdatedAt: null,
    lastNudgeAt: new Date("2026-10-22T16:00:00.000Z"),
  });
  assert.equal(nextAfterNudge.toISOString(), "2026-10-27T16:00:00.000Z");

  assert.equal(
    upgradeNudgeEventAt({
      reason: "no_apps", createdAt: signup, limitHitAt: null, latestApplicationAt: null,
    }).toISOString(),
    "2026-10-06T10:00:00.000Z",
  );
  const freshApp = new Date("2026-10-26T12:00:00.000Z");
  assert.equal(
    upgradeNudgeEventAt({
      reason: "generic", createdAt: signup, limitHitAt: null, latestApplicationAt: freshApp,
    }).toISOString(),
    freshApp.toISOString(),
  );
  assert.equal(
    upgradeNudgeEventAt({
      reason: "limit_hit", createdAt: signup, limitHitAt: freshApp, latestApplicationAt: freshApp,
    }).toISOString(),
    freshApp.toISOString(),
  );

  assert.equal(trialStageEntryAt("trial_day_3", signup, new Date("2026-10-08T10:00:00.000Z")).toISOString(), "2026-10-04T10:00:00.000Z");
  assert.equal(trialStageEntryAt("trial_ended", signup, new Date("2026-10-08T10:00:00.000Z")).toISOString(), "2026-10-08T10:00:00.000Z");
  assert.equal(weeklyDigestMondayRome(new Date("2026-10-25T16:00:00.000Z")), "2026-10-19");
  assert.equal(weeklyDigestWeekEligible(new Date("2026-10-25T16:00:00.000Z"), new Date("2026-10-25T00:00:00.000Z")), false);
  assert.equal(weeklyDigestWeekEligible(new Date("2026-10-26T08:00:00.000Z"), new Date("2026-10-25T00:00:00.000Z")), true);
  assert.equal(romeYmd(new Date("2026-10-26T10:00:00.000Z")), "2026-10-26");

  const guard = await import("../src/lib/user-notification-guard");
  const pause = { applicationsPaused: () => false };
  const quotaPrisma = { emailLog: { count: async () => 0, create: async () => ({}) } };
  const quota = load("src/lib/email-quota.ts", {
    "@/lib/application-pause": pause,
    "@/lib/db": { prisma: quotaPrisma },
    "@/lib/user-notification-guard": guard,
  });

  await withEnv({
    USER_NOTIFICATIONS_HOLD: "true",
    USER_NOTIFICATIONS_NOT_BEFORE: CUTOFF,
    APPLICATIONS_PAUSED: "false",
  }, async () => {
    let scheduledSends = 0;
    let authSends = 0;
    for (const kind of ["onboarding_nudge", "upgrade_nudge", "weekly_digest", "trial_day_3", "trial_day_6", "trial_ended", "checkout_recovery", "checkout_feedback"]) {
      const result = await quota.sendWithinQuota(kind, "user@example.invalid", async () => { scheduledSends++; });
      assert.deepEqual(result, { sent: false, reason: "user_notifications_held" });
    }
    assert.equal(scheduledSends, 0);
    for (const kind of ["signup_verify", "password_reset", "welcome", "magic_link", "daily_summary", "founder_alert"]) {
      const result = await quota.sendWithinQuota(kind, "user@example.invalid", async () => { authSends++; });
      assert.equal(result.sent, true, kind);
    }
    assert.equal(authSends, 6);
  });

  await withEnv({
    USER_NOTIFICATIONS_HOLD: undefined,
    USER_NOTIFICATIONS_NOT_BEFORE: undefined,
    APPLICATIONS_PAUSED: "false",
  }, async () => {
    resetUserNotificationsHoldLogForTests();
    const result = await quota.sendWithinQuota("weekly_digest", "user@example.invalid", async () => { throw new Error("must not send"); });
    assert.deepEqual(result, { sent: false, reason: "user_notifications_held" });
  });

  const jobs = [
    ["src/lib/onboarding-nudge.ts", "runOnboardingNudges"],
    ["src/lib/upgrade-nudge.ts", "runUpgradeNudges"],
    ["src/lib/weekly-digest.ts", "runWeeklyDigest"],
    ["src/lib/trial.ts", "runTrialNudges"],
    ["src/lib/checkout-recovery.ts", "runCheckoutRecovery"],
    ["src/lib/checkout-feedback.ts", "runCheckoutFeedbackCampaign"],
  ] as const;

  await withEnv({
    USER_NOTIFICATIONS_HOLD: "true",
    USER_NOTIFICATIONS_NOT_BEFORE: CUTOFF,
    RESEND_API_KEY: "re_must_not_be_used",
    APPLICATIONS_PAUSED: "false",
  }, async () => {
    for (const [file, method] of jobs) {
      const spy = resendSpy();
      const loaded = load(file, {
        "@/lib/db": { prisma: {} },
        "@/lib/email-quota": quotaAllow(),
        "@/lib/admin": { isTestAccount: () => false },
        "@/lib/user-notification-guard": guard,
        "@/lib/billing": { trialState: () => ({ status: "none" }), trialEnd: (u: { trialEndsAt: Date }) => u.trialEndsAt },
        "@/lib/email-brand": { renderBrandEmail: () => ({ html: "", text: "" }), esc: (s: string) => s },
        "@/lib/lifecycle-cadence": { isCheckoutRecoveryWindow: () => true, trialLifecycleStage: () => null },
        "@/lib/role-match": { titleMatchesAnyRole: () => true },
        resend: spy,
      });
      const result = await loaded[method]({ force: true });
      const sent = result.sent ?? (result.day3 ?? 0) + (result.day6 ?? 0) + (result.ended ?? 0);
      assert.equal(sent, 0, method);
      assert.ok(result.held >= 1, `${method} held count`);
      assert.equal(spy.sends.length, 0, `${method} no Resend`);
      const blob = JSON.stringify(result);
      assert.match(blob, /user_notifications_held/);
    }
  });

  const nowMs = Date.now();
  const liveCutoff = new Date(nowMs - 2 * 86_400_000).toISOString().replace(/\.\d+Z$/, ".000Z");
  const oldUser = {
    id: "u-old",
    email: "old@example.invalid",
    name: "Ada",
    locale: "it",
    emailVerified: new Date(nowMs - 10 * 3_600_000),
    createdAt: new Date(nowMs - 60 * 86_400_000),
    onboardedAt: null,
    tier: "free",
    trialEndsAt: new Date(nowMs + 3 * 86_400_000),
    trialGraceEndsAt: null,
    stripeSubscriptionId: null,
    subscriptionStatus: null,
    suspendedAt: null,
    preferences: { rolesJson: "[]", updatedAt: new Date(nowMs - 8 * 3_600_000), locationsJson: "[]" },
    cvDocuments: [{ createdAt: new Date(nowMs - 8 * 3_600_000) }],
    _count: { cvDocuments: 1, applications: 0 },
  };

  await withEnv({
    USER_NOTIFICATIONS_HOLD: undefined,
    USER_NOTIFICATIONS_NOT_BEFORE: liveCutoff,
    RESEND_API_KEY: "re_mock",
    APPLICATIONS_PAUSED: "false",
  }, async () => {
    const spy = resendSpy();
    const onboarding = load("src/lib/onboarding-nudge.ts", {
      "@/lib/db": {
        prisma: {
          user: { findMany: async () => [oldUser] },
          emailLog: { findMany: async () => [] },
        },
      },
      "@/lib/email-quota": quotaAllow(),
      "@/lib/admin": { isTestAccount: () => false },
      "@/lib/user-notification-guard": guard,
      resend: spy,
    });
    const sent = await onboarding.runOnboardingNudges({});
    assert.equal(sent.sent, 1, "old user, post-cutoff stage sends");
    assert.equal(spy.sends.length, 1);
    assert.equal((spy.sends[0] as { to: string }).to, "old@example.invalid");

    const staleUser = {
      ...oldUser,
      id: "u-stale",
      email: "stale@example.invalid",
      emailVerified: new Date("2026-10-01T10:00:00.000Z"),
      cvDocuments: [],
      preferences: { rolesJson: "[]", updatedAt: new Date("2026-10-01T10:00:00.000Z") },
      _count: { applications: 0 },
    };
    const staleSpy = resendSpy();
    const staleJob = load("src/lib/onboarding-nudge.ts", {
      "@/lib/db": {
        prisma: {
          user: { findMany: async () => [staleUser] },
          emailLog: { findMany: async () => [] },
        },
      },
      "@/lib/email-quota": quotaAllow(),
      "@/lib/admin": { isTestAccount: () => false },
      "@/lib/user-notification-guard": guard,
      resend: staleSpy,
    });
    const skipped = await staleJob.runOnboardingNudges({});
    assert.equal(skipped.sent, 0, "pre-cutoff due stage is not replayed");
    assert.equal(staleSpy.sends.length, 0);
    assert.equal(skipped.candidates, 0);

    const weekSpy = resendSpy();
    const weekly = load("src/lib/weekly-digest.ts", {
      "@/lib/db": {
        prisma: {
          user: {
            findMany: async () => [{
              id: "u-old", email: "old@example.invalid", name: "Ada", locale: "it",
              preferences: { rolesJson: '["engineer"]', locationsJson: "[]" },
            }],
          },
          emailLog: { findMany: async () => [] },
          job: { findMany: async () => [{ id: "j1", title: "engineer", company: "Acme", location: "Milano", url: "https://example.invalid", remote: true }] },
        },
      },
      "@/lib/email-quota": quotaAllow(),
      "@/lib/admin": { isTestAccount: () => false },
      "@/lib/user-notification-guard": {
        ...guard,
        weeklyDigestWeekEligible: () => true,
      },
      "@/lib/role-match": { titleMatchesAnyRole: () => true },
      "@/lib/email-brand": { renderBrandEmail: () => ({ html: "h", text: "t" }), esc: (s: string) => s },
      resend: weekSpy,
    });
    const digest = await weekly.runWeeklyDigest({ force: true });
    assert.equal(digest.sent, 1, "weekly after cutoff includes pre-cutoff accounts");
    assert.equal(weekSpy.sends.length, 1);

    const staleWeek = load("src/lib/weekly-digest.ts", {
      "@/lib/db": { prisma: {} },
      "@/lib/email-quota": quotaAllow(),
      "@/lib/admin": { isTestAccount: () => false },
      "@/lib/user-notification-guard": {
        ...guard,
        weeklyDigestWeekEligible: () => false,
      },
      "@/lib/role-match": { titleMatchesAnyRole: () => true },
      "@/lib/email-brand": { renderBrandEmail: () => ({ html: "h", text: "t" }), esc: (s: string) => s },
      resend: resendSpy(),
    });
    const staleWeekResult = await staleWeek.runWeeklyDigest({ force: true });
    assert.equal(staleWeekResult.sent, 0);
    assert.equal(staleWeekResult.details[0].status, "before_cutoff");

    const feedbackSpy = resendSpy();
    const feedback = load("src/lib/checkout-feedback.ts", {
      "@/lib/db": {
        prisma: {
          conversionEvent: {
            findMany: async () => [
              {
                userId: "u-old-checkout",
                createdAt: new Date(nowMs - 10 * 86_400_000),
                user: {
                  id: "u-old-checkout", email: "old-checkout@example.invalid", name: "Old", locale: "it",
                  stripeSubscriptionId: null, subscriptionStatus: null,
                },
              },
              {
                userId: "u-new-checkout",
                createdAt: new Date(nowMs - 3_600_000),
                user: {
                  id: "u-new-checkout", email: "new-checkout@example.invalid", name: "New", locale: "it",
                  stripeSubscriptionId: null, subscriptionStatus: null,
                },
              },
            ],
          },
          emailLog: { findMany: async () => [] },
          adminPopup: { findFirst: async () => ({ id: "popup" }), create: async () => { throw new Error("must not create"); } },
        },
      },
      "@/lib/email-quota": quotaAllow(),
      "@/lib/admin": { isTestAccount: () => false },
      "@/lib/user-notification-guard": guard,
      "@/lib/email-brand": { renderBrandEmail: () => ({ html: "h", text: "t" }) },
      resend: feedbackSpy,
    });
    const feedbackResult = await feedback.runCheckoutFeedbackCampaign({});
    assert.equal(feedbackResult.sent, 1);
    assert.equal(feedbackResult.candidates, 1);
    assert.equal((feedbackSpy.sends[0] as { to: string }).to, "new-checkout@example.invalid");
  });

  const verifySpy = resendSpy();
  await withEnv({
    USER_NOTIFICATIONS_HOLD: "true",
    USER_NOTIFICATIONS_NOT_BEFORE: undefined,
    RESEND_API_KEY: "re_mock",
    APPLICATIONS_PAUSED: "false",
  }, async () => {
    const verify = load("src/lib/email-verification.ts", {
      "node:crypto": { randomBytes, createHash },
      "@/lib/db": {
        prisma: {
          emailVerificationToken: {
            updateMany: async () => ({ count: 0 }),
            create: async () => ({ id: "tok" }),
          },
        },
      },
      resend: verifySpy,
    });
    await verify.sendVerificationEmail("u1", "auth@example.invalid", "it");
    assert.equal(verifySpy.sends.length, 1, "auth verification still sends while scheduled jobs are held");
  });

  const untouched = [
    "src/lib/daily-summary.ts",
    "src/lib/application-mailbox-notify.ts",
    "src/lib/application-mailbox-digest.ts",
    "src/lib/application-worker.ts",
    "src/lib/founder-alert.ts",
    "src/lib/auto-apply-self-heal.ts",
    "src/lib/recruiter-delivery.ts",
    "src/lib/inbox-replies.ts",
    "src/lib/email-verification.ts",
    "src/lib/auth.ts",
    "src/app/api/auth/password-reset/request/route.ts",
  ];
  for (const file of untouched) {
    assert.doesNotMatch(readFileSync(file, "utf8"), /user-notification-guard/, `${file} stays outside the scheduled-user guard`);
  }

  const envExample = readFileSync(".env.example", "utf8");
  assert.match(envExample, /USER_NOTIFICATIONS_HOLD=/);
  assert.match(envExample, /USER_NOTIFICATIONS_NOT_BEFORE=/);
  assert.match(envExample, /ISO-8601 with offset/);

  console.log("PASS user-notification-guard: hold, fail-closed cutoff, per-event rules, auth still sends.");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
