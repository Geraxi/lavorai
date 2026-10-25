import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import ts from "typescript";

function loadPlain(path: string) {
  const source = readFileSync(path, "utf8");
  const exports: Record<string, unknown> = {};
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  new Function("require", "exports", js)((name: string) => {
    throw new Error(`Unexpected import ${name} from ${path}`);
  }, exports);
  return exports as any;
}

function load(path: string, extra: Record<string, unknown> = {}) {
  const source = readFileSync(path, "utf8");
  const exports: Record<string, unknown> = {};
  const mocks: Record<string, unknown> = {
    "@/lib/application-pause": { applicationsPaused: () => process.env.APPLICATIONS_PAUSED === "true" },
    "@/lib/db": { prisma: extra.prisma ?? { emailLog: {} } },
    "@/lib/resend-keys": extra.resendKeys ?? loadPlain("src/lib/resend-keys.ts"),
    ...extra,
  };
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  new Function("require", "exports", js)((name: string) => {
    if (!(name in mocks)) throw new Error(`Unexpected import ${name} from ${path}`);
    return mocks[name];
  }, exports);
  return exports as any;
}

type Row = {
  id: string;
  kind: string;
  to: string;
  createdAt: Date;
  outcome: string | null;
  providerEmailId: string | null;
  errorName: string | null;
  errorCode: string | null;
};

function memoryDb(seed: Row[] = []) {
  const rows = seed.map((r) => ({ ...r }));
  let n = 0;
  return {
    rows,
    emailLog: {
      count: async ({ where }: any) => rows.filter((r) => match(r, where)).length,
      findMany: async ({ where, orderBy, take, select }: any) => {
        let out = rows.filter((r) => match(r, where));
        if (orderBy?.createdAt === "desc") out = out.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        if (typeof take === "number") out = out.slice(0, take);
        return out.map((r) => project(r, select));
      },
      create: async ({ data }: any) => {
        const row: Row = {
          id: data.id ?? `log-${++n}`,
          kind: data.kind,
          to: data.to,
          createdAt: data.createdAt ?? new Date(),
          outcome: data.outcome ?? null,
          providerEmailId: data.providerEmailId ?? null,
          errorName: data.errorName ?? null,
          errorCode: data.errorCode ?? null,
        };
        rows.push(row);
        return { ...row };
      },
      update: async ({ where, data }: any) => {
        const row = rows.find((r) => r.id === where.id);
        if (!row) throw new Error("missing");
        Object.assign(row, data);
        return { ...row };
      },
      updateMany: async ({ where, data }: any) => {
        let count = 0;
        for (const row of rows) {
          if (match(row, where)) {
            Object.assign(row, data);
            count++;
          }
        }
        return { count };
      },
    },
  };
}

function match(row: Row, where: any): boolean {
  if (!where) return true;
  if (where.id && row.id !== where.id) return false;
  if (where.to && row.to !== where.to) return false;
  if (where.kind && row.kind !== where.kind) return false;
  if (where.providerEmailId && row.providerEmailId !== where.providerEmailId) return false;
  if (where.createdAt?.gte && row.createdAt < where.createdAt.gte) return false;
  if (where.outcome?.in && !where.outcome.in.includes(row.outcome as string)) return false;
  if (typeof where.outcome === "string" && row.outcome !== where.outcome) return false;
  return true;
}

function project(row: Row, select: any) {
  if (!select) return { ...row };
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(select)) if (select[key]) out[key] = (row as any)[key];
  return out;
}

async function main() {
  const quota = load("src/lib/email-quota.ts");

  assert.deepEqual(quota.classifyProviderResult({ data: { id: "re_ok" }, error: null }), {
    outcome: "accepted",
    providerEmailId: "re_ok",
  });
  assert.equal(quota.classifyProviderResult({ data: { id: "re_ok" }, error: { name: "validation_error", statusCode: 422 } }).outcome, "failed");
  assert.equal(quota.classifyProviderResult({ data: {}, error: null }).outcome, "unknown");
  assert.equal(quota.classifyProviderResult(undefined).outcome, "unknown");
  const failed = quota.classifyProviderResult({ error: { name: "rate_limit_exceeded", statusCode: 429 } });
  assert.equal(failed.outcome, "failed");
  assert.equal(failed.errorName, "rate_limit_exceeded");
  assert.equal(failed.errorCode, "429");

  for (const outcome of [null, undefined, "attempted", "failed", "unknown", "acceptance_unknown", "provider_failed", "unknown_not_accepted"]) {
    const label = quota.emailLogAdminLabel(outcome);
    assert.doesNotMatch(label, /sent|inviata|inviate/i, `admin label for ${outcome} must not say sent`);
  }
  assert.equal(quota.emailLogAdminLabel("acceptance_unknown"), "esito sconosciuto");
  assert.equal(quota.emailLogAdminLabel("accepted"), "accettata dal provider");
  assert.equal(quota.emailLogAdminLabel("delivered"), "consegnata");

  const now = new Date("2026-10-25T12:00:00Z");
  const db = memoryDb([
    { id: "legacy-1", kind: "application_sent", to: "a@x.test", createdAt: now, outcome: null, providerEmailId: null, errorName: null, errorCode: null },
    { id: "fail-1", kind: "application_sent", to: "a@x.test", createdAt: now, outcome: "failed", providerEmailId: null, errorName: "validation_error", errorCode: "422" },
    { id: "unk-1", kind: "application_sent", to: "a@x.test", createdAt: now, outcome: "unknown", providerEmailId: null, errorName: null, errorCode: null },
    { id: "ok-other", kind: "cv_ready", to: "b@x.test", createdAt: now, outcome: "accepted", providerEmailId: "re_other", errorName: null, errorCode: null },
  ]);

  const can = await quota.canSendEmail(db, now);
  assert.equal(can.today, 1, "failed/unknown/unlabeled must not consume daily quota");
  assert.equal(await quota.hasSuccessfulSendRecently("a@x.test", "application_sent", 6, db, now), false);
  assert.equal(await quota.hasSuccessfulSendRecently("b@x.test", "cv_ready", 6, db, now), true);

  const errDb = memoryDb();
  const warnings: string[] = [];
  const origWarn = console.warn;
  console.warn = (...args: unknown[]) => {
    warnings.push(args.map((arg) => typeof arg === "string" ? arg : JSON.stringify(arg)).join(" "));
  };
  const rejected = await quota.sendWithinQuota("application_sent", "user@x.test", async () => ({
    data: null,
    error: { name: "validation_error", statusCode: 422, message: "The Bearer re_secret123 key was rejected" },
  }), { db: errDb, now });
  console.warn = origWarn;
  assert.ok(warnings.some((line) => line.includes("send_failed") && line.includes("validation_error") && line.includes("422")));
  assert.ok(warnings.every((line) => !line.includes("user@x.test") && !line.includes("re_secret123")));
  assert.ok(warnings.some((line) => line.includes("u***@x.test") && line.includes("Bearer [redacted]")));
  assert.equal(rejected.sent, false);
  assert.equal(rejected.outcome, "failed");
  assert.equal(errDb.rows.length, 1);
  assert.equal(errDb.rows[0].outcome, "failed");
  assert.equal(errDb.rows[0].errorName, "validation_error");
  assert.equal(errDb.rows[0].errorCode, "422");
  assert.equal(errDb.rows[0].providerEmailId, null);
  assert.equal(await quota.hasSuccessfulSendRecently("user@x.test", "application_sent", 6, errDb, now), false);
  const canAfterFail = await quota.canSendEmail(errDb, now);
  assert.equal(canAfterFail.today, 0);

  const okDb = memoryDb();
  const accepted = await quota.sendWithinQuota("application_needs_answers", "user@x.test", async () => ({
    data: { id: "re_123" },
    error: null,
  }), { db: okDb, now });
  assert.equal(accepted.sent, true);
  assert.equal(accepted.outcome, "accepted");
  assert.equal(accepted.providerEmailId, "re_123");
  assert.equal(okDb.rows[0].kind, "application_needs_answers");
  assert.equal(okDb.rows[0].providerEmailId, "re_123");
  assert.equal(await quota.hasSuccessfulSendRecently("user@x.test", "application_needs_answers", 6, okDb, now), true);

  const missingId = await quota.sendWithinQuota("welcome", "user@x.test", async () => ({ data: {}, error: null }), { db: memoryDb(), now });
  assert.equal(missingId.sent, false);
  assert.equal(missingId.outcome, "unknown");

  const timeoutDb = memoryDb();
  await assert.rejects(() => quota.sendWithinQuota("cv_ready", "user@x.test", async () => {
    throw new Error("timeout");
  }, { db: timeoutDb, now }));
  assert.equal(timeoutDb.rows[0].outcome, "unknown");

  const throttleDb = memoryDb();
  for (let i = 0; i < 3; i++) {
    await quota.sendWithinQuota("signup_verify", "retry@x.test", async () => ({
      error: { name: "rate_limit_exceeded", statusCode: 429 },
    }), { db: throttleDb, now: new Date(now.getTime() + i * 1000) });
  }
  const storm = await quota.sendWithinQuota("signup_verify", "retry@x.test", async () => {
    throw new Error("must not send");
  }, { db: throttleDb, now: new Date(now.getTime() + 2000) });
  assert.equal(storm.sent, false);
  assert.equal(storm.reason, "attempt_throttled");
  assert.equal(await quota.canSendEmail(throttleDb, now).then((q: { today: number }) => q.today), 0);

  const delivered = await quota.markEmailLogDelivered("re_123", okDb);
  assert.equal(delivered, 1);
  assert.equal(okDb.rows[0].outcome, "delivered");

  const worker = readFileSync("src/lib/application-worker.ts", "utf8");
  assert.match(worker, /hasSuccessfulSendRecently/);
  assert.match(worker, /sendWithinQuota\("application_needs_answers"/);
  assert.match(worker, /suppressed application_needs_answers/);
  assert.equal((worker.match(/sendWithinQuota\("application_manual"/g) ?? []).length, 1);
  for (const kind of ["cv_ready", "application_sent", "application_manual", "application_needs_answers"]) {
    assert.match(worker, new RegExp(`sendWithinQuota\\("${kind}"[\\s\\S]{0,220}return resend\\.emails\\.send`));
  }

  const sendFiles = [
    "src/lib/weekly-digest.ts",
    "src/lib/daily-summary.ts",
    "src/lib/trial.ts",
    "src/lib/upgrade-nudge.ts",
    "src/lib/onboarding-nudge.ts",
    "src/lib/checkout-feedback.ts",
    "src/lib/checkout-recovery.ts",
    "src/lib/email-verification.ts",
    "src/lib/auth.ts",
    "src/lib/founder-alert.ts",
    "src/lib/auto-apply-self-heal.ts",
    "src/lib/email.ts",
    "src/app/api/auth/password-reset/request/route.ts",
    "src/app/api/admin/broadcast-auto-apply/route.ts",
    "src/app/api/admin/reactivation-blast/route.ts",
    "src/app/api/stripe/webhook/route.ts",
  ];
  for (const file of sendFiles) {
    const src = readFileSync(file, "utf8");
    assert.match(src, /sendWithinQuota/, `${file} must go through sendWithinQuota`);
    assert.match(src, /return (?:resend|new Resend\([^)]*\)|client)\.emails\.send/, `${file} must return the provider result`);
  }
  assert.match(readFileSync("src/lib/recruiter-delivery.ts", "utf8"), /return response;/);
  assert.match(readFileSync("src/app/api/webhooks/resend/route.ts", "utf8"), /markEmailLogDelivered/);

  const adminPages = [
    "src/app/(app)/admin/automation/page.tsx",
    "src/app/(app)/admin/page.tsx",
    "src/app/(app)/admin/users/page.tsx",
    "src/app/api/admin/inspect-emails/route.ts",
  ];
  for (const file of adminPages) {
    const src = readFileSync(file, "utf8");
    assert.match(src, /emailLogAdminLabel|EMAIL_LOG_SUCCESS_WHERE/, `${file} must distinguish outcomes`);
    assert.doesNotMatch(src, /Email inviate/, `${file} must not call EmailLog rows sent`);
  }
  assert.match(readFileSync("src/app/api/admin/inspect-emails/route.ts", "utf8"), /emailLogAdminLabel/);

  const blast = readFileSync("src/app/api/admin/resend-verification/route.ts", "utf8");
  assert.match(blast, /backlog_send_refused/);
  assert.doesNotMatch(blast, /sendVerificationEmail/);
  assert.doesNotMatch(blast, /findMany/);

  const resend = readFileSync("src/app/api/auth/verify-email/resend/route.ts", "utf8");
  assert.match(resend, /sendVerificationEmail/);
  assert.match(resend, /authLimiter/);
  const verify = readFileSync("src/lib/email-verification.ts", "utf8");
  assert.match(verify, /usedAt: new Date\(\)/);
  assert.match(verify, /sendWithinQuota\("signup_verify"/);
  const confirm = readFileSync("src/app/api/auth/verify-email/confirm/route.ts", "utf8");
  assert.match(confirm, /expiresAt\.getTime\(\) < Date\.now\(\)/);
  assert.match(confirm, /invalid_token/);
  assert.doesNotMatch(confirm, /sendVerificationEmail/);

  const migration = readFileSync("prisma/migrations/20261025150000_email_log_outcome/migration.sql", "utf8");
  assert.match(migration, /ADD COLUMN IF NOT EXISTS "outcome"/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS "providerEmailId"/);
  assert.doesNotMatch(migration, /DROP|DELETE/);
  const names = readdirSync("prisma/migrations").filter((n) => n.startsWith("20261025150000"));
  assert.equal(names.length, 1);

  const labelSql = readFileSync("scripts/label-20261024-email-log.sql", "utf8");
  assert.match(labelSql, /UNAPPLIED/);
  assert.match(labelSql, /acceptance_unknown/);
  assert.match(labelSql, /2026-10-24/);
  assert.doesNotMatch(labelSql, /unknown_not_accepted|provider_failed/);
  assert.doesNotMatch(labelSql.replace(/^--.*$/gm, ""), /\bDELETE\b|\bINSERT\s+INTO\s+"EmailLog"/i);
  assert.doesNotMatch(labelSql, /emails\.send/i);

  const keys = loadPlain("src/lib/resend-keys.ts");
  assert.equal(keys.resendReceivingApiKey({ RESEND_API_KEY: "re_send" }), "re_send");
  assert.equal(keys.resendReceivingApiKey({ RESEND_API_KEY: "re_send", RESEND_RECEIVING_API_KEY: "re_recv" }), "re_recv");
  assert.equal(keys.resendSendingApiKey({ RESEND_API_KEY: "re_send", RESEND_RECEIVING_API_KEY: "re_recv" }), "re_send");
  assert.equal(keys.scrubResendSecretText("Bearer re_abc123 failed"), "Bearer [redacted] failed");
  assert.match(keys.redactEmailAddress("giulia@example.test"), /^g\*\*\*@example\.test$/);

  const inbound = readFileSync("src/lib/inbound/providers.ts", "utf8");
  assert.match(inbound, /RESEND_RECEIVING_API_KEY/);
  assert.match(readFileSync("src/lib/application-reply-processing.ts", "utf8"), /resendReceivingApiKey/);
  assert.match(readFileSync("src/lib/inbox-replies.ts", "utf8"), /resendReceivingApiKey/);
  assert.match(readFileSync("src/lib/inbox-replies.ts", "utf8"), /resendSendingApiKey/);
  assert.doesNotMatch(readFileSync("src/lib/resend-keys.ts", "utf8"), /console\.(log|warn|error|info|debug)\(/);

  const schema = readFileSync("prisma/schema.prisma", "utf8");
  assert.match(schema, /outcome\s+String\?/);
  assert.match(schema, /providerEmailId\s+String\?/);

  console.log("Email send reliability: outcomes, quota, throttle, needs-answers, admin copy, verification recovery, 24/10 label script.");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
