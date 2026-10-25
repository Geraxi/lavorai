import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import vm from "node:vm";
import ts from "typescript";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { encode, decode } from "next-auth/jwt";
import { CredentialsSignin } from "next-auth";
import { createAuthAdapter, authUserSelect } from "../src/lib/auth-adapter";
import * as googleAuth from "../src/lib/google-auth";
import { authErrorMessageKey } from "../src/lib/auth-errors";
import * as billing from "../src/lib/billing";
import { onboardingAccessBlock } from "../src/lib/onboarding-access";

async function main() {
  type Row = ReturnType<typeof fresh>;
  function fresh(id = "google-user", email = "google@example.test") {
    const now = new Date();
    return {
      id, email, name: "Fixture", image: null, emailVerified: null as Date | null,
      suspendedAt: null as Date | null, createdAt: now, tier: "free",
      subscriptionStatus: null, trialEndsAt: billing.registrationTrialEnd(now),
      trialGraceEndsAt: null, trialDurationDays: 7, proTrialUsedAt: now,
      passwordHash: null as string | null, lastLoginAt: null as Date | null,
    };
  }
  let users: Row[] = [];
  let accounts: { provider: string; providerAccountId: string; userId: string }[] = [];
  let writes: Record<string, unknown>[] = [];
  let currentUserId: string | undefined;
  let failReads = false;
  let registrations: [string, string][] = [];
  const select = (row: Row | undefined, fields: Record<string, unknown> | undefined): any => {
    if (failReads) throw new Error("fixture database unavailable");
    if (!fields) throw Object.assign(new Error("missing unrelated business column"), { code: "P2022" });
    if (!row) return null;
    for (const key of Object.keys(fields)) assert.ok(key in row, `Unknown fixture column ${key}`);
    return Object.fromEntries(Object.keys(fields).map((key) => [key, row[key as keyof Row]]));
  };
  const sameEmail = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
  const matchesAccount = (a: typeof accounts[number], b: typeof accounts[number]) =>
    a.provider === b.provider && a.providerAccountId === b.providerAccountId;
  const db: any = {
    user: {
      findUnique: async ({ where, select: fields }: any) => select(users.find((u) => u.id === where.id), fields),
      findMany: async ({ where, select: fields, take }: any) => users.filter((u) => sameEmail(u.email, where.email.equals)).slice(0, take).map((u) => select(u, fields)),
      create: async ({ data, select: fields }: any) => {
        const row = { ...fresh(`new-${users.length}`), ...data };
        users.push(row); writes.push(data); return select(row, fields);
      },
      update: async ({ where, data, select: fields }: any) => {
        const row = users.find((u) => u.id === where.id)!;
        Object.assign(row, data); writes.push(data); return select(row, fields);
      },
      updateMany: async ({ where, data }: any) => {
        const row = users.find((u) => u.id === where.id && sameEmail(u.email, where.email.equals) &&
          u.emailVerified === where.emailVerified && u.suspendedAt === where.suspendedAt &&
          accounts.some((a) => a.userId === u.id && matchesAccount(a, where.accounts.some)));
        if (!row) return { count: 0 };
        Object.assign(row, data); writes.push(data); return { count: 1 };
      },
    },
    account: {
      findUnique: async ({ where, select: fields }: any) => {
        const a = accounts.find((a) => matchesAccount(a, where.provider_providerAccountId));
        if (!fields?.user?.select) throw Object.assign(new Error("missing unrelated business column"), { code: "P2022" });
        return a ? { user: select(users.find((u) => u.id === a.userId), fields.user.select) } : null;
      },
      create: async ({ data }: any) => { accounts.push(data); writes.push({ link: data.providerAccountId }); return data; },
    },
    session: { findUnique: async ({ where, select: fields }: any) => {
      assert.equal(where.sessionToken, "fixture-session");
      return { sessionToken: "fixture-session", userId: users[0].id, expires: new Date(), user: select(users[0], fields.user.select) };
    } },
    pendingCvSubmission: { findUnique: async () => null },
  };

  // Load the actual configuration with explicit local boundaries. No Google,
  // email, database, Stripe, storage, AI, or application submission is contacted.
  let config: any;
  const deps: Record<string, unknown> = {
    "@/lib/analytics": { AnalyticsEvent: { TRIAL_STARTED: "trial_started" } },
    "@/lib/conversion-events": { recordConversionEvent: async () => undefined },
    "@/lib/registration-conversion": { createRegistrationConversion: async (_db: unknown, userId: string, method: string) => { registrations.push([userId, method]); return true; } },
    "next-auth": { __esModule: true, CredentialsSignin, default: (options: any) => {
      config = options;
      return { auth: async () => currentUserId ? { user: { id: currentUserId } } : null };
    } },
    "next-auth/providers/credentials": { __esModule: true, default: (options: any) => options },
    "next-auth/providers/google": { __esModule: true, default: (options: any) => ({ ...options, id: "google", type: "oidc", account: () => ({}) }) },
    "@/lib/auth-adapter": { createAuthAdapter }, "@/lib/google-auth": googleAuth,
    "resend": { Resend: class { constructor() { throw new Error("Unexpected email"); } } },
    "bcryptjs": {}, "@/lib/db": { prisma: db }, "@/lib/storage": {},
    "@/lib/billing": billing, "node:crypto": await import("node:crypto"),
    "@/lib/email-quota": { sendWithinQuota: async () => ({ sent: true, reason: null, outcome: "accepted" }) },
  };
  const code = ts.transpileModule(readFileSync("src/lib/auth.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const moduleFixture = { exports: {} };
  vm.runInNewContext(code, {
    module: moduleFixture, exports: moduleFixture.exports, Date, console,
    process: { env: { GOOGLE_CLIENT_ID: "fixture", GOOGLE_CLIENT_SECRET: "fixture" } },
    require: (id: string) => { assert.ok(id in deps, `Unexpected dependency ${id}`); return deps[id]; },
  });
  const provider = config.providers.find((p: any) => p.id === "google");
  assert.equal(provider.allowDangerousEmailAccountLinking, false);
  assert.equal(provider.authorization.params.scope, "openid email profile");
  assert.equal(config.pages.error, "/login");
  const require = createRequire(resolve("package.json"));
  // Exercise the exact installed Auth.js account-resolution implementation.
  const { handleLoginOrRegister } = await import(pathToFileURL(resolve(dirname(require.resolve("@auth/core")), "lib/actions/callback/handle-login.js")).href);
  const secret = "fixture-only-not-a-real-credential";
  const cookieName = "authjs.session-token";
  const options = {
    ...config, provider, jwt: { encode, decode, secret },
    cookies: { sessionToken: { name: cookieName } },
  };
  const profile = { sub: "google-subject", email: "google@example.test", email_verified: true, name: "Fixture" };
  const account = { provider: "google", providerAccountId: profile.sub, type: "oidc" as const };
  function reset(linked = true) {
    users = [fresh()]; accounts = linked ? [{ ...account, userId: users[0].id }] : [];
    writes = []; currentUserId = undefined; failReads = false; registrations = [];
  }
  async function login(p: any = profile, a = account) {
    const user = provider.profile(p);
    if (!await config.callbacks.signIn({ user, account: a, profile: p })) throw new Error("AccessDenied");
    const sessionToken = currentUserId ? await encode({ token: { sub: currentUserId }, secret, salt: cookieName }) : undefined;
    const result = await handleLoginOrRegister(sessionToken, user, a, options);
    await config.events.signIn({ user: result.user, account: a, profile: p, isNewUser: result.isNewUser });
    return result;
  }

  reset();
  await assert.rejects(async () => PrismaAdapter(db).getUserByAccount!({ provider: "google", providerAccountId: profile.sub }), { code: "P2022" });
  await assert.rejects(async () => PrismaAdapter(db).getUser!(users[0].id), { code: "P2022" });
  const deadlines = { createdAt: users[0].createdAt, trialEndsAt: users[0].trialEndsAt, proTrialUsedAt: users[0].proTrialUsedAt };
  assert.equal((await login()).user.id, "google-user");
  assert.ok(users[0].emailVerified, "Existing Google users are repaired after a verified Google callback");
  assert.equal(accounts.length, 1);
  assert.equal(users.length, 1);
  for (const [key, value] of Object.entries(deadlines)) assert.equal(users[0][key as keyof Row], value);
  assert.deepEqual(Object.keys(writes[0]), ["emailVerified"]);
  assert.equal(onboardingAccessBlock(users[0])?.error, "payment_method_required");
  const verifiedAt = users[0].emailVerified;
  await login();
  assert.equal(users[0].emailVerified, verifiedAt, "Do not reset verification or trial on repeat login");
  assert.deepEqual(registrations, [], "Returning Google logins never issue a Meta registration event");

  reset(false); users = [];
  assert.equal((await login()).isNewUser, true);
  assert.equal(users.length, 1); assert.equal(accounts.length, 1);
  assert.deepEqual(registrations, [[users[0].id, "google"]], "A brand-new Google account issues exactly one registration event");
  assert.equal(writes[0].emailVerified, null, "Installed Auth.js stores null during OAuth creation");
  assert.ok(users[0].emailVerified, "Auth.js overwrites profile verification; signIn must restore it after linking");
  assert.equal(users[0].trialEndsAt.getTime() - users[0].proTrialUsedAt.getTime(), 7 * 86400_000);
  assert.equal(onboardingAccessBlock(users[0])?.error, "payment_method_required");

  for (const verified of [false, undefined, "true"]) {
    reset();
    await assert.rejects(login({ ...profile, email_verified: verified }), /AccessDenied/);
    assert.equal(writes.length, 0);
  }
  reset(); await assert.rejects(login({ ...profile, sub: "another-subject" }), /AccessDenied/); assert.equal(writes.length, 0);
  reset(); users[0].suspendedAt = new Date(); await assert.rejects(login(), /AccessDenied/); assert.equal(writes.length, 0);
  reset(); failReads = true; await assert.rejects(login(), /database unavailable/); assert.equal(writes.length, 0);

  // A password collision, including a legacy case variant, must not auto-link.
  for (const email of [profile.email, "Google@Example.Test"]) {
    reset(false); users[0].email = email; users[0].passwordHash = "fixture-password-hash";
    await assert.rejects(login(), (error: any) => error.type === "OAuthAccountNotLinked");
    assert.equal(writes.length, 0); assert.equal(accounts.length, 0); assert.equal(users[0].emailVerified, null);
  }
  reset(false); users.push(fresh("duplicate", "Google@Example.Test"));
  await assert.rejects(login(), /Ambiguous auth email/); assert.equal(writes.length, 0);

  reset(false); currentUserId = users[0].id; // both identities are proven; matching email
  await login(); assert.equal(accounts[0].userId, users[0].id); assert.ok(users[0].emailVerified);
  reset(false); currentUserId = users[0].id; users[0].email = "other@example.test";
  await assert.rejects(login(), /AccessDenied/); assert.equal(accounts.length, 0); assert.equal(writes.length, 0);
  reset(); currentUserId = "other-user";
  await assert.rejects(login(), /AccessDenied/); assert.equal(writes.length, 0);

  // An already linked subject may sign in after a Google email change, but must
  // not verify the unrelated stored email (or move the link to an email collision).
  reset(); await login({ ...profile, email: "changed@example.test" });
  assert.equal(users[0].emailVerified, null); assert.equal(users[0].email, profile.email);
  reset(false); await googleAuth.verifyGoogleSignInEmail(db, users[0].id, account, profile);
  assert.equal(writes.length, 0, "Matching email without an Account link is insufficient");
  reset(); await config.events.signIn({ user: users[0], account: { provider: "password" } });
  assert.equal(users[0].emailVerified, null, "Password login must not assert verification");
  assert.equal(await config.callbacks.signIn({ account: { provider: "password" } }), true);

  reset();
  assert.deepEqual(await config.adapter.getUser(users[0].id), await config.adapter.getUserByEmail(profile.email));
  assert.deepEqual(Object.keys((await config.adapter.getSessionAndUser("fixture-session")).user), Object.keys(authUserSelect));
  assert.ok((await config.adapter.updateUser({ id: users[0].id, emailVerified: new Date() })).emailVerified);
  for (const [query, key] of [
    ["", null], ["error=Verification", "errorLinkInvalid"], ["error=1", "errorLinkInvalid"],
    ["error=OAuthAccountNotLinked", "errorAccountNotLinked"],
    ["error=1&error=OAuthAccountNotLinked", "errorAccountNotLinked"],
    ["error=AccessDenied", "errorAccessDenied"], ["error=Configuration", "errorSignInFailed"],
    ["error=untrusted-provider-text", "errorSignInFailed"],
  ]) assert.equal(authErrorMessageKey(new URLSearchParams(query ?? "")), key);
  console.log("[test-google-auth] Passed real Auth.js account resolution, schema-safe adapter, verified-email repair, collision, suspension, linking, error and mandatory-card regressions; all services mocked.");

}
main().catch((error) => { console.error(error); process.exitCode = 1; });
