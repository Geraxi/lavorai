/** Offline actual-source tests. No Stripe, database, credentials, or charges. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const source = readFileSync(new URL("../src/lib/card-trial-checkout.ts", import.meta.url), "utf8");
let row: any;
let committedAttempt: string;
let userState: any;
let committedUser: any;
let committedRow: any;
let serial = 0;
let oldStatus = "canceled";
let oldCustomer = "cus_1";
let live: any[] = [];
let prior: any;
let failCreate = false;
let creates: any[] = [];
let portals = 0;
let trialEvidence: any;
const execute = async (parts: TemplateStringsArray, ...values: any[]) => {
  const sql = parts.join("?");
  if (sql.startsWith("INSERT")) return 1;
  if (sql.includes('"checkoutAttempt"=')) {
    row.checkoutAttempt = values[0]; row.checkoutAttemptStartedAt = new Date();
    row.checkoutSessionId = row.checkoutUrl = row.checkoutExpiresAt = null;
    if (sql.includes("'paid_reactivation'")) { row.checkoutKind = "paid_reactivation"; row.tier = values[1]; }
    if (sql.includes(`"status"='canceled'`)) row.status = "canceled";
    if (sql.includes('"paidThrough"=NULL')) row.paidThrough = null;
    if (sql.includes('"paidInvoiceId"=NULL')) row.paidInvoiceId = null;
    if (sql.includes('"cancelAtPeriodEnd"=false')) row.cancelAtPeriodEnd = false;
  } else if (sql.includes('SET "customerId"=')) {
    [row.customerId, row.checkoutSessionId, row.checkoutUrl, row.checkoutExpiresAt] = values;
  }
  return 1;
};
const tx = { $queryRaw: async () => [row], $executeRaw: execute, user: { update: async ({ data }: any) => { Object.assign(userState, data); return { id: "u1" }; } } };
const prisma = { ...tx, $transaction: async (fn: any) => { const snapshot = structuredClone(row); const userSnapshot = structuredClone(userState); try { const result = await fn(tx); committedAttempt = row.checkoutAttempt; committedRow = structuredClone(row); committedUser = structuredClone(userState); return result; } catch (error) { row = snapshot; userState = userSnapshot; throw error; } } };
const stripe = {
  subscriptions: { retrieve: async () => ({ id: row.subscriptionId, customer: oldCustomer, status: oldStatus }), list: async () => ({ data: live, has_more: false }) },
  billingPortal: { sessions: { create: async () => { portals++; return { url: "https://billing.invalid" }; } } },
  customers: { create: async () => { throw new Error("Unexpected customer creation"); } },
  checkout: { sessions: { retrieve: async () => prior, create: async (params: any, options: any) => {
    assert.equal(row.checkoutAttempt, committedAttempt, "attempt must be committed before Stripe creation");
    if (row.checkoutKind === "paid_reactivation") {
      assert.equal(committedRow.status, "canceled"); assert.equal(committedRow.paidThrough, null); assert.equal(committedRow.paidInvoiceId, null);
      assert.equal(committedUser.tier, "free"); assert.equal(committedUser.subscriptionStatus, "canceled"); assert.equal(committedUser.currentPeriodEnd, null);
    }
    creates.push({ params, options });
    if (failCreate) throw new Error("Simulated lost response");
    return { id: "cs_paid", url: "https://checkout.invalid", expires_at: Date.now() / 1000 + 3600 };
  } } },
};
const imports: Record<string, unknown> = {
  "node:crypto": { randomUUID: () => `attempt_${++serial}` },
  "@/lib/db": { prisma }, "@/lib/stripe": { stripe: () => stripe, tierToPriceId: (tier: string) => `price_${tier}` },
  "@/lib/card-trial-policy": { CARD_TRIAL_DAYS: 3, CARD_TRIAL_POLICY: "test_policy", cardTrialEnrollmentAvailable: () => true },
};
const module = { exports: {} as any };
runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText,
  { module, exports: module.exports, Date, Error, process: { env: {} }, require: (name: string) => { if (!(name in imports)) throw new Error(`Unexpected import ${name}`); return imports[name]; } });
const create = module.exports.createCardTrialCheckout;
const user = { id: "u1", email: "offline@example.invalid", emailVerified: new Date(), stripeCustomerId: "cus_1", locale: "en" };
function reset() {
  row = { userId: "u1", tier: "pro", checkoutKind: "trial", status: "canceled", customerId: "cus_1", subscriptionId: "sub_old", checkoutAttempt: "attempt_old", checkoutAttemptStartedAt: new Date(), checkoutSessionId: "cs_old", trialStartedAt: new Date(1000), trialEndsAt: new Date(2000), cardVerifiedAt: new Date(1000) };
  userState = { tier: "free", subscriptionStatus: "canceled", currentPeriodEnd: null, stripeSubscriptionId: "sub_old", stripePriceId: null };
  committedUser = structuredClone(userState); committedRow = structuredClone(row);
  trialEvidence = [row.trialStartedAt, row.trialEndsAt, row.cardVerifiedAt].map(String);
  committedAttempt = row.checkoutAttempt; creates = []; portals = 0; oldStatus = "canceled"; oldCustomer = "cus_1"; live = []; failCreate = false;
  prior = { id: "cs_old", status: "complete", subscription: "sub_old" };
}
async function main() {
  reset(); await create(user, "pro_plus"); assert.equal(portals, 1); assert.equal(creates.length, 0);
  console.log("PASS canceled subscription requires explicit paid-reactivation opt-in");
  for (const status of ["active", "trialing", "past_due", "unpaid", "incomplete", "paused", "incomplete_expired"]) {
    reset(); oldStatus = status; await create(user, "pro_plus", true); assert.equal(portals, 1); assert.equal(creates.length, 0);
  }
  console.log("PASS every non-canceled old subscription stays in billing portal");
  reset(); oldCustomer = "cus_other"; await assert.rejects(create(user, "pro", true), /CUSTOMER_MISMATCH/); assert.equal(creates.length, 0);
  reset(); await create(user, "pro_plus", true);
  assert.equal(creates.length, 1); assert.equal(row.subscriptionId, "sub_old"); assert.equal(row.checkoutKind, "paid_reactivation");
  assert.deepEqual([row.trialStartedAt, row.trialEndsAt, row.cardVerifiedAt].map(String), trialEvidence);
  const paid = creates[0].params;
  assert.equal(paid.subscription_data.trial_period_days, undefined); assert.equal(paid.subscription_data.trial_end, undefined); assert.equal(paid.subscription_data.trial_settings, undefined);
  assert.equal(paid.metadata.checkoutKind, "paid_reactivation"); assert.equal(paid.subscription_data.metadata.checkoutKind, "paid_reactivation"); assert.equal(paid.metadata.attempt, row.checkoutAttempt);
  assert.equal(paid.line_items[0].price, "price_pro_plus");
  console.log("PASS paid attempt committed before network, preserves old sub/trial evidence, and creates no second trial");
  reset(); row.status = "active"; row.paidThrough = new Date(Date.now() + 86400_000); row.paidInvoiceId = "in_last"; row.firstPaidInvoiceId = "in_first";
  userState = { tier: "pro", subscriptionStatus: "active", currentPeriodEnd: row.paidThrough, stripeSubscriptionId: "sub_old", stripePriceId: "price_pro" };
  await create(user, "pro_plus", true);
  assert.equal(row.status, "canceled"); assert.equal(row.paidThrough, null); assert.equal(row.paidInvoiceId, null);
  assert.equal(userState.tier, "free"); assert.equal(userState.subscriptionStatus, "canceled"); assert.equal(userState.currentPeriodEnd, null); assert.equal(userState.stripePriceId, null);
  assert.equal(row.firstPaidInvoiceId, "in_first"); assert.equal(row.subscriptionId, "sub_old"); assert.equal(userState.stripeSubscriptionId, "sub_old");
  assert.deepEqual([row.trialStartedAt, row.trialEndsAt, row.cardVerifiedAt].map(String), trialEvidence);
  prior = { status: "open", url: "https://checkout.invalid/abandoned" }; await create(user, "pro_plus", true);
  assert.equal(row.status, "canceled"); assert.equal(row.paidThrough, null); assert.equal(userState.tier, "free"); assert.equal(creates.length, 1);
  console.log("PASS API-observed cancellation revokes stale paid access before abandoned replacement checkout, preserving first payment and trial evidence");
  reset(); failCreate = true; await assert.rejects(create(user, "pro_plus", true), /lost response/);
  const failedAttempt = row.checkoutAttempt;
  live = [{ id: "sub_new", status: "active", metadata: { userId: "u1", policy: "test_policy", attempt: failedAttempt, checkoutKind: "paid_reactivation", tier: "pro_plus" } }];
  failCreate = false; await create(user, "pro", true);
  assert.equal(row.checkoutAttempt, failedAttempt); assert.equal(creates[0].options.idempotencyKey, creates[1].options.idempotencyKey);
  assert.equal(creates[1].params.line_items[0].price, "price_pro_plus");
  console.log("PASS lost response retries keep durable paid key and fixed selected tier");
  prior = { status: "open", url: "https://checkout.invalid/resume" }; const count = creates.length;
  const resumed = await create(user, "pro", true); assert.equal(resumed.url, prior.url); assert.equal(resumed.tier, "pro_plus"); assert.equal(creates.length, count);
  live = []; prior = { status: "expired" }; await create(user, "pro", true); assert.equal(row.checkoutKind, "paid_reactivation"); assert.equal(row.tier, "pro_plus"); assert.equal(creates.at(-1).params.subscription_data.trial_period_days, undefined);
  console.log("PASS open session reused; expired paid session retries preserve mode and tier");
  reset(); live = [{ id: "sub_another", status: "active" }]; await create(user, "pro", true); assert.equal(portals, 1); assert.equal(creates.length, 0);
  console.log("PASS other live subscription blocks duplicate checkout");
  reset(); row.subscriptionId = null; row.checkoutSessionId = null; row.trialStartedAt = row.trialEndsAt = row.cardVerifiedAt = null;
  await create(user, "pro"); assert.equal(creates[0].params.subscription_data.trial_period_days, 3); assert.equal(creates[0].params.metadata.checkoutKind, "trial");
  console.log("PASS eligible first checkout keeps the original three-day trial");
  reset(); row.subscriptionId = null; row.checkoutSessionId = null; row.trialStartedAt = row.trialEndsAt = row.cardVerifiedAt = null;
  failCreate = true; await assert.rejects(create(user, "pro"), /lost response/);
  live = [{ id: "sub_new_trial", status: "trialing", metadata: { userId: "u1", policy: "test_policy", attempt: row.checkoutAttempt, checkoutKind: "trial", tier: "pro" } }];
  failCreate = false; await create(user, "pro_plus");
  assert.equal(creates[0].options.idempotencyKey, creates[1].options.idempotencyKey);
  assert.equal(creates[1].params.line_items[0].price, "price_pro");
  console.log("PASS completed first-trial checkout after lost response recovers same session key");
  reset(); row.checkoutKind = "paid_reactivation"; await create(user, "pro_plus", true); assert.equal(creates.length, 1); assert.equal(creates[0].params.subscription_data.trial_period_days, undefined);
  console.log("PASS canceled paid subscriber can reactivate again without another trial");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
