import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { NextRequest } from "next/server";
import { encode } from "next-auth/jwt";
import { accessUserSelect, sessionUserSelect } from "../src/lib/user-selects";
import { isApplicationAccessPaused, requiresPaymentMethodBeforeApp } from "../src/lib/billing";

async function main() {
  // A legacy fixture has only the explicitly consumed columns. Queries must
  // never implicitly read the whole generated User model.
  const row = {
    id: "schema-compat-user", email: "schema-compat@example.com", name: "Test",
    tier: "pro", createdAt: new Date(), trialEndsAt: null, trialGraceEndsAt: null,
    emailVerified: null, subscriptionStatus: "active", stripeCustomerId: null,
    stripeSubscriptionId: null, stripePriceId: null, currentPeriodEnd: null,
    welcomeSeenAt: null, onboardedAt: null, locale: "it", yearsExperience: null,
  };
  for (const select of [accessUserSelect, sessionUserSelect]) {
    for (const column of Object.keys(select)) assert.ok(column in row, `Unexpected column ${column}`);
    for (const column of ["passwordHash", "signupUtmSource", "referralRewardedAt", "demoCompletedAt", "trialDurationDays", "lastLoginAt"]) {
      assert.ok(!(column in select), `Unrelated column ${column} must not be selected`);
    }
    for (const column of ["email", "tier", "createdAt", "trialEndsAt", "trialGraceEndsAt"]) {
      assert.equal(select[column as keyof typeof select], true, `Required billing column ${column}`);
    }
  }
  assert.equal(sessionUserSelect.subscriptionStatus, true);

  // Run the real proxy with a mocked data boundary and a real signed JWT.
  // No production database or network calls are used by this test.
  let lookupError: unknown;
  let calls = 0;
  (globalThis as unknown as { prisma: unknown }).prisma = {
    user: { findUnique: async (query: { where: { id: string }; select: unknown }) => {
      calls++;
      assert.equal(query.where.id, row.id);
      assert.deepEqual(query.select, accessUserSelect);
      if (lookupError) throw lookupError;
      return row;
    } },
  };
  const env: Record<string, string | undefined> = process.env;
  const originalEnv = env.NODE_ENV;
  const originalSecret = process.env.AUTH_SECRET;
  const originalAdmins = process.env.ADMIN_EMAILS;
  process.env.ADMIN_EMAILS = "schema-admin@example.com";
  env.NODE_ENV = "production";
  process.env.AUTH_SECRET = "schema-compatibility-test-secret-not-a-real-credential";
  try {
    const { proxy } = await import("../src/proxy");
    const token = await encode({ token: { sub: row.id }, secret: process.env.AUTH_SECRET, salt: "authjs.session-token" });
    const request = (path: string, signedIn = true) => new NextRequest(`https://lavorai.it${path}`, {
      headers: signedIn ? { cookie: `authjs.session-token=${token}` } : {},
    });
    assert.equal((await proxy(request("/dashboard"))).headers.get("x-middleware-next"), "1");
    const expired = { ...row, tier: "free", createdAt: new Date("2020-01-01") };
    assert.equal(isApplicationAccessPaused(expired), true);
    assert.equal(isApplicationAccessPaused(row), false);
    assert.equal(requiresPaymentMethodBeforeApp({ ...row, tier: "free", subscriptionStatus: null }), true);
    assert.equal(requiresPaymentMethodBeforeApp({ ...row, tier: "free", subscriptionStatus: "trialing" }), false);
    Object.assign(row, expired);
    assert.equal((await proxy(request("/dashboard"))).headers.get("location"), "https://lavorai.it/trial-expired");
    assert.equal((await proxy(request("/api/applications"))).status, 402);
    row.email = "schema-admin@example.com";
    assert.equal((await proxy(request("/dashboard"))).headers.get("x-middleware-next"), "1");
    row.email = "antonella.lasalandra07@gmail.com";
    assert.equal((await proxy(request("/dashboard"))).headers.get("x-middleware-next"), "1");
    row.email = "schema-compat@example.com";
    const beforeAnonymous = calls;
    assert.match((await proxy(request("/dashboard", false))).headers.get("location") ?? "", /\/login\?next=/);
    assert.equal(calls, beforeAnonymous);

    lookupError = { code: "P2022" };
    const page = await proxy(request("/dashboard"));
    assert.equal(page.status, 503);
    assert.match(page.headers.get("content-type") ?? "", /^text\/html/);
    assert.equal(page.headers.get("cache-control"), "no-store");
    assert.equal(page.headers.get("content-disposition"), null);
    assert.match(await page.text(), /<!doctype html>/);
    const api = await proxy(request("/api/applications"));
    assert.equal(api.status, 503);
    assert.equal((await api.json()).error, "access_check_unavailable");
    assert.equal(api.headers.get("x-middleware-next"), null);
    lookupError = new Error("connection refused");
    assert.equal((await proxy(request("/dashboard"))).status, 503);
  } finally {
    if (originalEnv === undefined) delete env.NODE_ENV; else env.NODE_ENV = originalEnv;
    if (originalSecret === undefined) delete process.env.AUTH_SECRET; else process.env.AUTH_SECRET = originalSecret;
    if (originalAdmins === undefined) delete process.env.ADMIN_EMAILS; else process.env.ADMIN_EMAILS = originalAdmins;
    delete (globalThis as unknown as { prisma?: unknown }).prisma;
  }

  // Wiring guards complement the runtime proxy test: session reads and ignored
  // update results must not regress to implicit full-model selection.
  const session = readFileSync("src/lib/session.ts", "utf8");
  assert.match(session, /findUnique\(\{ where: \{ id: session\.user\.id \}, select: sessionUserSelect \}\)/);
  for (const [path, field] of [
    ["src/lib/auth.ts", "lastLoginAt"],
    ["src/app/api/auth/verify-email/confirm/route.ts", "emailVerified"],
  ]) {
    assert.match(readFileSync(path, "utf8"), new RegExp(`data: \\{ ${field}: new Date\\(\\) \\},\\s*select: \\{ id: true \\}`));
  }
  console.log("[test-auth-schema-compatibility] Passed selector, proxy, billing and write-return regression checks (mock database).");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
