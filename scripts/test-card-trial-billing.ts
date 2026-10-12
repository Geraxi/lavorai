/** Offline behavioral tests of the actual source, transpiled with explicit mocks.
 * No real Prisma/Stripe module is imported; unknown imports fail closed.
 * This does not test a database, Stripe API, webhook signature, or integration.
 * Run: node --import tsx scripts/test-card-trial-billing.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
function sourceModule(path: string, imports: Record<string, unknown>, env: Record<string, string | undefined>) {
  const module = { exports: {} as Record<string, any> };
  const output = ts.transpileModule(read(path), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  runInNewContext(output, { module, exports: module.exports, Date, Math, Number, Boolean, String, Error, console,
    process: { env }, require(name: string) { if (!(name in imports)) throw new Error(`Unexpected dependency: ${name}`); return imports[name]; } }, { filename: path });
  return module.exports;
}
let assertions = 0;
function check(name: string, body: () => void) { body(); assertions++; console.log(`PASS ${name}`); }
async function asyncCheck(name: string, body: () => Promise<void>) { await body(); assertions++; console.log(`PASS ${name}`); }
const cutoff = "2026-11-01T00:00:00.000Z";
const env: Record<string, string | undefined> = {};
const policy = sourceModule("src/lib/card-trial-policy.ts", {}, env);
check("rollout defaults disabled and leaves legacy users outside cohort", () => {
  assert.equal(policy.cardTrialEnrollmentAvailable(), false);
  assert.equal(policy.isCardTrialCohort({ createdAt: new Date(cutoff) }), false);
});
env.CARD_TRIAL_COHORT_START = cutoff;
env.OPENAI_API_KEY = "offline-placeholder";
env.OPENAI_MODEL_STRONG = "offline-model";
check("immutable cohort boundary is independent of readiness switch", () => {
  for (const readiness of [undefined, "false", "verified"]) {
    env.CARD_TRIAL_PROVIDER_READY = readiness;
    assert.equal(policy.isCardTrialCohort({ createdAt: "2026-10-31T23:59:59.999Z", trialEndsAt: "2030-01-01" }), false);
    assert.equal(policy.isCardTrialCohort({ createdAt: cutoff, trialEndsAt: "2020-01-01" }), true);
    assert.equal(policy.isCardTrialCohort({ createdAt: "2026-11-01T00:00:00.001Z" }), true);
    assert.equal(policy.cardTrialEnrollmentAvailable(), readiness === "verified");
  }
  assert.equal(policy.isCardTrialCohort({}), false);
  assert.equal(policy.isCardTrialCohort({ createdAt: "invalid" }), false);
});
const legacyBilling = sourceModule("src/lib/billing.ts", { "@/lib/card-trial-policy": policy }, env);
check("grandfathered compensated Pro+ access does not require new cash proof or normalize promised dates", () => {
  const compensated = { createdAt: "2026-10-01T00:00:00Z", email: "compensated-fixture@example.invalid", tier: "pro_plus", subscriptionStatus: null, trialEndsAt: "2026-11-05T23:59:59Z", currentPeriodEnd: "2026-11-05T23:59:59Z" };
  const before = JSON.stringify(compensated);
  assert.equal(policy.isCardTrialCohort(compensated), false);
  assert.equal(legacyBilling.effectiveTier(compensated), "pro_plus");
  assert.equal(legacyBilling.isApplicationAccessPaused(compensated), false);
  assert.equal(legacyBilling.requiresPaymentMethodBeforeApp(compensated), false);
  assert.equal(JSON.stringify(compensated), before);
});
check("readiness alone cannot enroll without provider key and explicit model", () => {
  env.CARD_TRIAL_PROVIDER_READY = "verified";
  delete env.OPENAI_API_KEY; assert.equal(policy.cardTrialEnrollmentAvailable(), false);
  env.OPENAI_API_KEY = "offline-placeholder";
  delete env.OPENAI_MODEL_STRONG; assert.equal(policy.cardTrialEnrollmentAvailable(), false);
  env.OPENAI_MODEL_STRONG = "offline-model";
});
check("invalid configured cutoff fails closed", () => {
  env.CARD_TRIAL_COHORT_START = "invalid";
  assert.throws(() => policy.isCardTrialCohort({ createdAt: cutoff }));
  env.CARD_TRIAL_COHORT_START = cutoff;
});
const now = Date.parse("2026-11-02T00:00:00Z");
check("access closes at exact expiry, and status/card proof are mandatory", () => {
  for (const delta of [-1, 0, 1]) {
    const date = new Date(now + delta);
    assert.equal(policy.cardTrialHasPaidAccess({ status: "active", paidThrough: date }, now), delta > 0);
    assert.equal(policy.cardTrialHasPreviewAccess({ status: "trialing", cardVerifiedAt: new Date(now - 1), trialEndsAt: date }, now), delta > 0);
  }
  for (const status of ["trialing", "past_due", "unpaid", "paused", "canceled", "payment_pending"]) {
    assert.equal(policy.cardTrialHasPaidAccess({ status, paidThrough: new Date(now + 1000) }, now), false);
  }
  assert.equal(policy.cardTrialHasPreviewAccess({ status: "trialing", cardVerifiedAt: null, trialEndsAt: new Date(now + 1000) }, now), false);
});

async function main() {
  let row: any;
  let subscription: any;
  let invoice: any;
  let checkout: any;
  let seen = false;
  let priorSubscriptions: any = { data: [], has_more: false };
  let user: any;
  let priorSubscription: any = null;
  let failEventInsert = false;
  let committed = false;
  const calls: Array<{ name: string; args: any[] }> = [];
  const record = (name: string, value: any) => async (...args: any[]) => { calls.push({ name, args }); return typeof value === "function" ? value(...args) : value; };
  const tx = {
    $queryRaw: record("sql.read", (parts: TemplateStringsArray) => parts.join("").includes("CardTrialWebhookEvent") ? (seen ? [{ eventId: "evt_1" }] : []) : (row ? [row] : [])),
    $executeRaw: record("sql.write", (parts: TemplateStringsArray) => { if (failEventInsert && parts.join("").includes('INSERT INTO "CardTrialWebhookEvent"')) throw new Error("fixture transaction failure"); return 1; }),
    user: { update: record("user.update", { id: "u1" }) },
  };
  const prisma = { ...tx, user: { ...tx.user, findFirst: record("user.findFirst", () => user) }, $transaction: async (fn: any) => { const result = await fn(tx); committed = true; return result; } };
  const stripe = {
    checkout: { sessions: { retrieve: record("checkout.retrieve", () => checkout), create: record("checkout.create", { id: "cs_new", url: "https://checkout.invalid/new", expires_at: now / 1000 + 3600 }) } },
    subscriptions: { retrieve: record("subscription.retrieve", (id: string) => id === "sub_prior" ? priorSubscription : subscription), list: record("subscription.list", () => priorSubscriptions) },
    invoices: { retrieve: record("invoice.retrieve", () => invoice) },
    paymentMethods: { retrieve: record("paymentMethod.retrieve", { id: "pm1", type: "card" }) },
    customers: { create: record("customer.create", { id: "cus_1" }) },
    billingPortal: { sessions: { create: record("portal.create", { url: "https://billing.invalid/portal" }) } },
  };
  const dependencies = { "@/lib/card-trial-referral": { rewardCardTrialReferralIfDue: record("referral.reward", () => { assert.equal(committed, true, "Reward dispatch only after billing transaction commits"); return "rewarded"; }) }, "@/lib/db": { prisma }, "@/lib/stripe": { stripe: () => stripe, tierToPriceId: (tier: string) => `price_${tier}`, priceIdToTier: (id: string) => id === "price_pro" ? "pro" : null }, "@/lib/card-trial-policy": policy, "@/lib/card-trial-cohort": { isCardTrialUser: async (candidate: any) => policy.isCardTrialCohort(candidate) }, "node:crypto": { randomUUID: () => "new_attempt" } };
  const webhook = sourceModule("src/lib/card-trial-webhook.ts", dependencies, env);
  const create = sourceModule("src/lib/card-trial-checkout.ts", dependencies, env).createCardTrialCheckout;
  const base = { status: "active", paused: false, cardVerified: true, trialStart: now / 1000 - 86400, trialEnd: now / 1000 + 2 * 86400, invoicePaid: true, amountPaid: 1900, invoiceId: "in_1", paidPeriodEnd: now / 1000 + 30 * 86400 };
  const reduce = (patch: object) => webhook.reduceCardTrialSnapshot({ ...base, ...patch }, now);
  check("positive paid invoice enables active access through verified end", () => { const next = reduce({}); assert.equal(next.paid, true); assert.equal(next.status, "active"); assert.equal(next.paidThrough.getTime(), base.paidPeriodEnd * 1000); });
  check("zero invoice, trialing, no invoice, failure, pause, cancellation cannot grant paid", () => {
    for (const patch of [{ amountPaid: 0 }, { amountPaid: -1 }, { invoicePaid: false }, { status: "trialing" }, { status: "past_due" }, { status: "unpaid" }, { status: "incomplete" }, { status: "canceled" }, { paused: true }, { paidPeriodEnd: null }, { paidPeriodEnd: now / 1000 }]) {
      assert.equal(reduce(patch).paid, false, JSON.stringify(patch));
      assert.equal(reduce(patch).paidThrough, null);
    }
  });
  check("preview requires exactly three days and a verified card", () => {
    assert.equal(reduce({ status: "trialing" }).status, "trialing");
    for (const patch of [{ trialEnd: base.trialEnd + 1 }, { trialEnd: base.trialEnd - 1 }, { cardVerified: false }, { paused: true }, { trialStart: null }, { trialEnd: now / 1000 }]) {
      const next = reduce({ status: "trialing", ...patch });
      assert.equal(next.paid, false);
      assert.notEqual(next.status, "trialing", JSON.stringify(patch));
    }
  });
  await asyncCheck("persisted policy survives cutoff removal", async () => {
    const previous = env.CARD_TRIAL_COHORT_START;
    delete env.CARD_TRIAL_COHORT_START;
    assert.equal(policy.isCardTrialCohort({ createdAt: cutoff, billingPolicy: policy.CARD_TRIAL_POLICY }), true);
    env.CARD_TRIAL_COHORT_START = previous;
  });
  function reset() {
    calls.length = 0; seen = false; priorSubscription = null; failEventInsert = false; committed = false; priorSubscriptions = { data: [], has_more: false };
    user = { id: "u1", email: "test@example.invalid", name: "Test", locale: "en", emailVerified: new Date(now), createdAt: cutoff, stripeCustomerId: "cus_1" };
    row = { checkoutKind: "trial", firstPaidInvoiceId: null, userId: "u1", tier: "pro", checkoutAttempt: "attempt_1", checkoutAttemptStartedAt: new Date(), customerId: "cus_1", checkoutSessionId: "cs_1", subscriptionId: "sub_1", trialStartedAt: new Date(now - 86400000), trialEndsAt: new Date(now + 2 * 86400000), cardVerifiedAt: new Date(now - 86400000) };
    checkout = { id: "cs_1", status: "complete", mode: "subscription", customer: "cus_1", subscription: "sub_1", client_reference_id: "u1", metadata: { policy: policy.CARD_TRIAL_POLICY, attempt: "attempt_1" } };
    const start = Math.floor(Date.now() / 1000) - 60;
    invoice = { id: "in_1", customer: "cus_1", status: "paid", amount_paid: 1900, parent: { subscription_details: { subscription: "sub_1" } }, lines: { has_more: false, data: [{ parent: { subscription_item_details: { subscription: "sub_1", subscription_item: "si_1" } }, period: { start, end: start + 30 * 86400 }, amount: 1900, pricing: { price_details: { price: "price_pro" } } }] } };
    subscription = { id: "sub_1", customer: "cus_1", metadata: { policy: policy.CARD_TRIAL_POLICY, userId: "u1", attempt: "attempt_1" }, status: "active", default_payment_method: { id: "pm1", type: "card" }, latest_invoice: invoice, trial_start: now / 1000 - 86400, trial_end: now / 1000 + 2 * 86400, items: { data: [{ id: "si_1", price: { id: "price_pro" }, current_period_start: start, current_period_end: start + 30 * 86400 }] }, cancel_at_period_end: false };
  }
  const event = (type = "invoice.paid", object: object = { id: "in_1", customer: "cus_1", parent: { subscription_details: { subscription: "sub_1" } } }) => ({ id: "evt_1", type, data: { object } });
  await asyncCheck("disabled checkout performs no DB or provider calls", async () => { reset(); env.CARD_TRIAL_PROVIDER_READY = undefined; await assert.rejects(create(user, "pro"), /PREVIEW_UNAVAILABLE/); assert.equal(calls.length, 0); env.CARD_TRIAL_PROVIDER_READY = "verified"; });
  await asyncCheck("unverified email rejected before DB/provider calls", async () => { reset(); user.emailVerified = null; await assert.rejects(create(user, "pro"), /EMAIL_VERIFICATION_REQUIRED/); assert.equal(calls.length, 0); });
  await asyncCheck("checkout requires card, three-day trial, durable retry key and fixed tier", async () => {
    reset(); row.subscriptionId = null; row.trialStartedAt = null; row.trialEndsAt = null; row.cardVerifiedAt = null; row.checkoutSessionId = null;
    await create(user, "pro_plus");
    const call = calls.find(c => c.name === "checkout.create")!;
    assert.equal(call.args[0].payment_method_collection, "always");
    assert.equal(call.args[0].payment_method_types[0], "card");
    assert.equal(call.args[0].subscription_data.trial_period_days, 3);
    assert.equal(call.args[0].line_items[0].price, "price_pro");
    assert.equal(call.args[1].idempotencyKey, "card-trial-checkout:u1:attempt_1");
    assert.equal(call.args[0].subscription_data.trial_settings.end_behavior.missing_payment_method, "cancel");
    assert.equal(call.args[0].discounts, undefined);
    assert.ok(calls.findIndex(c => c.name === "sql.write") < calls.findIndex(c => c.name === "checkout.create"));
  });
  await asyncCheck("old unresolved attempt and any prior subscription fail closed", async () => {
    reset(); row.subscriptionId = null; row.trialStartedAt = null; row.trialEndsAt = null; row.cardVerifiedAt = null; row.checkoutSessionId = null; row.checkoutAttemptStartedAt = new Date(Date.now() - 23 * 3600_000);
    await assert.rejects(create(user, "pro"), /CHECKOUT_RECONCILIATION_REQUIRED/);
    assert.equal(calls.some(c => c.name === "checkout.create"), false);
    for (const existing of [{ data: [{ id: "sub_old", status: "canceled" }], has_more: false }, { data: [], has_more: true }]) {
      reset(); row.subscriptionId = null; row.trialStartedAt = null; row.trialEndsAt = null; row.cardVerifiedAt = null; row.checkoutSessionId = null; priorSubscriptions = existing;
      await assert.rejects(create(user, "pro"), /PRIOR_SUBSCRIPTION_REQUIRES_REVIEW/);
      assert.equal(calls.some(c => c.name === "checkout.create"), false);
    }
  });
  await asyncCheck("open checkout reused and subscriber sent to portal", async () => {
    reset(); row.subscriptionId = null; row.trialStartedAt = null; row.trialEndsAt = null; row.cardVerifiedAt = null; checkout.status = "open"; checkout.url = "https://checkout.invalid/existing";
    assert.equal((await create(user, "pro")).url, checkout.url); assert.equal(calls.some(c => c.name === "checkout.create"), false);
    reset(); assert.equal((await create(user, "pro")).alreadySubscribed, true); assert.equal(calls.some(c => c.name === "checkout.create"), false);
  });
  await asyncCheck("completed checkout cannot start a second trial before reconciliation", async () => {
    reset(); row.subscriptionId = null; row.trialStartedAt = null; row.trialEndsAt = null; row.cardVerifiedAt = null;
    await assert.rejects(create(user, "pro"), /CHECKOUT_CONFIRMATION_PENDING/);
    assert.equal(calls.some(c => c.name === "checkout.create"), false);
  });
  await asyncCheck("incomplete or foreign checkout cannot mutate paid status", async () => {
    for (const patch of [{ status: "open" }, { customer: "cus_other" }, { client_reference_id: "u_other" }, { metadata: { policy: "legacy" } }]) {
      reset(); Object.assign(checkout, patch);
      await assert.rejects(webhook.handleCardTrialWebhook(event()), /checkout|mismatch/i);
      assert.equal(calls.some(c => c.name === "user.update"), false);
    }
  });
  await asyncCheck("original trial timestamps remain unchanged on later provider snapshots", async () => {
    reset(); const originalStart = row.trialStartedAt; const originalEnd = row.trialEndsAt;
    subscription.trial_start += 86400; subscription.trial_end += 86400;
    await webhook.handleCardTrialWebhook(event());
    const write = calls.find(c => c.name === "sql.write" && c.args[0].join("").includes('UPDATE "CardTrialEnrollment"'))!;
    assert.ok(write.args.includes(originalStart)); assert.ok(write.args.includes(originalEnd));
  });
  await asyncCheck("duplicate webhook avoids provider and entitlement writes", async () => { reset(); seen = true; assert.equal(await webhook.handleCardTrialWebhook(event()), true); assert.equal(calls.some(c => c.name === "subscription.retrieve" || c.name === "checkout.retrieve" || c.name === "user.update"), false); });
  await asyncCheck("legacy cohort falls through without provider calls", async () => { reset(); user.createdAt = "2020-01-01"; assert.equal(await webhook.handleCardTrialWebhook(event()), false); assert.equal(calls.some(c => c.name === "checkout.retrieve"), false); });
  await asyncCheck("foreign subscription event cannot change entitlement", async () => { reset(); await webhook.handleCardTrialWebhook(event("customer.subscription.deleted", { id: "sub_other", customer: "cus_1" })); assert.equal(calls.some(c => c.name === "user.update" || c.name === "subscription.retrieve"), false); });
  await asyncCheck("verified current positive invoice upgrades; source ownership mismatch cannot", async () => {
    reset(); await webhook.handleCardTrialWebhook(event()); assert.equal(calls.find(c => c.name === "user.update")!.args[0].data.tier, "pro");
    reset(); subscription.customer = "cus_other"; await assert.rejects(webhook.handleCardTrialWebhook(event()), /ownership|mismatch/i); assert.equal(calls.some(c => c.name === "user.update"), false);
  });
  await asyncCheck("zero invoice and foreign invoice never upgrade", async () => {
    for (const patch of [{ amount_paid: 0 }, { customer: "cus_other" }, { parent: { subscription_details: { subscription: "sub_other" } } }]) {
      reset(); Object.assign(invoice, patch); await webhook.handleCardTrialWebhook(event()); assert.equal(calls.find(c => c.name === "user.update")!.args[0].data.tier, "free");
    }
  });
  await asyncCheck("old/future/foreign/nonpositive invoice lines cannot fund current service", async () => {
    const mutations: Array<(line: any) => void> = [
      line => { line.period.end = Math.floor(Date.now() / 1000) - 1; },
      line => { line.period.start = Math.floor(Date.now() / 1000) + 3600; },
      line => { line.parent.subscription_item_details.subscription = "sub_other"; },
      line => { line.pricing.price_details.price = "price_other"; },
      line => { line.amount = 0; },
    ];
    for (const mutate of mutations) {
      reset(); mutate(invoice.lines.data[0]); await webhook.handleCardTrialWebhook(event());
      assert.equal(calls.find(c => c.name === "user.update")!.args[0].data.tier, "free");
    }
    reset(); invoice.lines.has_more = true; await webhook.handleCardTrialWebhook(event());
    assert.equal(calls.find(c => c.name === "user.update")!.args[0].data.tier, "free");
  });
  await asyncCheck("current provider state defeats stale active event payload", async () => {
    for (const status of ["past_due", "unpaid", "paused", "canceled", "incomplete", "trialing"]) {
      reset(); subscription.status = status;
      await webhook.handleCardTrialWebhook(event("customer.subscription.updated", { id: "sub_1", customer: "cus_1", status: "active" }));
      assert.equal(calls.find(c => c.name === "user.update")!.args[0].data.tier, "free", status);
    }
    reset(); subscription.pause_collection = { behavior: "void" }; await webhook.handleCardTrialWebhook(event());
    assert.equal(calls.find(c => c.name === "user.update")!.args[0].data.tier, "free");
  });
  function cohortHarness(initialCutoff: Date | null = null) {
    const state = { tableExists: true, persistedCutoff: initialCutoff, policies: new Map<string, string>(), policyWrites: 0 };
    const cohort = sourceModule("src/lib/card-trial-cohort.ts", { "@/lib/card-trial-policy": policy, "@/lib/db": { prisma: {
      $queryRaw: async (parts: TemplateStringsArray, ...values: any[]) => {
        const sql = parts.join("");
        if (sql.includes("to_regclass")) return [{ exists: state.tableExists }];
        if (sql.includes('FROM "CardTrialRollout"')) return state.persistedCutoff ? [{ startsAt: state.persistedCutoff }] : [];
        if (sql.includes('FROM "CardTrialPolicy"')) return state.policies.has(values[0]) ? [{ policy: state.policies.get(values[0]) }] : [];
        throw new Error(`Unexpected cohort read: ${sql}`);
      },
      $executeRaw: async (parts: TemplateStringsArray, ...values: any[]) => {
        const sql = parts.join("");
        if (sql.includes('INSERT INTO "CardTrialRollout"')) {
          assert.match(sql, /ON CONFLICT \("id"\) DO NOTHING/);
          state.persistedCutoff ??= values[0];
        } else if (sql.includes('INSERT INTO "CardTrialPolicy"')) {
          assert.match(sql, /ON CONFLICT \("userId"\) DO NOTHING/);
          if (!state.policies.has(values[0])) state.policies.set(values[0], values[1]);
          state.policyWrites++;
        } else throw new Error(`Unexpected cohort write: ${sql}`);
        return 1;
      },
    } } }, env);
    return { cohort, state };
  }
  await asyncCheck("payment recorded before cancellation still earns referral without access", async () => {
    reset(); subscription.status = "canceled";
    await webhook.handleCardTrialWebhook(event());
    assert.equal(calls.find(c => c.name === "user.update")!.args[0].data.tier, "free");
    assert.equal(calls.filter(c => c.name === "referral.reward").length, 1);
    reset(); subscription.status = "canceled"; invoice.amount_paid = 0;
    await webhook.handleCardTrialWebhook(event());
    assert.equal(calls.some(c => c.name === "referral.reward"), false);
  });
  await asyncCheck("positive payment dispatches promised referral only after commit; zero trial does not", async () => {
    reset(); await webhook.handleCardTrialWebhook(event()); assert.equal(calls.filter(c => c.name === "referral.reward").length, 1);
    const write = calls.find(c => c.name === "sql.write" && c.args[0].join("").includes('UPDATE "CardTrialEnrollment"'))!;
    assert.match(write.args[0].join(""), /firstPaidInvoiceId.*COALESCE/);
    reset(); invoice.amount_paid = 0; await webhook.handleCardTrialWebhook(event()); assert.equal(calls.some(c => c.name === "referral.reward"), false);
    reset(); failEventInsert = true; await assert.rejects(webhook.handleCardTrialWebhook(event()), /transaction failure/); assert.equal(calls.some(c => c.name === "referral.reward"), false);
    reset(); seen = true; row.firstPaidInvoiceId = "in_previous"; await webhook.handleCardTrialWebhook(event()); assert.equal(calls.filter(c => c.name === "referral.reward").length, 1);
  });
  await asyncCheck("paid reactivation binds only canceled prior subscription and cannot grant another trial", async () => {
    const prepare = () => {
      reset(); row.subscriptionId = "sub_prior"; row.checkoutKind = "paid_reactivation";
      priorSubscription = { id: "sub_prior", customer: "cus_1", status: "canceled" };
      checkout.metadata.checkoutKind = "paid_reactivation"; subscription.metadata.checkoutKind = "paid_reactivation";
      subscription.trial_start = null; subscription.trial_end = null;
    };
    prepare(); await webhook.handleCardTrialWebhook(event()); assert.equal(calls.find(c => c.name === "user.update")!.args[0].data.tier, "pro");
    prepare(); priorSubscription.status = "active"; await assert.rejects(webhook.handleCardTrialWebhook(event()), /not canceled/);
    prepare(); subscription.status = "trialing"; await assert.rejects(webhook.handleCardTrialWebhook(event()), /another trial/);
    prepare(); checkout.metadata.attempt = "old_attempt"; await assert.rejects(webhook.handleCardTrialWebhook(event()), /attempt mismatch/);
    prepare(); await webhook.handleCardTrialWebhook(event("customer.subscription.deleted", { id: "sub_prior", customer: "cus_1" })); assert.equal(calls.some(c => c.name === "user.update"), false);
  });
  await asyncCheck("stored policy takes precedence; schema absence fails closed when enabled", async () => {
    const { cohort, state } = cohortHarness(new Date(cutoff));
    state.policies.set("u1", policy.CARD_TRIAL_POLICY);
    const previous = env.CARD_TRIAL_COHORT_START;
    delete env.CARD_TRIAL_COHORT_START;
    assert.equal(await cohort.isCardTrialUser({ id: "u1", createdAt: "2020-01-01" }), true);
    state.policies.clear(); state.tableExists = false;
    assert.equal(await cohort.isCardTrialUser({ id: "u1", createdAt: cutoff }), false);
    env.CARD_TRIAL_COHORT_START = previous;
    await assert.rejects(cohort.isCardTrialUser({ id: "u1", createdAt: cutoff }), /schema/i);
    state.tableExists = true;
    assert.equal(await cohort.isCardTrialUser({ id: "legacy", createdAt: "2020-01-01" }), false);
    assert.equal(state.policyWrites, 0);
    assert.equal(await cohort.isCardTrialUser({ id: "new", createdAt: cutoff }), true);
    assert.equal(state.policyWrites, 1);
  });
  await asyncCheck("first global cutoff is immutable when configuration moves earlier or later", async () => {
    const { cohort, state } = cohortHarness();
    env.CARD_TRIAL_COHORT_START = cutoff;
    assert.equal((await cohort.getPersistedCardTrialCutoff()).getTime(), Date.parse(cutoff));
    assert.equal(state.persistedCutoff!.getTime(), Date.parse(cutoff));
    for (const configured of ["2020-01-01T00:00:00Z", "2030-01-01T00:00:00Z"]) {
      env.CARD_TRIAL_COHORT_START = configured;
      assert.equal((await cohort.getPersistedCardTrialCutoff()).getTime(), Date.parse(cutoff));
      assert.equal(await cohort.isCardTrialUser({ id: `legacy-${configured}`, createdAt: "2026-10-31T23:59:59.999Z" }), false);
      assert.equal(await cohort.isCardTrialUser({ id: `boundary-${configured}`, createdAt: cutoff }), true);
      assert.equal(await cohort.isCardTrialUser({ id: `new-${configured}`, createdAt: "2026-12-01" }), true);
    }
    env.CARD_TRIAL_COHORT_START = cutoff;
  });
  await asyncCheck("removed configuration keeps persisted cohort for newly encountered users but disables enrollment", async () => {
    const { cohort } = cohortHarness(new Date(cutoff));
    delete env.CARD_TRIAL_COHORT_START;
    assert.equal((await cohort.getPersistedCardTrialCutoff()).getTime(), Date.parse(cutoff));
    assert.equal(await cohort.isCardTrialUser({ id: "unseen-new", createdAt: "2026-12-01" }), true);
    assert.equal(await cohort.isCardTrialUser({ id: "unseen-legacy", createdAt: "2020-01-01" }), false);
    assert.equal(policy.cardTrialEnrollmentAvailable(), false);
    reset(); await assert.rejects(create(user, "pro"), /PREVIEW_UNAVAILABLE/);
    assert.equal(calls.length, 0);
    env.CARD_TRIAL_COHORT_START = cutoff;
  });
  await asyncCheck("no configured or persisted launch stays disabled; invalid configuration fails closed", async () => {
    const { cohort } = cohortHarness();
    delete env.CARD_TRIAL_COHORT_START;
    assert.equal(await cohort.getPersistedCardTrialCutoff(), null);
    assert.equal(await cohort.isCardTrialUser({ id: "u1", createdAt: cutoff }), false);
    env.CARD_TRIAL_COHORT_START = "not-a-date";
    await assert.rejects(cohort.getPersistedCardTrialCutoff(), /Invalid/);
    env.CARD_TRIAL_COHORT_START = cutoff;
  });
  await asyncCheck("anonymous restriction remains active after launch configuration is removed", async () => {
    const { cohort } = cohortHarness(new Date(Date.now() - 1000));
    delete env.CARD_TRIAL_COHORT_START;
    assert.equal(await cohort.cardTrialPublicAccessRestricted(), true);
    const future = cohortHarness(new Date(Date.now() + 86400_000)).cohort;
    assert.equal(await future.cardTrialPublicAccessRestricted(), false);
    env.CARD_TRIAL_COHORT_START = cutoff;
  });
  check("static safeguards: signature verification precedes dispatch and legacy switch", () => {
    const route = read("src/app/api/stripe/webhook/route.ts");
    assert.ok(route.indexOf("webhooks.constructEvent(") < route.indexOf("await handleCardTrialWebhook(event)"));
    assert.ok(route.indexOf("await handleCardTrialWebhook(event)") < route.indexOf("switch (event.type)"));
    const source = read("src/lib/card-trial-webhook.ts");
    assert.match(source, /FOR UPDATE/); assert.match(source, /SELECT "eventId" FROM "CardTrialWebhookEvent"/); assert.match(source, /INSERT INTO "CardTrialWebhookEvent"/);
    assert.match(source, /row\.trialStartedAt \?\?/); assert.match(source, /row\.trialEndsAt \?\?/);
  });
  console.log(`PASS: ${assertions} offline behavioral/static groups. No live DB, Stripe, AI, or end-to-end integrations were exercised.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
