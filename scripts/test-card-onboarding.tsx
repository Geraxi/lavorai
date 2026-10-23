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
import * as eligibility from "../src/lib/trial-eligibility";
import * as roleMatch from "../src/lib/role-match";
import * as preferenceMatch from "../src/lib/auto-apply-preferences";
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
  createdAt: new Date(), trialActivationVersion: 1, trialEndsAt: null as any, proTrialUsedAt: null as any, checkoutClaimedAt: null as any, trialGraceEndsAt: null,
  emailVerified: new Date(), onboardedAt: null as Date | null, subscriptionStatus: null as string | null,
  stripeCustomerId: null as string | null, stripeSubscriptionId: null as string | null,
  demoGeneratedAt: new Date(), demoCompletedAt: null, referralCredits: 0,
});
let user: ReturnType<typeof fresh> | null = fresh();
let writes: any[] = [];
let reads = 0;
let ready = true;
let matchedCount = 1;
let beforeWrite: (() => void) | null = null;
let writeFailure = false;
let linkedUserLookup = false;
const claims = new Set<string>();
const conversions: string[] = [];
const conversionKeys = new Set<string>();
function matches(where: any): boolean {
  return !!user && Object.entries(where).every(([key, value]: [string, any]) => {
    if (key === "OR") return value.some(matches);
    const actual = (user as any)[key];
    if (value && typeof value === "object" && "lt" in value) return actual != null && actual < value.lt;
    if (value === null) return actual == null;
    if (value && typeof value === "object" && "notIn" in value) return actual != null && !value.notIn.includes(actual);
    if (value && typeof value === "object" && "gt" in value) return actual > value.gt;
    return actual === value;
  });
}
let transactionTail = Promise.resolve();
const db = {
  user: {
    findUnique: async ({ where }: any) => { reads++; return matches(where) ? { ...user } : null; },
    findFirst: async (query: any) => linkedUserLookup && !query.where.referredById ? { id: user!.id } : null,
    update: async ({ data }: any) => { writes.push(data); Object.assign(user!, data); return user; },
    updateMany: async ({ where, data }: any) => {
      if (beforeWrite) { const change = beforeWrite; beforeWrite = null; change(); }
      if (writeFailure) throw new Error("fixture database unavailable");
      const count = matches(where) && (where.id || matchedCount) ? 1 : 0;
      if (count) {
        writes.push(data);
        const values = { ...data };
        if (data.referralCredits?.decrement) values.referralCredits = user!.referralCredits - data.referralCredits.decrement;
        Object.assign(user!, values);
      }
      return { count };
    },
  },
  subscriptionEvent: { create: async ({ data }: any) => {
    if (data.id) {
      if (claims.has(data.id)) throw Object.assign(new Error("duplicate fixture claim"), { code: "P2002" });
      claims.add(data.id);
    }
    return data;
  } },
  $transaction: (fn: (tx: any) => Promise<unknown>) => {
    const result = transactionTail.then(async () => {
      const snapshot = { ...user };
      const originalClaims = new Set(claims);
      try { return await fn(db); }
      catch (error) {
        Object.assign(user!, snapshot); claims.clear(); originalClaims.forEach(id => claims.add(id)); throw error;
      }
    });
    transactionTail = result.then(() => undefined, () => undefined);
    return result;
  },
  cVDocument: { findFirst: async () => { reads++; return null; } },
};
const redirect = (path: string): never => { throw new Error(`REDIRECT:${path}`); };
const common: Record<string, any> = {
  "@/components/logo": { Logo: () => <span>LavorAI</span> },
  "react": React, "react/jsx-runtime": jsx, "next/server": { NextResponse }, "zod": { z },
  "next/navigation": { redirect, useRouter: () => ({ refresh() {} }) },
  "@/lib/session": { getCurrentUser: async () => user },
  "@/lib/auth": { auth: async () => user ? { user } : null },
  "@/lib/db": { prisma: db }, "@/lib/billing": billing, "@/lib/admin": admin,
  "@/lib/trial-eligibility": eligibility, "@/lib/role-match": roleMatch, "@/lib/auto-apply-preferences": preferenceMatch,
  "@/lib/onboarding-access": access, "@/lib/stripe-subscription-access": card,
  "@/lib/admin-billing-readiness": adminBilling,
  "@/lib/activation-readiness": { getActivationReadiness: async () => ({ ready, issue: ready ? null : "upload_cv" }), ACTIVATION_MESSAGES: { upload_cv: "Upload CV", preview_demo: "Preview required" } },
  "@/lib/analytics": { AnalyticsEvent }, "@/lib/conversion-events": { recordConversionEvent: async (name: string, input: any) => { if (!conversionKeys.has(input.dedupeKey)) { conversions.push(name); conversionKeys.add(input.dedupeKey); } } },
};
const actions = loadModule("src/app/start-membership/start-membership-actions.tsx", common);
common["@/components/support-link"] = loadModule("src/components/support-link.tsx", {
  "react/jsx-runtime": jsx, "next-intl": { useLocale: () => "it" },
  "next/link": { __esModule: true, default: ({ children, prefetch, ...props }: any) => <a {...props}>{children}</a> },
});
const membership = loadModule("src/app/start-membership/page.tsx", {
  ...common, "@/lib/trial-eligibility": eligibility, "./start-membership-actions": { StartMembershipActions: (props: any) => <div id="qa-actions"><actions.StartMembershipActions {...props} /></div> }, "@/components/user-popup": { UserPopup: () => null },
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
  await redirects(() => membership({ searchParams: Promise.resolve({}) }), "/onboarding");
  user.onboardedAt = new Date();
  for (const params of [{}, { canceled: "1" }, { subscribed: "1" }]) {
    writes = []; reads = 0;
    const page = html(await membership({ searchParams: Promise.resolve(params) }));
    assert.match(page, /Carta richiesta/);
    assert.match(page, /href="\/feedback"/);
    assert.doesNotMatch(page, /CV setup/);
    assert.equal(writes.length, 0); assert.equal(reads, 0);
    assert.match(html(await onboarding()), /CV setup/);
    assert.equal((await finish()).status, 200);
    assert.ok(user.onboardedAt);
  }
  user.stripeCustomerId = "cus_fixture";
  assert.equal((await finish()).status, 200, "Preview completion does not require a card");

  // Route handlers reject bypasses before reads, uploads, AI or writes.
  const extras: Record<string, any> = {
    "@/lib/crypto": {}, "@/lib/portals": {}, "@/lib/cv-parser": {}, "@/lib/storage": {}, "@/lib/rate-limit": {}, "@/lib/claude": {},
    "@/lib/onboarding-preferences": { OnboardingPreferencesSchema }, "@/lib/auto-apply-cron": {}, "@/lib/cv-profile-ensure": {},
  };
  user.emailVerified = null as any;
  for (const path of ["cv", "details", "preferences", "demo", "demo/complete", "trigger-first-apply", "signup-source", "welcome-seen", "[portal]/link"]) {
    const route = loadModule(`src/app/api/onboarding/${path}/route.ts`, { ...common, ...extras });
    writes = []; reads = 0;
    assert.equal((await route.POST(request(), { params: Promise.resolve({ portal: "linkedin" }) })).status, 403, path);
    assert.equal(writes.length, 0, path); assert.equal(reads, 0, path);
  }

  user.emailVerified = new Date();
  // Checkout requires a preview; the full seven days start at Stripe activation.
  let checkoutPayload: any;
  let openSessions: any[] = [];
  let live: any[] = [];
  const stripeWebhooks = new Stripe("sk_test_offline_fixture_only").webhooks;
  let sub: any = {
    id: "sub_fixture", customer: "cus_fixture", status: "trialing", pause_collection: null,
    default_payment_method: null, pending_setup_intent: null, cancel_at_period_end: false,
    metadata: { userId: user.id, cardRequired: card.CARD_REQUIRED_CHECKOUT, trial: "activation_trial_with_payment_method" },
    trial_start: Math.floor(Date.now()/1000), trial_end: Math.floor(Date.now()/1000) + 7*86400,
    items: { data: [{ price: { id: "price_fixture" }, current_period_end: Math.floor(Date.now()/1000) + 7*86400 }] },
  };
  let retrieveFailure = false;
  let subscriptionUpdates = 0;
  const stripeService = {
    webhooks: stripeWebhooks,
    customers: { create: async () => ({ id: "cus_fixture" }) },
    subscriptions: { list: () => Object.assign(Promise.resolve({ data: live }), { async *[Symbol.asyncIterator]() { for (const item of live) yield item; } }), retrieve: async (_id: string, opts: any) => {
      assert.equal(JSON.stringify(opts.expand), JSON.stringify(card.CARD_VERIFICATION_EXPAND));
      if (retrieveFailure) throw new Error("fixture Stripe unavailable");
      return sub;
    }, update: async () => { subscriptionUpdates++; return sub; } },
    billingPortal: { sessions: { create: async () => ({ url: "https://fixture.invalid/portal" }) } },
    checkout: { sessions: { list: async () => ({ data: openSessions }), expire: async () => ({}), create: async (payload: any) => { checkoutPayload = payload; return { id: "cs_fixture", url: "https://fixture.invalid/checkout" }; } } },
  };
  const stripeDeps = { stripe: () => stripeService, tierToPriceId: () => "price_fixture", priceIdToTier: () => "pro", ensureReferralCoupon: () => { throw new Error("No coupon allowed in this fixture"); } };
  const checkout = loadModule("src/app/api/stripe/checkout/route.ts", { ...common, "@/lib/stripe": stripeDeps }).POST;
  user = { ...fresh(), emailVerified: null as any };
  assert.equal((await checkout(request())).status, 403);
  assert.equal(checkoutPayload, undefined);
  user = fresh(); ready = false;
  assert.equal((await checkout(request())).status, 409);
  ready = true;
  assert.equal((await checkout(request())).status, 200);
  const createdCheckout = checkoutPayload as any;
  assert.equal(createdCheckout.payment_method_collection, "always");
  assert.deepEqual(Array.from(createdCheckout.payment_method_types), ["card"]);
  assert.equal(createdCheckout.subscription_data.metadata.cardRequired, card.CARD_REQUIRED_CHECKOUT);
  assert.equal(createdCheckout.subscription_data.trial_period_days, 7);
  assert.equal(createdCheckout.subscription_data.trial_end, undefined);
  assert.match(createdCheckout.success_url, /\/start-membership\?subscribed=1$/);
  assert.match(createdCheckout.cancel_url, /\/start-membership\?canceled=1$/);
  const initialDeadline = sub.trial_end * 1000;
  live = [{ status: "trialing" }]; checkoutPayload = null;
  assert.equal((await (await checkout(request())).json()).alreadySubscribed, true);
  assert.equal(checkoutPayload, null, "No duplicate subscription checkout");
  live = []; ready = true;

  // Delayed signup still receives seven FULL days; automatic legacy markers do not.
  user = { ...fresh(), createdAt: new Date("2025-01-01") };
  assert.equal((await checkout(request())).status, 200);
  assert.equal(checkoutPayload.subscription_data.trial_period_days, 7);
  user.trialActivationVersion = 0;
  assert.equal((await checkout(request())).status, 200);
  assert.equal(checkoutPayload.subscription_data.trial_period_days, undefined, "Unmarked old accounts are not assumed unused");
  user.trialActivationVersion = 1;
  user.proTrialUsedAt = new Date("2026-10-10");
  assert.equal((await checkout(request())).status, 200);
  assert.equal(checkoutPayload.subscription_data.trial_period_days, undefined);
  user.proTrialUsedAt = null;
  live = [{ status: "canceled", trial_start: 123 }];
  assert.equal((await checkout(request())).status, 200);
  assert.equal(checkoutPayload.subscription_data.trial_period_days, undefined);
  const trialRequest = new NextRequest("https://fixture.invalid/api/stripe/checkout", { method: "POST", body: JSON.stringify({ tier: "pro", trialRequested: true }) });
  assert.equal((await checkout(trialRequest)).status, 409, "Never silently replace a requested free trial with an immediate charge");
  live = [];
  openSessions = [{ id: "cs_open", mode: "subscription", url: "https://fixture.invalid/resume", metadata: { activationVersion: "value_first_v1", tier: "pro", interval: "month" } }];
  assert.equal((await (await checkout(request())).json()).url, "https://fixture.invalid/resume");
  openSessions = [];
  user.checkoutClaimedAt = new Date();
  assert.equal((await checkout(request())).status, 409, "Concurrent checkout is fenced");
  user.checkoutClaimedAt = null;
  const concurrentCheckout = await Promise.all([checkout(request()), checkout(request())]);
  assert.equal(concurrentCheckout.filter(r => r.status === 200).length, 1);
  assert.equal(concurrentCheckout.filter(r => r.status === 409).length, 1);
  user = { ...fresh(), stripeCustomerId: "cus_fixture" };

  // Real Stripe signature verification, with offline event and subscription fixtures.
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_offline_fixture_only";
  const trialNotices: string[] = [];
  const webhook = loadModule("src/app/api/stripe/webhook/route.ts", { ...common, "@/lib/stripe": stripeDeps, "@/lib/trial": { sendTrialStartedEmail: async (_u: unknown, opts: { eventKey: string }) => { trialNotices.push(opts.eventKey); return { sent: true }; } } }).POST;
  const sendEvent = (type: string, object: any) => {
    const payload = JSON.stringify({ id: "evt_fixture", type, data: { object } });
    const signature = stripeWebhooks.generateTestHeaderString({ payload, secret: process.env.STRIPE_WEBHOOK_SECRET! });
    return webhook(new NextRequest("https://fixture.invalid/api/stripe/webhook", { method: "POST", body: payload, headers: { "stripe-signature": signature } }));
  };
  assert.equal((await webhook(new NextRequest("https://fixture.invalid/api/stripe/webhook", { method: "POST", body: "{}" }))).status, 400);
  assert.equal((await sendEvent("customer.subscription.created", sub)).status, 200);
  assert.equal(user.subscriptionStatus, "pending_payment_method");
  assert.equal(user.tier, "free");
  assert.equal((await finish()).status, 200);
  user.onboardedAt = new Date();
  assert.match(html(await membership({ searchParams: Promise.resolve({}) })), /Attendiamo la conferma/);
  assert.equal(conversions.includes("card_setup_confirmed"), false, "Pending setup is not card evidence");
  // A raw payment-method ID or a card belonging to someone else is not verified.
  for (const method of ["pm_unexpanded", { type: "sepa_debit", customer: "cus_fixture" }, { type: "card", customer: "cus_other" }]) {
    assert.equal(card.subscriptionAccessStatus({ ...sub, default_payment_method: method }), "pending_payment_method");
  }
  assert.equal(trialNotices.length, 0, "No activation notice before card confirmation");
  sub.default_payment_method = { id: "pm_fixture", type: "card", customer: "cus_fixture" };
  sub.pending_setup_intent = { status: "requires_action" };
  assert.equal(card.subscriptionAccessStatus(sub), "pending_payment_method", "SCA must finish before access");
  sub.pending_setup_intent = { status: "succeeded" };
  linkedUserLookup = true;
  // Out-of-order payload has no card; handler must use current retrieved state.
  assert.equal((await sendEvent("customer.subscription.updated", { ...sub, default_payment_method: null })).status, 200);
  assert.equal(user.subscriptionStatus, "trialing"); assert.equal(user.tier, "pro");
  assert.ok(conversions.includes("card_setup_confirmed"), "Verified server card produces an observation");
  assert.ok(trialNotices.includes(`trial-started:${sub.id}`), "Confirmed activation queues its stable subscription event");
  const noticeKey = trialNotices.at(-1);
  await sendEvent("customer.subscription.updated", sub);
  assert.equal(trialNotices.at(-1), noticeKey, "Webhook retries use the same durable email key");
  const noticesBeforeLegacy = trialNotices.length;
  user.trialActivationVersion = null;
  await sendEvent("customer.subscription.updated", sub);
  assert.equal(trialNotices.length, noticesBeforeLegacy, "No historical subscription activation replay");
  user.trialActivationVersion = 1;
  linkedUserLookup = false;
  assert.equal(user.trialEndsAt.getTime(), initialDeadline, "Webhook persists the actual Stripe trial deadline");
  await redirects(() => membership({ searchParams: Promise.resolve({ subscribed: "1" }) }), "/dashboard");
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

  // Independent review regressions: alternate entitlement writers and retries.
  user = { ...fresh(), stripeCustomerId: "cus_fixture", stripeSubscriptionId: sub.id, subscriptionStatus: "pending_payment_method" };
  sub.default_payment_method = null;
  const subscriptionRoute = loadModule("src/app/api/stripe/subscription/route.ts", { ...common, "@/lib/stripe": stripeDeps }).POST;
  const action = (name: string) => new NextRequest("https://fixture.invalid/api/stripe/subscription", { method: "POST", body: JSON.stringify({ action: name }) });
  subscriptionUpdates = 0;
  assert.equal((await subscriptionRoute(action("resume"))).status, 402);
  assert.equal(subscriptionUpdates, 0, "Unverified resume must not mutate Stripe or mint Pro");
  assert.equal(user.tier, "free");
  sub.status = "canceled";
  assert.equal((await subscriptionRoute(action("resume"))).status, 402);
  sub.status = "trialing";
  live = [sub];
  const adminLink = loadModule("src/app/api/admin/link-stripe/route.ts", {
    ...common, "@/lib/admin": { isAdmin: () => true }, "@/lib/stripe": stripeDeps,
    "@/lib/db": { prisma: { ...db, user: { ...db.user, findFirst: async () => ({ ...user }) } } },
  }).POST;
  assert.equal((await adminLink(new NextRequest("https://fixture.invalid/api/admin/link-stripe", { method: "POST", body: JSON.stringify({ email: user.email, customerId: "cus_fixture" }) }))).status, 200);
  assert.equal(user.subscriptionStatus, "pending_payment_method"); assert.equal(user.tier, "free"); live = [];

  // Failed remote verification or a failed fallback write returns retryable 500.
  retrieveFailure = true; writes = [];
  assert.equal((await sendEvent("customer.subscription.updated", sub)).status, 500);
  assert.equal(writes.length, 0); assert.equal((await finish()).status, 200);
  retrieveFailure = false; writeFailure = true;
  assert.equal((await sendEvent("checkout.session.completed", { mode: "subscription", payment_status: "no_payment_required", customer: "cus_fixture", subscription: sub.id, client_reference_id: user.id })).status, 500);
  writeFailure = false;

  // A concurrent confirmation wins over an earlier pending snapshot, even on fallback.
  beforeWrite = () => Object.assign(user!, { tier: "pro", subscriptionStatus: "trialing", stripeSubscriptionId: sub.id });
  assert.equal((await sendEvent("customer.subscription.updated", sub)).status, 200);
  assert.equal(user.subscriptionStatus, "trialing"); assert.equal(user.tier, "pro");
  sub.default_payment_method = { id: "pm_fixture", type: "card", customer: "cus_fixture" };
  await sendEvent("customer.subscription.updated", sub);
  const usedAt = (user as any).proTrialUsedAt;
  await sendEvent("customer.subscription.updated", sub);
  assert.equal((user as any).proTrialUsedAt, usedAt, "Duplicate events retain first-used time");

  // Old deletion, failure and live-checkout replays must not replace a newer entitlement.
  user = { ...fresh(), tier: "pro", stripeCustomerId: "cus_fixture", stripeSubscriptionId: "sub_newer", subscriptionStatus: "active" };
  writes = [];
  await sendEvent("customer.subscription.deleted", sub);
  sub.status = "past_due";
  await sendEvent("invoice.payment_failed", { customer: "cus_fixture", parent: { subscription_details: { subscription: sub.id } } });
  sub.status = "active";
  await sendEvent("checkout.session.completed", { mode: "subscription", payment_status: "paid", customer: "cus_fixture", subscription: sub.id });
  assert.equal(writes.length, 0); assert.equal(user.stripeSubscriptionId, "sub_newer");
  user.stripeSubscriptionId = sub.id;
  await sendEvent("invoice.payment_failed", { customer: "cus_fixture", parent: { subscription_details: { subscription: sub.id } } });
  assert.equal(user.subscriptionStatus, "active", "Resolved invoice failure cannot downgrade recovered access");

  // A stale verified snapshot cannot regrant after a concurrent cancellation.
  beforeWrite = () => Object.assign(user!, { tier: "free", subscriptionStatus: "canceled", stripeSubscriptionId: null });
  assert.equal((await sendEvent("customer.subscription.updated", sub)).status, 500);
  assert.equal(user.subscriptionStatus, "canceled"); assert.equal(user.tier, "free");

  // Stale failure snapshots cannot overwrite a concurrent successful recovery.
  for (const eventType of ["customer.subscription.updated", "invoice.payment_failed"]) {
    user = { ...fresh(), tier: "free", stripeCustomerId: "cus_fixture", stripeSubscriptionId: sub.id, subscriptionStatus: "past_due" };
    sub.status = "past_due";
    beforeWrite = () => Object.assign(user!, { tier: "pro", subscriptionStatus: "active" });
    const object = eventType === "invoice.payment_failed"
      ? { customer: "cus_fixture", parent: { subscription_details: { subscription: sub.id } } } : sub;
    assert.equal((await sendEvent(eventType, object)).status, 500);
    assert.equal(user.subscriptionStatus, "active"); assert.equal(user.tier, "pro");
  }

  // Unverified zero-value active setup must not record a purchase or reward.
  user = { ...fresh(), stripeCustomerId: "cus_fixture" };
  sub.status = "active";
  sub.default_payment_method = null; linkedUserLookup = true; conversions.length = 0;
  await sendEvent("customer.subscription.updated", sub);
  assert.equal(user.subscriptionStatus, "pending_payment_method");
  assert.equal(conversions.length, 0);
  linkedUserLookup = false;

  // An existing per-subscription DB claim makes referral consumption idempotent.
  sub.default_payment_method = { id: "pm_fixture", type: "card", customer: "cus_fixture" };
  sub.status = "trialing"; sub.metadata.referralCredit = "1";
  user.referralCredits = 3;
  const simultaneous = await Promise.all([sendEvent("customer.subscription.updated", sub), sendEvent("customer.subscription.updated", sub)]);
  assert.ok(simultaneous.some(response => response.status === 200));
  assert.equal(user.referralCredits, 2, "Concurrent/replayed events consume one referral credit");
  await sendEvent("customer.subscription.updated", sub);
  assert.equal(user.referralCredits, 2);
  delete sub.metadata.referralCredit;

  // Actual paid invoices, including renewals, are distinct from a zero-value trial.
  conversions.length = 0;
  user = { ...fresh(), stripeCustomerId: "cus_fixture" };
  const invoice = { id: "in_first", status: "paid", amount_paid: 0, currency: "eur", customer: "cus_fixture", parent: { subscription_details: { subscription: sub.id } } };
  await sendEvent("invoice.paid", invoice);
  assert.equal(conversions.includes("purchase_completed"), false);
  invoice.amount_paid = 1999;
  await sendEvent("invoice.paid", invoice);
  await sendEvent("invoice.paid", invoice);
  assert.equal(conversions.filter(v => v === "purchase_completed").length, 1);
  await sendEvent("invoice.paid", { ...invoice, id: "in_renewal" });
  assert.equal(conversions.filter(v => v === "purchase_completed").length, 2);

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
  assert.match(html(await onboarding()), /CV setup/);
  assert.equal((await finish()).status, 200);
  user.createdAt = new Date(Date.now() - 8 * 86400_000);
  assert.match(html(await onboarding()), /CV setup/);
  assert.match(html(await membership({ searchParams: Promise.resolve({}) })), /Carta richiesta/);
  assert.equal((await finish()).status, 200);

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
  for (const path of ["/dashboard", "/api/preferences/activate-auto", "/api/applications/apply", "/api/applications/apply-batch", "/api/optimize"]) {
    const res = await proxy(req(path));
    assert.equal(res.status, path.startsWith("/api/") ? 402 : 307, path);
  }
  for (const path of ["/onboarding", "/api/onboarding/demo/complete", "/start-membership", "/trial-expired", "/api/stripe/checkout", "/api/stripe/webhook", "/analizza-cv", "/optimize", "/api/optimize/stage", "/", "/login", "/verify-email"]) {
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
    user = { ...fresh(), onboardedAt: new Date(), subscriptionStatus: status };
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
  const hScrollStub = { HScroll: ({ children, className }: { children: React.ReactNode; className?: string }) => React.createElement("div", { className: `lv-hscroll ${className ?? ""}` }, children) };
  const adminPage = loadModule("src/app/(app)/admin/users/page.tsx", { "@/components/h-scroll": hScrollStub,
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
  console.log("PASS: value-first signup/verification, direct page/API gates, canceled/pending/verified Stripe, signature, SCA, duplicate protection, existing entitlements, expiry, refresh/redirect graph, public demo and admin rendering");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
