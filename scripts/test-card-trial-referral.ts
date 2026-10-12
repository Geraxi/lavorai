/** Offline fault tests of actual new-cohort referral source. The VM allowlists
 * mocks only; transaction rollback/serialization and provider idempotency are
 * simulated. No real database, Stripe, email, network, or integration is used.
 * Run: node --import tsx scripts/test-card-trial-referral.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";

function sourceModule(imports: Record<string, unknown>) {
  const path = "src/lib/card-trial-referral.ts";
  const source = readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
  const module = { exports: {} as Record<string, any> };
  runInNewContext(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText, {
    module, exports: module.exports, Date, Math, Number, Boolean, String, Error,
    require(name: string) {
      if (!Object.prototype.hasOwnProperty.call(imports, name)) throw new Error(`Unexpected dependency: ${name}`);
      return imports[name];
    },
  }, { filename: path });
  return module.exports;
}

type State = { referred: any; referrer: any; intent: any; credits: number; events: any[] };
function harness() {
  let state: State = {
    referred: { id: "referred-user", referredById: "legacy-referrer", referralRewardedAt: null },
    referrer: { id: "legacy-referrer", stripeCustomerId: "cus_old", stripeSubscriptionId: "sub_old", subscriptionStatus: "active" },
    intent: null, credits: 0, events: [],
  };
  let tail: Promise<unknown> = Promise.resolve();
  let txNumber = 0;
  const faults = { tx: 0, lostAck: false, loseStripeResponse: false, failStripe: false, failRead: false, invalidResult: false, failEvent: false };
  const price = { unit_amount: 4900, currency: "eur" };
  const requests: any[] = [];
  const provider = new Map<string, any>();
  let subscriptionReads = 0;
  const prisma = { $transaction: async (fn: any) => {
    const run = tail.then(async () => {
      const currentTx = ++txNumber;
      const draft: State = structuredClone(state);
      const tx = {
        $queryRaw: async (parts: TemplateStringsArray, ...values: any[]) => {
          const sql = parts.join("");
          assert.match(sql, /FOR UPDATE/);
          assert.equal(values[0], "referred-user");
          if (sql.includes('FROM "User"')) return draft.referred ? [draft.referred] : [];
          if (sql.includes('FROM "CardTrialReferralReward"')) return draft.intent ? [draft.intent] : [];
          throw new Error(`Unexpected SQL read: ${sql}`);
        },
        $executeRaw: async (parts: TemplateStringsArray, ...v: any[]) => {
          const sql = parts.join("");
          if (sql.includes('INSERT INTO "CardTrialReferralReward"')) {
            assert.equal(draft.intent, null);
            draft.intent = { referredUserId: v[0], referrerId: v[1], mode: v[2], customerId: v[3], amountCents: v[4], currency: v[5], firstAttemptAt: v[6], stripeTransactionId: null, completedAt: null };
          } else if (sql.includes('UPDATE "CardTrialReferralReward"')) {
            assert.equal(v.at(-1), "referred-user");
            assert.ok(draft.intent);
            draft.intent.completedAt = new Date();
            if (sql.includes('"stripeTransactionId"=')) draft.intent.stripeTransactionId = v[0];
          } else throw new Error(`Unexpected SQL write: ${sql}`);
          return 1;
        },
        user: {
          findUnique: async ({ where }: any) => {
            assert.equal(where.id, "legacy-referrer"); return draft.referrer;
          },
          update: async ({ where, data }: any) => {
            if (data.referralCredits) {
              assert.equal(where.id, "legacy-referrer"); assert.equal(data.referralCredits.increment, 1); draft.credits++;
            } else {
              assert.equal(where.id, "referred-user"); assert.ok(data.referralRewardedAt instanceof Date);
              draft.referred.referralRewardedAt = data.referralRewardedAt;
            }
            return { id: where.id };
          },
        },
        subscriptionEvent: { create: async ({ data }: any) => {
          if (faults.failEvent) throw new Error("offline event failure");
          assert.equal(data.userId, "legacy-referrer"); assert.equal(data.action, "referral_reward"); draft.events.push(data); return data;
        } },
      };
      const result = await fn(tx);
      if (faults.tx === currentTx && !faults.lostAck) throw new Error("offline transaction rollback");
      state = draft;
      if (faults.tx === currentTx && faults.lostAck) throw new Error("offline commit acknowledgement lost");
      return result;
    });
    tail = run.catch(() => undefined);
    return run;
  } };
  const stripe = {
    subscriptions: { retrieve: async (id: string) => {
      subscriptionReads++; assert.equal(id, "sub_old");
      if (faults.failRead) throw new Error("offline provider read failure");
      return { customer: "cus_old", items: { data: [{ price: { ...price } }] } };
    } },
    customers: { createBalanceTransaction: async (customer: string, data: any, options: any) => {
      // Any provider mutation requires a previously committed intent.
      assert.ok(state.intent?.firstAttemptAt);
      assert.equal(customer, state.intent.customerId);
      assert.equal(data.amount, -state.intent.amountCents);
      assert.equal(data.currency, state.intent.currency);
      assert.equal(options.idempotencyKey, "referral-credit:referred-user");
      const request = JSON.parse(JSON.stringify({ customer, data, options }));
      requests.push(request);
      if (faults.failStripe) throw new Error("offline provider unavailable");
      const existing = provider.get(options.idempotencyKey);
      if (existing) assert.deepEqual(request, existing.request);
      else provider.set(options.idempotencyKey, { request, result: { id: "cbtxn_one", customer, amount: data.amount, currency: data.currency } });
      if (faults.loseStripeResponse) { faults.loseStripeResponse = false; throw new Error("offline response lost after credit"); }
      return faults.invalidResult ? { id: "cbtxn_bad", customer: "cus_wrong", amount: 1, currency: "usd" } : provider.get(options.idempotencyKey).result;
    } },
  };
  const reward = sourceModule({ "@/lib/db": { prisma }, "@/lib/stripe": { stripe: () => stripe } }).rewardCardTrialReferralIfDue;
  return { reward: () => reward("referred-user"), state: () => state, faults, price, requests, provider, reads: () => subscriptionReads };
}
let groups = 0;
async function check(name: string, body: () => Promise<void>) { await body(); groups++; console.log(`PASS ${name}`); }
function completed(h: ReturnType<typeof harness>, mode: string) {
  assert.ok(h.state().referred.referralRewardedAt);
  assert.ok(h.state().intent.completedAt);
  assert.equal(h.state().events.length, 1);
  assert.equal(h.state().events[0].reason, mode === "stripe" ? "renewal_credit" : "checkout_credit");
  assert.equal(h.state().credits, mode === "stripe" ? 0 : 1);
  assert.equal(h.provider.size, mode === "stripe" ? 1 : 0);
}
async function main() {
  await check("absent referrer and existing legacy reward marker cause no new intent or credit", async () => {
    for (const kind of ["no_referrer", "already"]) {
      const h = harness();
      if (kind === "already") h.state().referred.referralRewardedAt = new Date();
      else h.state().referred.referredById = null;
      assert.equal(await h.reward(), kind); assert.equal(h.state().intent, null);
      assert.equal(h.requests.length, 0); assert.equal(h.state().credits, 0);
    }
  });
  await check("legacy active referrer gets one frozen one-month credit; concurrent dispatch awards only once", async () => {
    const h = harness();
    const results = await Promise.all([h.reward(), h.reward()]);
    assert.deepEqual(results.sort(), ["already", "rewarded"]);
    completed(h, "stripe"); assert.equal(h.reads(), 1);
    assert.equal(h.requests[0].data.amount, -4900);
    assert.equal(h.requests[0].data.currency, "eur");
    assert.equal(h.state().intent.stripeTransactionId, "cbtxn_one");
  });
  await check("non-paid referrer gets exactly one atomic checkout credit under concurrent dispatch", async () => {
    for (const status of ["trialing", "past_due", "unpaid", "canceled", "free"]) {
      const h = harness(); h.state().referrer.subscriptionStatus = status;
      assert.deepEqual((await Promise.all([h.reward(), h.reward()])).sort(), ["already", "rewarded"]);
      completed(h, "checkout"); assert.equal(h.requests.length, 0);
    }
  });
  await check("failed prepare and lost prepare acknowledgement never mutate Stripe before confirmed commit", async () => {
    for (const lostAck of [false, true]) {
      const h = harness(); h.faults.tx = 1; h.faults.lostAck = lostAck;
      await assert.rejects(h.reward(), /offline/); assert.equal(h.requests.length, 0);
      assert.equal(Boolean(h.state().intent), lostAck);
      assert.equal(await h.reward(), "rewarded"); completed(h, "stripe");
    }
  });
  await check("provider read failure leaves no intent, marker, or local fallback", async () => {
    const h = harness(); h.faults.failRead = true;
    await assert.rejects(h.reward(), /provider read/);
    assert.equal(h.state().intent, null); assert.equal(h.state().referred.referralRewardedAt, null);
    assert.equal(h.state().credits, 0); assert.equal(h.requests.length, 0);
    h.faults.failRead = false; await h.reward(); completed(h, "stripe");
  });
  await check("unknown Stripe outcomes remain pending and retry fixed params despite account/price changes", async () => {
    for (const lostResponse of [false, true]) {
      const h = harness(); h.faults.loseStripeResponse = lostResponse; h.faults.failStripe = !lostResponse;
      await assert.rejects(h.reward(), /offline/);
      assert.equal(h.state().intent.completedAt, null); assert.equal(h.state().referred.referralRewardedAt, null);
      assert.equal(h.state().credits, 0); assert.equal(h.state().events.length, 0);
      h.state().referrer.stripeCustomerId = "cus_changed";
      h.state().referrer.subscriptionStatus = "canceled";
      h.price.unit_amount = 9999; h.price.currency = "usd";
      h.faults.failStripe = false;
      assert.equal(await h.reward(), "rewarded"); completed(h, "stripe");
      assert.equal(h.reads(), 1); assert.deepEqual(h.requests[0], h.requests[1]);
    }
  });
  await check("completion rollback reuses provider result; lost commit acknowledgement does not redispatch", async () => {
    for (const lostAck of [false, true]) {
      const h = harness(); h.faults.tx = 2; h.faults.lostAck = lostAck;
      await assert.rejects(h.reward(), /offline/);
      assert.equal(h.provider.size, 1); assert.equal(h.state().credits, 0);
      assert.equal(Boolean(h.state().intent.completedAt), lostAck);
      assert.equal(Boolean(h.state().referred.referralRewardedAt), lostAck);
      assert.equal(h.state().events.length, lostAck ? 1 : 0);
      assert.equal(await h.reward(), lostAck ? "already" : "rewarded");
      completed(h, "stripe"); assert.equal(h.requests.length, lostAck ? 1 : 2);
    }
  });
  await check("local event or commit failure rolls back credit, ledger and referred marker together", async () => {
    for (const eventFailure of [false, true]) {
      const h = harness(); h.state().referrer.subscriptionStatus = "canceled";
      if (eventFailure) h.faults.failEvent = true; else h.faults.tx = 1;
      await assert.rejects(h.reward(), /offline/);
      assert.equal(h.state().credits, 0); assert.equal(h.state().intent, null);
      assert.equal(h.state().referred.referralRewardedAt, null); assert.equal(h.state().events.length, 0);
      h.faults.failEvent = false; await h.reward(); completed(h, "checkout");
    }
  });
  await check("mismatched provider result remains pending without marking or fallback", async () => {
    const h = harness(); h.faults.invalidResult = true;
    await assert.rejects(h.reward(), /RESULT_REQUIRES_RECONCILIATION/);
    assert.equal(h.state().intent.completedAt, null); assert.equal(h.state().referred.referralRewardedAt, null);
    assert.equal(h.state().credits, 0); assert.equal(h.state().events.length, 0);
    h.faults.invalidResult = false; await h.reward(); completed(h, "stripe");
  });
  await check("23-hour retry fence, absent timestamp and future timestamp require reconciliation without mutation", async () => {
    for (const age of [23 * 3600_000, 24 * 3600_000, -3600_000, null]) {
      const h = harness(); h.faults.loseStripeResponse = true;
      await assert.rejects(h.reward(), /response lost/);
      h.state().intent.firstAttemptAt = age === null ? null : new Date(Date.now() - age);
      await assert.rejects(h.reward(), /REQUIRES_RECONCILIATION/);
      assert.equal(h.requests.length, 1); assert.equal(h.provider.size, 1);
      assert.equal(h.state().credits, 0); assert.equal(h.state().intent.completedAt, null);
    }
    const h = harness(); h.faults.loseStripeResponse = true;
    await assert.rejects(h.reward(), /response lost/);
    h.state().intent.firstAttemptAt = new Date(Date.now() - 22 * 3600_000);
    await h.reward(); completed(h, "stripe");
  });
  console.log(`PASS: ${groups} offline new-cohort referral fault groups. No live services or integration guarantees.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
