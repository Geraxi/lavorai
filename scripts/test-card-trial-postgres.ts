/** Real PostgreSQL integration test. Does not read DATABASE_URL or .env files.
 * Isolated prerequisites (outside app node_modules):
 * npm install --prefix /tmp/card-trial-db embedded-postgres@18.4.0-beta.17 pg
 * CARD_TRIAL_DB_DEPS=/tmp/card-trial-db node --import tsx scripts/test-card-trial-postgres.ts
 * Starts a disposable localhost-only cluster and removes its data on exit.
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import ts from 'typescript';
import { runInNewContext } from 'node:vm';
import { createPreviewStore, runCardTrialPreview } from '../src/lib/card-trial-preview';

const root = path.resolve(__dirname, '..');
const depRoot = process.env.CARD_TRIAL_DB_DEPS ?? '/tmp/card-trial-db';
const dependencyRequire = createRequire(path.join(depRoot, 'package.json'));
const { Client } = dependencyRequire('pg');
let passed = 0;
const pass = (name: string) => { passed++; console.log(`PASS ${name}`); };
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Extract tagged SQL directly from application source rather than maintaining copies.
function queries(file: string) {
  const source = ts.createSourceFile(file, readFileSync(path.join(root, file), 'utf8'), ts.ScriptTarget.Latest, true);
  const result: string[] = [];
  function visit(node: ts.Node) {
    if (ts.isTaggedTemplateExpression(node)) {
      const template = node.template;
      if (ts.isNoSubstitutionTemplateLiteral(template)) result.push(template.text);
      else result.push(template.head.text + template.templateSpans.map((span, index) => `$${index + 1}${span.literal.text}`).join(''));
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return result;
}
const checkoutSQL = queries('src/lib/card-trial-checkout.ts');
const webhookSQL = queries('src/lib/card-trial-webhook.ts');
const cohortSQL = queries('src/lib/card-trial-cohort.ts');
function statement(list: string[], start: string, contains?: string) {
  const sql = list.find(sql => sql.trim().startsWith(start) && (!contains || sql.includes(contains)));
  assert.ok(sql, `Actual application SQL missing: ${start} ${contains ?? ''}`);
  return sql;
}
function adapter(client: any) {
  const query = (parts: TemplateStringsArray, values: unknown[]) => client.query(parts.reduce((sql, part, i) => sql + (i ? `$${i}` : '') + part, ''), values);
  return {
    $queryRaw: async (parts: TemplateStringsArray, ...values: unknown[]) => (await query(parts, values)).rows,
    $executeRaw: async (parts: TemplateStringsArray, ...values: unknown[]) => (await query(parts, values)).rowCount,
  } as any;
}
async function main() {
  const { default: EmbeddedPostgres } = await import(pathToFileURL(dependencyRequire.resolve('embedded-postgres')).href);
  const base = mkdtempSync(path.join(tmpdir(), 'card-trial-postgres-'));
  const port = Number(process.env.CARD_TRIAL_DB_PORT ?? 55439);
  assert.ok(port >= 1024 && port <= 65535);
  const cluster = new EmbeddedPostgres({ databaseDir: path.join(base, 'data'), port, persistent: false,
    postgresFlags: ['-h', '127.0.0.1', '-c', 'unix_socket_directories='], onLog() {}, onError() {} });
  const clients: any[] = [];
  let started = false;
  try {
    await cluster.initialise();
    await cluster.start(); started = true;
    async function connect() {
      const client = new Client({ host: '127.0.0.1', port, user: 'postgres', password: 'password', database: 'postgres', statement_timeout: 5000 });
      await client.connect(); clients.push(client); return client;
    }
    const admin = await connect();
    console.log((await admin.query('SELECT version()')).rows[0].version);
    await admin.query('CREATE TABLE "User" ("id" text PRIMARY KEY)');
    await admin.query(readFileSync(path.join(root, 'docs/card-trial-schema.sql'), 'utf8'));
    await admin.query(readFileSync(path.join(root, 'docs/card-trial-preview-schema.sql'), 'utf8'));
    pass('both actual SQL files apply to an empty PostgreSQL database with minimal User(id)');
    const a = await connect(), b = await connect();
    const storeA = createPreviewStore(adapter(a)), storeB = createPreviewStore(adapter(b));
    await admin.query(`INSERT INTO "User" ("id") VALUES ('preview'), ('retry'), ('checkout'), ('webhook'), ('replay'), ('unknown'), ('lost-ack')`);
    const insertCutoff = statement(cohortSQL, 'INSERT INTO "CardTrialRollout"');
    const readCutoff = statement(cohortSQL, 'SELECT "startsAt" FROM "CardTrialRollout"');
    const originalCutoff = new Date('2026-10-12T00:00:00Z');
    await admin.query(insertCutoff, [originalCutoff]);
    await admin.query(insertCutoff, [new Date('2027-01-01T00:00:00Z')]);
    assert.equal((await admin.query(readCutoff)).rows[0].startsAt.toISOString(), originalCutoff.toISOString());
    await assert.rejects(() => admin.query(`INSERT INTO "CardTrialRollout" (id,"startsAt") VALUES (FALSE,now())`), (e:any) => e.code === '23514');
    pass('rollout singleton persists the first cutoff despite later configuration, and rejects a second ID');
    const wins = await Promise.all([storeA.reserve('preview', 'job-a', 'lease-a'), storeB.reserve('preview', 'job-b', 'lease-b')]);
    assert.equal(wins.filter(Boolean).length, 1);
    assert.equal((await admin.query('SELECT count(*)::int AS n FROM "CardTrialPreview" WHERE "userId"=$1', ['preview'])).rows[0].n, 1);
    pass('two independent connections race for one preview reservation; exactly one wins');
    await admin.query(`UPDATE "CardTrialPreview" SET "leaseExpiresAt"=now()-interval '1 hour' WHERE "userId"='preview'`);
    assert.equal(await storeB.reserve('preview', 'job-a', 'lease-c'), false);
    assert.equal(await storeB.reserve('preview', 'job-b', 'lease-d'), false);
    pass('expired reservation cannot be reclaimed for either the same or another job');
    assert.equal(await storeA.reserve('retry', 'fixed-job', 'retry-1'), true);
    assert.equal(await storeB.fail('retry', 'wrong-lease'), false);
    assert.equal(await storeA.fail('retry', 'retry-1'), true);
    assert.equal(await storeB.reserve('retry', 'other-job', 'other'), false);
    for (const n of [2, 3]) {
      assert.equal(await storeB.reserve('retry', 'fixed-job', `retry-${n}`), true);
      assert.equal(await storeA.fail('retry', `retry-${n}`), true);
    }
    assert.equal(await storeB.reserve('retry', 'fixed-job', 'retry-4'), false);
    assert.equal((await admin.query(`SELECT attempts FROM "CardTrialPreview" WHERE "userId"='retry'`)).rows[0].attempts, 3);
    pass('definite failure retries are job-locked, lease-guarded, and capped at three reservations');
    let generations = 0;
    const fixture = { ok: true, target: { jobId:'job-replay', title:'Test role', company:null, location:null, matchedJob:true }, coverLetter:'Original test-only letter', optimizedCV:{ fullName:'Test fixture' }, atsScore:80, suggestions:[] } as any;
    const generate = async () => { generations++; return fixture; };
    const first = await runCardTrialPreview({ userId:'replay', jobId:'job-replay', store:storeA, generate });
    const second = await runCardTrialPreview({ userId:'replay', jobId:'job-replay', store:storeB, generate });
    assert.deepEqual(first, second); assert.equal(generations, 1);
    assert.equal(await storeB.succeed('replay', 'wrong-lease', fixture), false);
    await assert.rejects(() => runCardTrialPreview({ userId:'replay', jobId:'other', store:storeB, generate }), /preview_job_locked/);
    pass('actual preview orchestration replays persisted JSONB without a second generation');
    await assert.rejects(() => runCardTrialPreview({ userId:'unknown', jobId:'job', store:storeA, generate:async () => { throw new Error('Simulated unknown provider outcome'); } }), /preview_reconciliation_required/);
    assert.equal((await storeA.read('unknown'))?.state, 'reserved');
    assert.equal(await storeB.reserve('unknown', 'job', 'new-lease'), false);
    pass('unknown provider outcome stays reserved and cannot cause a fresh paid generation');
    const uncertainStore = { ...storeA, succeed:async (...args: Parameters<typeof storeA.succeed>) => { await storeA.succeed(...args); throw new Error('Simulated lost DB acknowledgment'); } };
    await assert.rejects(() => runCardTrialPreview({ userId:'lost-ack', jobId:'job-replay', store:uncertainStore, generate }), /preview_reconciliation_required/);
    const beforeReplay = generations;
    assert.deepEqual(await runCardTrialPreview({ userId:'lost-ack', jobId:'job-replay', store:storeB, generate }), fixture);
    assert.equal(generations, beforeReplay);
    pass('committed output survives lost database acknowledgment and replays without regeneration');
    await assert.rejects(() => admin.query(`UPDATE "CardTrialPreview" SET result=NULL WHERE "userId"='replay'`), (e:any) => e.code === '23514');
    await assert.rejects(() => admin.query(`UPDATE "CardTrialPreview" SET attempts=4 WHERE "userId"='retry'`), (e:any) => e.code === '23514');
    await assert.rejects(() => storeA.reserve('missing-user', 'job', 'lease'), (e:any) => e.code === '23503');
    pass('schema enforces successful-output consistency, attempt limits, and user foreign key');

    const insertEnrollment = statement(checkoutSQL, 'INSERT INTO "CardTrialEnrollment"');
    const lockEnrollment = statement(checkoutSQL, 'SELECT * FROM "CardTrialEnrollment"', 'FOR UPDATE');
    const updateCheckout = statement(checkoutSQL, 'UPDATE "CardTrialEnrollment" SET "customerId"');
    await Promise.all([a.query(insertEnrollment, ['checkout','pro','attempt-a']), b.query(insertEnrollment, ['checkout','pro_plus','attempt-b'])]);
    await a.query('BEGIN');
    const locked = (await a.query(lockEnrollment, ['checkout'])).rows[0];
    await b.query('BEGIN');
    let secondLockAcquired = false;
    const nextLock = b.query(lockEnrollment, ['checkout']).then((result:any) => { secondLockAcquired=true; return result; });
    await wait(150); assert.equal(secondLockAcquired, false);
    const lockState = await admin.query('SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1', [b.processID]);
    assert.equal(lockState.rows[0].wait_event_type, 'Lock');
    await a.query(updateCheckout, ['cus-fixture', 'cs-fixture', 'https://example.invalid/checkout', new Date(Date.now()+3600000), 'checkout']);
    await a.query('COMMIT');
    const observed = (await nextLock).rows[0]; await b.query('COMMIT');
    assert.equal(observed.checkoutSessionId, 'cs-fixture'); assert.equal(observed.checkoutAttempt, locked.checkoutAttempt);
    pass('actual checkout FOR UPDATE serializes separate transactions and exposes the committed reusable session');

    const rotatePaid = statement(checkoutSQL, 'UPDATE "CardTrialEnrollment" SET "checkoutAttempt"', "\"checkoutKind\"='paid_reactivation'");
    await admin.query(`UPDATE "CardTrialEnrollment" SET "subscriptionId"='sub-old', "trialStartedAt"='2026-01-01T00:00:00Z', "trialEndsAt"='2026-01-04T00:00:00Z', "firstPaidInvoiceId"='in-original', "paidThrough"=now()+interval '1 month', "paidInvoiceId"='in-stale', "cancelAtPeriodEnd"=true WHERE "userId"='checkout'`);
    await a.query(rotatePaid,['paid-attempt','pro_plus','checkout']);
    const rotated=(await admin.query(lockEnrollment,['checkout'])).rows[0];
    assert.equal(rotated.checkoutKind,'paid_reactivation');assert.equal(rotated.status,'canceled');assert.equal(rotated.paidThrough,null);assert.equal(rotated.paidInvoiceId,null);assert.equal(rotated.cancelAtPeriodEnd,false);
    assert.equal(rotated.subscriptionId,'sub-old');assert.equal(rotated.firstPaidInvoiceId,'in-original');assert.equal(rotated.trialStartedAt.toISOString(),'2026-01-01T00:00:00.000Z');assert.equal(rotated.trialEndsAt.toISOString(),'2026-01-04T00:00:00.000Z');
    pass('paid-reactivation rotation clears stale paid enrollment access while retaining original trial and payment evidence');
    await admin.query(insertEnrollment, ['webhook','pro','webhook-attempt']);
    const webhookLock = statement(webhookSQL, 'SELECT * FROM "CardTrialEnrollment"', 'FOR UPDATE');
    const seenSQL = statement(webhookSQL, 'SELECT "eventId" FROM "CardTrialWebhookEvent"');
    const eventInsert = statement(webhookSQL.filter(sql => !sql.includes('ON CONFLICT')), 'INSERT INTO "CardTrialWebhookEvent"');
    const updateWebhook = statement(webhookSQL, 'UPDATE "CardTrialEnrollment"');
    const snapshotValues = ['sub-fixture','pro','trialing',new Date(),new Date(Date.now()+3*86400000),new Date(),null,null,null,false,'webhook'];
    await a.query('BEGIN'); await a.query(webhookLock, ['webhook']);
    await a.query(updateWebhook, snapshotValues); await a.query(eventInsert, ['evt-rollback','webhook']);
    await a.query('ROLLBACK');
    assert.equal((await admin.query(seenSQL, ['evt-rollback'])).rows.length, 0);
    assert.equal((await admin.query(webhookLock, ['webhook'])).rows[0].status, 'pending');
    pass('webhook rollback removes both enrollment state update and event-dedupe marker');
    let applied = 0;
    const processEvent = async (client:any) => {
      await client.query('BEGIN');
      try {
        await client.query(webhookLock, ['webhook']);
        if (!(await client.query(seenSQL, ['evt-rollback'])).rows.length) {
          applied++;
          await client.query(updateWebhook, snapshotValues);
          await client.query(eventInsert, ['evt-rollback','webhook']);
        }
        await client.query('COMMIT');
      } catch (error) { await client.query('ROLLBACK'); throw error; }
    };
    await Promise.all([processEvent(a),processEvent(b)]);
    assert.equal(applied,1); assert.equal((await admin.query(seenSQL,['evt-rollback'])).rows.length,1);
    assert.equal((await admin.query(webhookLock,['webhook'])).rows[0].status,'trialing');
    pass('rolled-back webhook can retry; concurrent duplicate delivery applies once under the row lock');
    // Real transactional SQL with a narrow PostgreSQL-backed Prisma model shim.
    // The helper source is evaluated with an allowlist; all Stripe calls are in-memory fixtures.
    await admin.query(`ALTER TABLE "User" ADD COLUMN "referredById" text, ADD COLUMN "referralRewardedAt" timestamptz,
      ADD COLUMN "referralCredits" integer NOT NULL DEFAULT 0, ADD COLUMN "stripeCustomerId" text,
      ADD COLUMN "stripeSubscriptionId" text, ADD COLUMN "subscriptionStatus" text;
      CREATE TABLE "ReferralTestEvent" ("userId" text REFERENCES "User"(id), action text, reason text);
      INSERT INTO "User" (id) VALUES ('referrer-local'),('referrer-stripe'),('referrer-changed');
      INSERT INTO "User" (id,"referredById") VALUES ('referred-race','referrer-local'),('referred-rollback','referrer-local'),('referred-stripe','referrer-stripe');
      UPDATE "User" SET "stripeCustomerId"='cus-original', "stripeSubscriptionId"='sub-original', "subscriptionStatus"='active' WHERE id='referrer-stripe'`);
    await assert.rejects(()=>admin.query(`INSERT INTO "CardTrialReferralReward" ("referredUserId","referrerId",mode,"customerId","amountCents",currency) VALUES ('referred-race','referrer-local','stripe','cus-fixture',NULL,'eur')`),(e:any)=>e.code==='23514');
    pass('referral schema rejects Stripe intent with a missing frozen amount');
    let failEvent = false;
    function referralHelper(client:any, provider:any) {
      const db = { $transaction:async (body:any) => {
        await client.query('BEGIN');
        try {
          const tx = { ...adapter(client), user:{
            findUnique:async ({where}:any) => (await client.query('SELECT * FROM "User" WHERE id=$1',[where.id])).rows[0] ?? null,
            update:async ({where,data}:any) => {
              if (data.referralCredits) return (await client.query('UPDATE "User" SET "referralCredits"="referralCredits"+$1 WHERE id=$2 RETURNING *',[data.referralCredits.increment,where.id])).rows[0];
              return (await client.query('UPDATE "User" SET "referralRewardedAt"=$1 WHERE id=$2 RETURNING *',[data.referralRewardedAt,where.id])).rows[0];
            },
          }, subscriptionEvent:{ create:async ({data}:any) => {
            if(failEvent) throw new Error('Injected event persistence failure');
            await client.query('INSERT INTO "ReferralTestEvent" ("userId",action,reason) VALUES ($1,$2,$3)',[data.userId,data.action,data.reason]);
          } } };
          const result = await body(tx); await client.query('COMMIT'); return result;
        } catch(error) { await client.query('ROLLBACK'); throw error; }
      } };
      const module = { exports:{} as Record<string,any> };
      const source = ts.transpileModule(readFileSync(path.join(root,'src/lib/card-trial-referral.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
      const imports:Record<string,any> = {'@/lib/db':{prisma:db},'@/lib/stripe':{stripe:()=>provider}};
      runInNewContext(source,{module,exports:module.exports,Date,Math,Number,Boolean,String,Error,console,require(name:string){assert.ok(name in imports,`Unexpected dependency ${name}`);return imports[name];}});
      return module.exports.rewardCardTrialReferralIfDue;
    }
    const unusedProvider = {subscriptions:{retrieve:async()=>{throw new Error('Unexpected Stripe access');}}};
    const rewardA=referralHelper(a,unusedProvider), rewardB=referralHelper(b,unusedProvider);
    const results=await Promise.all([rewardA('referred-race'),rewardB('referred-race')]);
    assert.deepEqual(results.sort(),['already','rewarded']);
    assert.equal((await admin.query(`SELECT "referralCredits" FROM "User" WHERE id='referrer-local'`)).rows[0].referralCredits,1);
    assert.equal((await admin.query(`SELECT count(*)::int AS n FROM "ReferralTestEvent"`)).rows[0].n,1);
    pass('actual referral helper serializes concurrent local rewards with one credit, marker, and event');
    failEvent=true;
    await assert.rejects(()=>rewardA('referred-rollback'),/Injected event persistence failure/);
    assert.equal((await admin.query(`SELECT "referralCredits" FROM "User" WHERE id='referrer-local'`)).rows[0].referralCredits,1);
    assert.equal((await admin.query(`SELECT "referralRewardedAt" FROM "User" WHERE id='referred-rollback'`)).rows[0].referralRewardedAt,null);
    assert.equal((await admin.query(`SELECT count(*)::int AS n FROM "CardTrialReferralReward" WHERE "referredUserId"='referred-rollback'`)).rows[0].n,0);
    failEvent=false; assert.equal(await rewardA('referred-rollback'),'rewarded');
    assert.equal((await admin.query(`SELECT "referralCredits" FROM "User" WHERE id='referrer-local'`)).rows[0].referralCredits,2);
    pass('local referral event failure atomically rolls back credit and both markers; retry rewards once');
    let retrieveCalls=0, mutationCalls=0;
    const mutations:any[]=[];
    const provider={subscriptions:{retrieve:async()=>{retrieveCalls++;return {customer:'cus-original',items:{data:[{price:{unit_amount:2900,currency:'eur'}}]}};}},customers:{createBalanceTransaction:async(customer:string,data:any,options:any)=>{
      mutationCalls++; mutations.push({customer,...data,key:options.idempotencyKey});
      // Separate connection sees the frozen intent before the mocked external mutation.
      assert.equal((await admin.query(`SELECT "amountCents" FROM "CardTrialReferralReward" WHERE "referredUserId"='referred-stripe'`)).rows[0].amountCents,2900);
      if(mutationCalls===1) throw new Error('Simulated provider timeout after unknown outcome');
      return {id:'cbtxn-fixture',customer,amount:data.amount,currency:data.currency};
    }}};
    const rewardStripeA=referralHelper(a,provider), rewardStripeB=referralHelper(b,provider);
    await assert.rejects(()=>rewardStripeA('referred-stripe'),/Simulated provider timeout/);
    await admin.query(`UPDATE "User" SET "subscriptionStatus"='canceled',"stripeCustomerId"='cus-changed' WHERE id='referrer-stripe';
      UPDATE "User" SET "referredById"='referrer-changed' WHERE id='referred-stripe'`);
    assert.equal(await rewardStripeB('referred-stripe'),'rewarded');
    assert.equal(retrieveCalls,1);assert.equal(mutations.length,2);assert.deepEqual(mutations[0],mutations[1]);
    assert.equal(mutations[1].customer,'cus-original');assert.equal(mutations[1].amount,-2900);assert.equal(mutations[1].key,'referral-credit:referred-stripe');
    assert.equal((await admin.query(`SELECT sum("referralCredits")::int AS n FROM "User" WHERE id IN ('referrer-stripe','referrer-changed')`)).rows[0].n,0);
    const completedIntent=(await admin.query(`SELECT * FROM "CardTrialReferralReward" WHERE "referredUserId"='referred-stripe'`)).rows[0];
    assert.equal(completedIntent.referrerId,'referrer-stripe');assert.equal(completedIntent.stripeTransactionId,'cbtxn-fixture');assert.ok(completedIntent.completedAt);
    assert.equal(await rewardStripeA('referred-stripe'),'already');assert.equal(mutationCalls,2);
    pass('frozen referral intent survives unknown Stripe outcome and referrer changes without local fallback or altered retry parameters');
    console.log(`PASS ${passed} real PostgreSQL integration scenarios. No Stripe or AI calls. Checkout/webhook SQL and referral helper with a PostgreSQL-backed model shim are tested; real Prisma/Neon and Stripe remain unverified.`);
  } finally {
    await Promise.all(clients.map(client => client.end()));
    if (started) await cluster.stop();
  }
}
main().catch(error => { console.error(error); process.exitCode=1; });
