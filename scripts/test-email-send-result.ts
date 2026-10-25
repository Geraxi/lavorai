/**
 * sendWithinQuota treats a Resend error or a missing id as not sent.
 * No EmailLog row, so cooldown and daily quota are not consumed.
 * A success stores the provider id. needs-answers is its own kind.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

function load(path: string, mocks: Record<string, unknown> = {}): any {
  const exports = {};
  const source = ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  new Function("require", "exports", source)((name: string) => {
    if (name in mocks) return mocks[name];
    throw new Error(`unexpected dependency ${name}`);
  }, exports);
  return exports;
}

function loadQuota(opts: {
  paused?: boolean;
  today?: number;
  rejectProviderIdWrite?: boolean;
} = {}) {
  const rows: Array<{ id: string; kind: string; to: string; providerEmailId: string | null; createdAt: Date }> = [];
  const quota = load("src/lib/email-quota.ts", {
    "@/lib/application-pause": { applicationsPaused: () => opts.paused === true },
    "@/lib/db": {
      prisma: {
        emailLog: {
          count: async () => opts.today ?? rows.length,
          create: async ({ data }: { data: { kind: string; to: string; providerEmailId?: string } }) => {
            if (opts.rejectProviderIdWrite && data.providerEmailId) {
              throw new Error("column EmailLog.providerEmailId does not exist");
            }
            const row = {
              id: `log-${rows.length + 1}`,
              kind: data.kind,
              to: data.to,
              providerEmailId: data.providerEmailId ?? null,
              createdAt: new Date(),
            };
            rows.push(row);
            return row;
          },
        },
      },
    },
  });
  return { quota, rows };
}

async function main() {
  const { inspectProviderSendResult, redactProviderSecretText } = loadQuota().quota;

  assert.deepEqual(
    inspectProviderSendResult({ data: { id: "re_abc" }, error: null }),
    { accepted: true, providerEmailId: "re_abc" },
  );
  assert.deepEqual(inspectProviderSendResult("msg_1"), { accepted: true, providerEmailId: "msg_1" });
  assert.equal(inspectProviderSendResult({ data: null, error: { name: "validation_error", statusCode: 422, message: "bad" } }).accepted, false);
  assert.equal(inspectProviderSendResult({ data: {}, error: null }).accepted, false);
  assert.equal(inspectProviderSendResult(undefined).accepted, false);
  assert.equal(inspectProviderSendResult(null).accepted, false);
  assert.equal(inspectProviderSendResult("").accepted, false);
  assert.match(redactProviderSecretText("key re_liveSecret123 and Bearer sk-secret"), /re_\[redacted]/);
  assert.doesNotMatch(redactProviderSecretText("key re_liveSecret123 and Bearer sk-secret"), /liveSecret123|sk-secret/);

  const failed = loadQuota();
  const warns: unknown[] = [];
  const warn = console.warn;
  console.warn = (...args: unknown[]) => { warns.push(args); };
  try {
    const result = await failed.quota.sendWithinQuota("cv_ready", "user@example.invalid", async () => ({
      data: null,
      error: { name: "validation_error", statusCode: 422, message: "invalid re_liveSecret123 Bearer tok" },
    }));
    assert.deepEqual(result, { sent: false, reason: "provider_rejected" });
    assert.equal(failed.rows.length, 0, "Resend error must not write EmailLog");
    const dumped = JSON.stringify(warns);
    assert.match(dumped, /not sent/);
    assert.doesNotMatch(dumped, /re_liveSecret123|Bearer tok/);
  } finally {
    console.warn = warn;
  }

  const missing = loadQuota();
  const missingResult = await missing.quota.sendWithinQuota("application_sent", "user@example.invalid", async () => ({
    data: {},
    error: null,
  }));
  assert.deepEqual(missingResult, { sent: false, reason: "missing_provider_email_id" });
  assert.equal(missing.rows.length, 0, "missing id must not write EmailLog");

  const ignored = loadQuota();
  const ignoredResult = await ignored.quota.sendWithinQuota("application_manual", "user@example.invalid", async () => {});
  assert.deepEqual(ignoredResult, { sent: false, reason: "missing_provider_email_id" });
  assert.equal(ignored.rows.length, 0, "void sendFn must not be treated as sent");

  const ok = loadQuota();
  const sent = await ok.quota.sendWithinQuota("application_needs_answers", "user@example.invalid", async () => ({
    data: { id: "re_ok_1" },
    error: null,
  }));
  assert.deepEqual(sent, { sent: true, reason: null, providerEmailId: "re_ok_1" });
  assert.equal(ok.rows.length, 1);
  assert.equal(ok.rows[0].kind, "application_needs_answers");
  assert.equal(ok.rows[0].providerEmailId, "re_ok_1");

  const fallback = loadQuota({ rejectProviderIdWrite: true });
  const fallbackSent = await fallback.quota.sendWithinQuota("cv_ready", "user@example.invalid", async () => ({
    data: { id: "re_ok_2" },
    error: null,
  }));
  assert.equal(fallbackSent.sent, true);
  assert.equal(fallback.rows.length, 1);
  assert.equal(fallback.rows[0].providerEmailId, null, "row still written if the additive column is not applied");

  const cooldown = loadQuota();
  const firstFail = await cooldown.quota.sendWithinQuota("application_needs_answers", "user@example.invalid", async () => ({
    error: { name: "application_error", statusCode: 500, message: "down" },
  }));
  assert.equal(firstFail.sent, false);
  assert.equal(cooldown.rows.length, 0);
  const recent = cooldown.rows.filter((row) => row.kind === "application_needs_answers" && row.to === "user@example.invalid");
  assert.equal(recent.length, 0, "failed send must not consume cooldown");

  const afterSuccess = await cooldown.quota.sendWithinQuota("application_needs_answers", "user@example.invalid", async () => ({
    data: { id: "re_ok_3" },
  }));
  assert.equal(afterSuccess.sent, true);
  assert.equal(cooldown.rows.length, 1);

  const paused = loadQuota({ paused: true });
  assert.deepEqual(
    await paused.quota.sendWithinQuota("application_needs_answers", "user@example.invalid", async () => {
      throw new Error("Must not transmit");
    }),
    { sent: false, reason: "applications_paused" },
  );
  assert.equal(paused.rows.length, 0);

  const worker = readFileSync("src/lib/application-worker.ts", "utf8");
  assert.match(worker, /shouldSuppressForCooldown\(app\.user\.email, "application_needs_answers", 6\)/);
  assert.match(worker, /sendWithinQuota\("application_needs_answers"/);
  assert.doesNotMatch(
    worker.slice(worker.indexOf("async function notifyNeedsAnswers")),
    /sendWithinQuota\("application_manual"/,
  );
  for (const kind of ["cv_ready", "application_sent", "application_manual", "application_needs_answers"]) {
    const block = worker.slice(worker.lastIndexOf(`sendWithinQuota("${kind}"`));
    assert.match(block, /return resend\.emails\.send/);
  }

  const migration = readFileSync("prisma/migrations/20261025170000_email_log_provider_email_id/migration.sql", "utf8");
  assert.match(migration, /Not applied by this change/);
  assert.match(migration, /ADD COLUMN "providerEmailId"/);
  assert.doesNotMatch(migration, /DROP /);

  console.log("PASS email send result: error/missing id not sent, success stores id, failed send skips cooldown");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
