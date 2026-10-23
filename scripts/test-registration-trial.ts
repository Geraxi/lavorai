import { encode } from "next-auth/jwt";
import { NextRequest } from "next/server";
import { proxy } from "../src/proxy";
import assert from "node:assert/strict";
import { registrationTrialEnd, trialState, effectiveTier, isApplicationAccessPaused, dailyApplicationLimit, requiresPaymentMethodBeforeApp, FREE_TRIAL_DAILY_APPLICATION_LIMIT, EARLY_USER_TRIAL_COHORT_CUTOFF, EARLY_USER_TRIAL_FINAL_END } from "../src/lib/billing";
import { requiresTrialAccess } from "../src/lib/trial-access";
import { prisma } from "../src/lib/db";
import { reserveTrialApplication } from "../src/lib/trial-quota";

async function main() {
  const now = Date.now();
  const active = { id: "trial-test", email: "trial@example.org", tier: "free", createdAt: new Date(now - 86400_000), trialEndsAt: null };
  const expired = { ...active, createdAt: new Date(now - 7 * 86400_000), trialEndsAt: new Date(now + 30 * 86400_000) };
  assert.equal(registrationTrialEnd("2026-01-29T12:00:00Z").toISOString(), "2026-02-05T12:00:00.000Z");
  assert.equal(trialState(active).status, "none", "Signup does not start a trial");
  assert.equal(effectiveTier(active), "free");
  assert.equal(isApplicationAccessPaused(active), true);
  assert.equal(dailyApplicationLimit(active), 0);
  assert.equal(requiresPaymentMethodBeforeApp(active), true);
  const activated = { ...active, trialActivationVersion: 1, tier: "pro", subscriptionStatus: "trialing", trialEndsAt: new Date(now + 7 * 86400_000) };
  assert.equal(trialState(activated).status, "active");
  assert.equal(trialState(activated).daysLeft, 7);
  assert.equal(trialState({ ...activated, createdAt: new Date("2020-01-01"), trialGraceEndsAt: new Date("2026-09-20"), currentPeriodEnd: activated.trialEndsAt }).daysLeft, 7, "Real Stripe deadline wins over legacy cohort markers");
  assert.equal(dailyApplicationLimit(activated), 5);
  assert.equal(dailyApplicationLimit({ ...activated, trialActivationVersion: null }, 12), 12, "Existing Stripe trials retain their previous cap");
  assert.equal(isApplicationAccessPaused(activated), false);
  assert.equal(requiresPaymentMethodBeforeApp(activated), false);
  const legacyAutomatic = { ...active, trialEndsAt: new Date(now + 86400_000) };
  assert.equal(effectiveTier(legacyAutomatic), "free", "An old automatic marker never unlocks unpaid submissions");
  assert.equal(dailyApplicationLimit(legacyAutomatic), 0);
  for (const path of ["/dashboard", "/settings", "/api/cv/profile", "/api/applications/apply", "/api/interview/prep", "/api/optimize", "/api/onboarding/trigger-first-apply", "/api/preferences/mode"]) assert.equal(requiresTrialAccess(path), true, path);
  for (const path of ["/onboarding", "/api/onboarding/cv", "/api/onboarding/demo", "/api/onboarding/demo/viewed", "/api/onboarding/demo/complete", "/trial-expired", "/api/stripe/checkout", "/api/stripe/webhook", "/api/auth/signout", "/api/account/delete", "/api/gdpr/export", "/api/cron/auto-apply", "/lavoro"]) assert.equal(requiresTrialAccess(path), false, path);

  const originalFind = prisma.user.findUnique;
  process.env.AUTH_SECRET = "local-test-secret-for-registration-trial-only";
  const cookieName = "__Secure-authjs.session-token";
  const token = await encode({ token: { sub: active.id }, secret: process.env.AUTH_SECRET, salt: cookieName });
  (prisma.user as any).findUnique = async () => expired;
  try {
    const request = (path: string) => new NextRequest(`https://lavorai.it${path}`, { headers: { cookie: `${cookieName}=${token}` } });
    const page = await proxy(request("/dashboard"));
    assert.equal(page.status, 307);
    assert.equal(page.headers.get("location"), "https://lavorai.it/onboarding");
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
    assert.equal(results.filter(Boolean).length, 0, "The legacy reservation/reset helper is blocked during the temporary rollout");
    assert.equal(await reserveTrialApplication(active.id, "app-0"), false, "An active trial never enables historical retries");
    assert.equal(await reserveTrialApplication(active.id, "app-25"), false, "New work uses the rollout worker admission and its global budget");
    currentUser = expired;
    assert.equal(await reserveTrialApplication(active.id, "app-0"), false, "Queued work is blocked after expiry");
    currentUser = { ...expired, tier: "pro" };
    assert.equal(await reserveTrialApplication(active.id, "paid-app"), false, "Payment does not unlock a legacy reset path");
  } finally { prisma.$transaction = original; }
  console.log("PASS: signup has no trial, actual activation clock, five-per-day cap, preview allowlist and submission gates, legacy reset paths remain suspended");
}
main().catch(e => { console.error(e); process.exitCode = 1; });
