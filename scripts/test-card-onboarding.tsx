import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as React from "react";
import * as jsx from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import { NextRequest, NextResponse } from "next/server";
import { encode } from "next-auth/jwt";
import Stripe from "stripe";
import { z } from "zod";
import * as billing from "../src/lib/billing";
import * as access from "../src/lib/onboarding-access";
import * as card from "../src/lib/stripe-subscription-access";
import * as adminBilling from "../src/lib/admin-billing-readiness";
import * as admin from "../src/lib/admin";
import { accessUserSelect } from "../src/lib/user-selects";
import { requiresTrialAccess } from "../src/lib/trial-access";
import { OnboardingPreferencesSchema } from "../src/lib/onboarding-preferences";
import { AnalyticsEvent } from "../src/lib/analytics";

// Compile the actual handlers/pages with explicit in-memory service boundaries.
// No auth provider, database, Stripe network, email, storage or AI is contacted.
function loadModule(path: string, deps: Record<string, unknown>) {
  const code = ts.transpileModule(readFileSync(path, "utf8"), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  } }).outputText;
  const module = { exports: {} as Record<string, any> };
  vm.runInNewContext(code, {
    module, exports: module.exports, Date, Map, Set, URL, URLSearchParams, Buffer, console, process,
    require(id: string) { assert.ok(id in deps, `Unexpected dependency ${id} in ${path}`); return deps[id]; },
  }, { filename: path });
  return module.exports;
}
const fresh = () => ({
  id: "fixture-card-user", email: "card-user@example.org", name: "Fixture user", tier: "free",
  createdAt: new Date(), trialEndsAt: billing.registrationTrialEnd(new Date()), trialGraceEndsAt: null,
  emailVerified: new Date(), onboardedAt: null as Date | null, subscriptionStatus: null as string | null,
  stripeCustomerId: null as string | null, stripeSubscriptionId: null as string | null,
  demoGeneratedAt: new Date(), demoCompletedAt: null, referralCredits: 0,
});
let user: ReturnType<typeof fresh> | null = fresh();
let writes: any[] = [];
let reads = 0;
let ready = true;
let matchedCount = 1;
const db = {
  user: {
    findUnique: async () => { reads++; return user; },
    findFirst: async () => null,
    update: async ({ data }: any) => { writes.push(data); Object.assign(user!, data); return user; },
    updateMany: async ({ data }: any) => { writes.push(data); if (matchedCount) Object.assign(user!, data); return { count: matchedCount }; },
  },
  cVDocument: { findFirst: async () => { reads++; return null; } },
};
const redirect = (path: string): never => { throw new Error(`REDIRECT:${path}`); };
const common: Record<string, any> = {
  "react": React, "react/jsx-runtime": jsx, "next/server": { NextResponse }, "zod": { z },
  "next/navigation": { redirect, useRouter: () => ({ refresh() {} }) },
  "@/lib/session": { getCurrentUser: async () => user },
  "@/lib/auth": { auth: async () => user ? { user } : null },
  "@/lib/db": { prisma: db }, "@/lib/billing": billing, "@/lib/admin": admin,
  "@/lib/onboarding-access": access, "@/lib/stripe-subscription-access": card,
  "@/lib/admin-billing-readiness": adminBilling,
  "@/lib/activation-readiness": { getActivationReadiness: async () => ({ ready, issue: ready ? null : "upload_cv" }), ACTIVATION_MESSAGES: { upload_cv: "Upload CV", preview_demo: "Preview required" } },
  "@/lib/analytics": { AnalyticsEvent }, "@/lib/conversion-events": { recordConversionEvent: async () => {} },
};
const actions = loadModule("src/app/start-membership/start-membership-actions.tsx", common);
const membership = loadModule("src/app/start-membership/page.tsx", {
  ...common, "./start-membership-actions": { StartMembershipActions: (props: any) => <div id="qa-actions"><actions.StartMembershipActions {...props} /></div> }, "@/components/user-popup": { UserPopup: () => null },
}).default;
const onboarding = loadModule("src/app/onboarding/page.tsx", {
  ...common, "@/lib/cv-profile": {}, "./onboarding-client": { __esModule: true, default: () => <div>CV setup</div> },
}).default;
const finish = loadModule("src/app/api/onboarding/demo/complete/route.ts", common).POST;
const request = () => new NextRequest("https://fixture.invalid/api/stripe/checkout", { method: "POST", body: JSON.stringify({ tier: "pro" }), headers: { "Content-Type": "application/json" } });
async function redirects(fn: () => Promise<unknown>, path: string) { await assert.rejects(fn, { message: `REDIRECT:${path}` }); }
function html(tree: React.ReactNode) { return renderToStaticMarkup(tree); }

async function main() {
  // Fresh signup, verification, query spoofing, customer-only and canceled checkout.
  user = { ...fresh(), emailVerified: null as any };
  await redirects(onboarding, "/login?verify=required");
  await redirects(() => membership({ searchParams: Promise.resolve({}) }), "/login?verify=required");
  assert.equal((await finish()).status, 403);
  user.emailVerified = new Date();
  for (const params of [{}, { canceled: "1" }, { subscribed: "1" }]) {
    writes = []; reads = 0;
    const page = html(await membership({ searchParams: Promise.resolve(params) }));
    assert.match(page, /Carta richiesta/);
    assert.doesNotMatch(page, /CV setup/);
    assert.equal(writes.length, 0); assert.equal(reads, 0);
    await redirects(onboarding, "/start-membership");
    assert.equal((await finish()).status, 402);
    assert.equal(user.onboardedAt, null);
  }
  user.stripeCustomerId = "cus_fixture";
  assert.equal((await finish()).status, 402, "A Stripe customer alone is not a card");

  // Route handlers reject bypasses before reads, uploads, AI or writes.
  const extras: Record<string, any> = {
    "@/lib/crypto": {}, "@/lib/portals": {}, "@/lib/cv-parser": {}, "@/lib/storage": {}, "@/lib/rate-limit": {}, "@/lib/claude": {},
    "@/lib/onboarding-preferences": { OnboardingPreferencesSchema }, "@/lib/auto-apply-cron": {},
  };
  for (const path of ["cv", "details", "preferences", "demo", "demo/complete", "trigger-first-apply", "signup-source", "welcome-seen", "[portal]/link"]) {
    const route = loadModule(`src/app/api/onboarding/${path}/route.ts`, { ...common, ...extras });
    writes = []; reads = 0;
    assert.equal((await route.POST(request(), { params: Promise.resolve({ portal: "linkedin" }) })).status, 402, path);
    assert.equal(writes.length, 0, path); assert.equal(reads, 0, path);
  }

  // Checkout can start BEFORE CV/profile/demo. It retains the exact signup deadline.
  let checkoutPayload: any;
  let live: any[] = [];
  const stripeWebhooks = new Stripe("sk_test_offline_fixture_only").webhooks;
  let sub: any = {
    id: "sub_fixture", customer: "cus_fixture", status: "trialing", pause_collection: null,
    default_payment_method: null, pending_setup_intent: null, cancel_at_period_end: false,
    metadata: { userId: user.id, cardRequired: card.CARD_REQUIRED_CHECKOUT },
    items: { data: [{ price: { id: "price_fixture" }, current_period_end: Math.floor(user.trialEndsAt.getTime() / 1000) }] },
  };
  const stripeService = {
    webhooks: stripeWebhooks,
    customers: { create: async () => ({ id: "cus_fixture" }) },
    subscriptions: { list: async () => ({ data: live }), retrieve: async (_id: string, opts: any) => {
      assert.equal(JSON.stringify(opts.expand), JSON.stringify(card.CARD_VERIFICATION_EXPAND)); return sub;
    } },
    billingPortal: { sessions: { create: async () => ({ url: "https://fixture.invalid/portal" }) } },
    checkout: { sessions: { create: async (payload: any) => { checkoutPayload = payload; return { id: "cs_fixture", url: "https://fixture.invalid/checkout" }; } } },
  };
  const stripeDeps = { stripe: () => stripeService, tierToPriceId: () => "price_fixture", priceIdToTier: () => "pro", ensureReferralCoupon: () => { throw new Error("No coupon allowed in this fixture"); } };
  const checkout = loadModule("src/app/api/stripe/checkout/route.ts", { ...common, "@/lib/stripe": stripeDeps }).POST;
  user = { ...fresh(), emailVerified: null as any };
  assert.equal((await checkout(request())).status, 403);
  assert.equal(checkoutPayload, undefined);
  user = fresh(); ready = false;
  assert.equal((await checkout(request())).status, 200);
  const createdCheckout = checkoutPayload as any;
  assert.equal(createdCheckout.payment_method_collection, "always");
  assert.deepEqual(Array.from(createdCheckout.payment_method_types), ["card"]);
  assert.equal(createdCheckout.subscription_data.metadata.cardRequired, card.CARD_REQUIRED_CHECKOUT);
  assert.equal(createdCheckout.subscription_data.trial_end, Math.floor(billing.trialEnd(user)!.getTime() / 1000));
  assert.match(createdCheckout.success_url, /\/start-membership\?subscribed=1$/);
  assert.match(createdCheckout.cancel_url, /\/start-membership\?canceled=1$/);
  const initialDeadline = user.trialEndsAt.getTime();
  live = [{ status: "trialing" }]; checkoutPayload = null;
  assert.equal((await (await checkout(request())).json()).alreadySubscribed, true);
  assert.equal(checkoutPayload, null, "No duplicate subscription checkout");
  live = []; ready = true;

  // Real Stripe signature verification, with offline event and subscription fixtures.
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_offline_fixture_only";
  const webhook = loadModule("src/app/api/stripe/webhook/route.ts", { ...common, "@/lib/stripe": stripeDeps }).POST;
  const sendEvent = (type: string, object: any) => {
    const payload = JSON.stringify({ id: "evt_fixture", type, data: { object } });
    const signature = stripeWebhooks.generateTestHeaderString({ payload, secret: process.env.STRIPE_WEBHOOK_SECRET! });
    return webhook(new NextRequest("https://fixture.invalid/api/stripe/webhook", { method: "POST", body: payload, headers: { "stripe-signature": signature } }));
  };
  assert.equal((await webhook(new NextRequest("https://fixture.invalid/api/stripe/webhook", { method: "POST", body: "{}" }))).status, 400);
  assert.equal((await sendEvent("customer.subscription.created", sub)).status, 200);
  assert.equal(user.subscriptionStatus, "pending_payment_method");
  assert.equal(user.tier, "free");
  assert.equal((await finish()).status, 402);
  assert.match(html(await membership({ searchParams: Promise.resolve({}) })), /Attendiamo la conferma/);
  // A raw payment-method ID or a card belonging to someone else is not verified.
  for (const method of ["pm_unexpanded", { type: "sepa_debit", customer: "cus_fixture" }, { type: "card", customer: "cus_other" }]) {
    assert.equal(card.subscriptionAccessStatus({ ...sub, default_payment_method: method }), "pending_payment_method");
  }
  sub.default_payment_method = { id: "pm_fixture", type: "card", customer: "cus_fixture" };
  sub.pending_setup_intent = { status: "requires_action" };
  assert.equal(card.subscriptionAccessStatus(sub), "pending_payment_method", "SCA must finish before access");
  sub.pending_setup_intent = { status: "succeeded" };
  // Out-of-order payload has no card; handler must use current retrieved state.
  assert.equal((await sendEvent("customer.subscription.updated", { ...sub, default_payment_method: null })).status, 200);
  assert.equal(user.subscriptionStatus, "trialing"); assert.equal(user.tier, "pro");
  assert.equal(user.trialEndsAt.getTime(), initialDeadline, "Webhook never rewrites trial clock");
  await redirects(() => membership({ searchParams: Promise.resolve({ subscribed: "1" }) }), "/onboarding");
  assert.match(html(await onboarding()), /CV setup/);
  assert.equal((await finish()).status, 200); assert.ok(user.onboardedAt);
  await redirects(() => membership({ searchParams: Promise.resolve({}) }), "/dashboard");
  // Checkout completion uses the same verified gate, including the fallback user match.
  user = fresh(); sub.default_payment_method = null; sub.pending_setup_intent = null; matchedCount = 0;
  assert.equal((await sendEvent("checkout.session.completed", { mode: "subscription", payment_status: "no_payment_required", customer: "cus_fixture", subscription: sub.id, client_reference_id: user.id })).status, 200);
  assert.equal(user.subscriptionStatus, "pending_payment_method"); assert.equal(user.tier, "free");
  sub.default_payment_method = { id: "pm_fixture", type: "card", customer: "cus_fixture" };
  assert.equal((await sendEvent("checkout.session.completed", { mode: "subscription", payment_status: "no_payment_required", customer: "cus_fixture", subscription: sub.id, client_reference_id: user.id })).status, 200);
  assert.equal(user.subscriptionStatus, "trialing"); matchedCount = 1;
  assert.equal(card.subscriptionAccessStatus({ ...sub, status: "active" }), "active", "Verified new active subscriptions retain their real status");
  assert.equal(card.subscriptionAccessStatus({ ...sub, default_payment_method: null, metadata: {} }), "trialing", "Existing legitimate trials preserved");
  assert.equal(card.subscriptionAccessStatus({ ...sub, status: "active", default_payment_method: null }, { stripeSubscriptionId: sub.id, subscriptionStatus: "active" }), "active", "Existing paid access preserved");
  assert.equal(card.subscriptionAccessStatus({ ...sub, status: "active", default_payment_method: null }), "pending_payment_method", "New zero-value active subscriptions still need a verified card");
  user = { ...fresh(), tier: "pro", subscriptionStatus: "active", stripeSubscriptionId: "sub_existing" };
  sub.default_payment_method = null;
  writes = [];
  await sendEvent("customer.subscription.created", sub);
  await sendEvent("checkout.session.completed", { mode: "subscription", payment_status: "no_payment_required", customer: "cus_fixture", subscription: sub.id });
  assert.equal(writes.length, 0, "A pending second checkout cannot replace existing access");
  assert.equal(user.stripeSubscriptionId, "sub_existing");
  sub.default_payment_method = { id: "pm_fixture", type: "card", customer: "cus_fixture" };
  assert.equal(card.subscriptionAccessStatus({ ...sub, pause_collection: {} }), "paused");
  assert.equal(card.subscriptionAccessStatus({ ...sub, status: "canceled" }), "canceled");
  assert.equal(card.subscriptionAccessStatus({ ...sub, default_payment_method: null, customer: { id: "cus_fixture", invoice_settings: { default_payment_method: sub.default_payment_method } } }), "trialing");

  // Redirect graph terminates for expired, canceled, paid and lifetime states.
  for (const fixture of [
    { ...fresh(), tier: "pro", subscriptionStatus: "active", createdAt: new Date("2020-01-01") },
    { ...fresh(), tier: "pro_plus", subscriptionStatus: null },
    { ...fresh(), email: "antonella.lasalandra07@gmail.com", createdAt: new Date("2020-01-01") },
  ]) {
    user = fixture;
    assert.match(html(await onboarding()), /CV setup/);
    await redirects(() => membership({ searchParams: Promise.resolve({}) }), "/onboarding");
  }
  user = { ...fresh(), subscriptionStatus: "canceled" };
  await redirects(onboarding, "/start-membership");
  assert.equal((await finish()).status, 402);
  user.createdAt = new Date(Date.now() - 8 * 86400_000);
  await redirects(onboarding, "/trial-expired");
  await redirects(() => membership({ searchParams: Promise.resolve({}) }), "/trial-expired");
  assert.equal((await finish()).status, 402);

  // Exercise actual proxy with signed session and exact minimal DB select.
  const proxy = loadModule("src/proxy.ts", {
    ...common, "next-auth/jwt": await import("next-auth/jwt"),
    "@/lib/user-selects": { accessUserSelect }, "@/lib/trial-access": { requiresTrialAccess },
    "@/lib/bot-ua": { isBotUserAgent: () => false }, "@/lib/access-unavailable": { accessUnavailableResponse: () => NextResponse.json({}, { status: 503 }) },
  }).proxy;
  process.env.AUTH_SECRET = "offline-session-fixture-only";
  const token = await encode({ token: { sub: "fixture-card-user" }, secret: process.env.AUTH_SECRET, salt: "authjs.session-token" });
  const req = (path: string) => new NextRequest(`https://fixture.invalid${path}`, { headers: { cookie: `authjs.session-token=${token}` } });
  user = fresh();
  for (const path of ["/onboarding", "/dashboard", "/api/onboarding/demo/complete", "/api/preferences/activate-auto", "/api/applications/apply", "/api/applications/apply-batch", "/api/optimize"]) {
    const res = await proxy(req(path));
    assert.equal(res.status, path.startsWith("/api/") ? 402 : 307, path);
  }
  for (const path of ["/start-membership", "/trial-expired", "/api/stripe/checkout", "/api/stripe/webhook", "/analizza-cv", "/optimize", "/api/optimize/stage", "/", "/login", "/verify-email"]) {
    assert.equal((await proxy(req(path))).status, 200, `Public/recovery path preserved: ${path}`);
  }
  user = { ...fresh(), tier: "pro", subscriptionStatus: "trialing" };
  assert.equal((await proxy(req("/onboarding"))).status, 200);
  assert.equal((await proxy(req("/api/applications/apply"))).status, 200);

  // Real server-rendered membership/admin components, with synthetic data only.
  mkdirSync("output/playwright", { recursive: true });
  for (const [name, params, status] of [
    ["membership-required", {}, null], ["membership-canceled", { canceled: "1" }, null],
    ["membership-pending", {}, "pending_payment_method"],
  ] as const) {
    user = { ...fresh(), subscriptionStatus: status };
    writeFileSync(`output/playwright/${name}.html`, `<html lang="it" style="--font-inter: Arial; --font-jetbrains-mono: monospace"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="qa.css"><body>${html(await membership({ searchParams: Promise.resolve(params) }))}</body></html>`);
  }
  const Link = { __esModule: true, default: (props: any) => React.createElement("a", props) };
  const ui = loadModule("src/app/(app)/admin/_ui.tsx", { ...common, "next/link": Link, "./_chart-hover": { ChartHover: () => null } });
  const adminUsers = [null, "pending_payment_method", "trialing", "active"].map((status, i) => ({
    ...fresh(), id: `fixture-${i}`, name: `Fixture ${i + 1}`, email: `fixture-${i}@example.org`, subscriptionStatus: status,
    tier: status === "active" || status === "trialing" ? "pro" : "free", onboardedAt: status === "active" ? new Date() : null,
    lastLoginAt: null, suspendedAt: null, preferences: { autoApplyMode: "manual", rolesJson: '["Designer"]', locationsJson: '["Roma"]', dailyCap: 5, matchMin: 40 },
    cvProfile: { id: `cv-${i}` }, _count: { applications: 0, cvDocuments: 1 },
  }));
  const adminPage = loadModule("src/app/(app)/admin/users/page.tsx", {
    ...common, "next/link": Link, "../_ui": ui, "lucide-react": await import("lucide-react"),
    "./_user-actions": { UserActions: () => null }, "@/components/admin-repair-applications": { AdminRepairApplications: () => null },
    "@/lib/db": { prisma: { user: { findMany: async () => adminUsers }, application: { findMany: async () => [], groupBy: async () => [] } } },
  }).default;
  const adminCss = readFileSync("src/app/(app)/admin/layout.tsx", "utf8").split("<style>{`")[1].split("`}</style>")[0];
  const adminHtml = html(await adminPage({ searchParams: Promise.resolve({ includeTest: "1" }) }));
  assert.match(adminHtml, /Profilo \/ Billing/); assert.match(adminHtml, /3\/3/); assert.doesNotMatch(adminHtml, /4\/4/);
  assert.match(adminHtml, /Non completato/); assert.match(adminHtml, /Non verificata separatamente/);
  assert.match(adminHtml, /Da verificare/); assert.match(adminHtml, /In verifica/);
  assert.doesNotMatch(adminHtml, /Pronto: l&#x27;auto-apply/);
  writeFileSync("output/playwright/admin-readiness.html", `<html lang="it" style="--font-inter: Arial; --font-jetbrains-mono: monospace"><meta charset="utf-8"><link rel="stylesheet" href="qa.css"><body style="padding:24px"><style>${adminCss}</style><div class="adm-root" style="height:calc(100vh - 48px)"><div class="adm-content">${adminHtml}</div></div></body></html>`);
  console.log("PASS: mandatory-card signup/verification, direct page/API gates, canceled/pending/verified Stripe, signature, SCA, duplicate protection, existing entitlements, expiry, refresh/redirect graph, public demo and admin rendering");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
