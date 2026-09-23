import { encode } from "next-auth/jwt";
import { NextRequest } from "next/server";
import { proxy } from "../src/proxy";
import assert from "node:assert/strict";
import { registrationTrialEnd, trialState, effectiveTier, isApplicationAccessPaused, dailyApplicationLimit, FREE_TRIAL_DAILY_APPLICATION_LIMIT, EARLY_USER_TRIAL_COHORT_CUTOFF, EARLY_USER_TRIAL_FINAL_END } from "../src/lib/billing";
import { requiresTrialAccess } from "../src/lib/trial-access";
import { prisma } from "../src/lib/db";
import { reserveTrialApplication } from "../src/lib/trial-quota";

async function main() {
  const now = Date.now();
  const active = { id: "trial-test", email: "trial@example.org", tier: "free", createdAt: new Date(now - 86400_000), trialEndsAt: null };
  const expired = { ...active, createdAt: new Date(now - 7 * 86400_000), trialEndsAt: new Date(now + 30 * 86400_000) };
  assert.equal(registrationTrialEnd("2026-01-29T12:00:00Z").toISOString(), "2026-02-05T12:00:00.000Z");
  assert.equal(trialState(active).status, "active", "Signup without onboarding has an active trial");
  assert.equal(effectiveTier(active), "pro");
  assert.equal(trialState(expired).status, "ended", "Delayed setup or stored extension must not restart trial");
  assert.equal(isApplicationAccessPaused(expired), true);
  const legacy = { ...expired, createdAt: new Date("2026-09-01T12:00:00Z"), trialGraceEndsAt: new Date("2026-09-20T12:00:00Z") };
  const realNow = Date.now;
  try {
    Date.now = () => Date.parse(EARLY_USER_TRIAL_COHORT_CUTOFF);
    assert.equal(trialState(legacy).daysLeft, 2, "Original extension recipients receive exactly two final days");
    assert.equal(trialState(legacy).endsAt?.toISOString(), EARLY_USER_TRIAL_FINAL_END);
    assert.equal(isApplicationAccessPaused(legacy), false);
    const futureGrace = { ...legacy, trialGraceEndsAt: new Date("2099-01-01") };
    assert.equal(trialState(futureGrace).endsAt?.toISOString(), EARLY_USER_TRIAL_FINAL_END, "Stored grace cannot extend the fixed deadline");
    assert.equal(isApplicationAccessPaused({ ...legacy, trialGraceEndsAt: null }), true, "Old users without the original extension do not receive a new trial");
    const newcomer = { ...legacy, createdAt: new Date(EARLY_USER_TRIAL_COHORT_CUTOFF) };
    assert.equal(trialState(newcomer).endsAt?.getTime(), registrationTrialEnd(newcomer.createdAt).getTime(), "New signups get seven days, ignoring grace");
    Date.now = () => Date.parse(EARLY_USER_TRIAL_FINAL_END);
    assert.equal(isApplicationAccessPaused(legacy), true, "Original cohort locks at the exact fixed deadline");
    assert.equal(dailyApplicationLimit(legacy), 0);
    assert.equal(isApplicationAccessPaused({ ...legacy, tier: "pro" }), false, "Paid access remains active");
  } finally { Date.now = realNow; }
  assert.equal(FREE_TRIAL_DAILY_APPLICATION_LIMIT, 5, "Free trials are capped at five applications per day");
  assert.equal(dailyApplicationLimit(active), 5);
  assert.equal(dailyApplicationLimit(expired), 0);
  assert.equal(isApplicationAccessPaused({ ...expired, tier: "pro" }), false);
  assert.equal(isApplicationAccessPaused({ ...expired, stripeSubscriptionId: "incomplete" }), true, "A Stripe ID alone must not unlock access");
  for (const path of ["/dashboard", "/settings", "/onboarding", "/api/cv/profile", "/api/applications/apply", "/api/interview/prep", "/api/optimize"]) assert.equal(requiresTrialAccess(path), true, path);
  for (const path of ["/trial-expired", "/api/stripe/checkout", "/api/stripe/webhook", "/api/auth/signout", "/api/account/delete", "/api/gdpr/export", "/api/cron/auto-apply", "/lavoro"]) assert.equal(requiresTrialAccess(path), false, path);

  const originalFind = prisma.user.findUnique;
  process.env.AUTH_SECRET = "local-test-secret-for-registration-trial-only";
  const cookieName = "__Secure-authjs.session-token";
  const token = await encode({ token: { sub: active.id }, secret: process.env.AUTH_SECRET, salt: cookieName });
  (prisma.user as any).findUnique = async () => expired;
  try {
    const request = (path: string) => new NextRequest(`https://lavorai.it${path}`, { headers: { cookie: `${cookieName}=${token}` } });
    const page = await proxy(request("/dashboard"));
    assert.equal(page.status, 307);
    assert.equal(page.headers.get("location"), "https://lavorai.it/trial-expired");
    const api = await proxy(request("/api/applications/apply"));
    assert.equal(api.status, 402);
    assert.equal((await api.json()).error, "trial_expired");
    assert.equal((await proxy(request("/api/stripe/checkout"))).status, 200);
    (prisma.user as any).findUnique = async () => ({ ...expired, tier: "pro" });
    assert.equal((await proxy(request("/dashboard"))).status, 200);
  } finally { prisma.user.findUnique = originalFind; }

  // In-memory transaction harness; the production transaction uses a PostgreSQL
  // advisory lock to provide the same serialization across worker instances.
  let currentUser: Omit<typeof active, "trialEndsAt"> & { trialEndsAt: Date | null } = active;
  let tail = Promise.resolve();
  const original = prisma.$transaction;
  (prisma as any).$transaction = (operation: any) => {
    const result = tail.then(() => operation({
      $queryRaw: async () => [{ "?column?": 1 }],
      user: { findUniqueOrThrow: async () => currentUser },
      application: {
        update: async () => undefined,
      },
    }));
    tail = result.then(() => undefined, () => undefined);
    return result;
  };
  try {
    const results = await Promise.all(Array.from({ length: 25 }, (_, i) => reserveTrialApplication(active.id, `app-${i}`)));
    assert.equal(results.filter(Boolean).length, 25, "The worker does not impose a separate all-time trial quota");
    assert.equal(await reserveTrialApplication(active.id, "app-0"), true, "Retry remains processable during the active trial");
    assert.equal(await reserveTrialApplication(active.id, "app-25"), true, "The daily cap is applied when applications are created");
    currentUser = expired;
    assert.equal(await reserveTrialApplication(active.id, "app-0"), false, "Queued work is blocked after expiry");
    currentUser = { ...expired, tier: "pro" };
    assert.equal(await reserveTrialApplication(active.id, "paid-app"), true, "Payment unlocks worker");
  } finally { prisma.$transaction = original; }
  console.log("PASS: signup trial, 7-day boundary, five-per-day cap, expiry gates, worker reservations and payment unlock");
}
main().catch(e => { console.error(e); process.exitCode = 1; });
