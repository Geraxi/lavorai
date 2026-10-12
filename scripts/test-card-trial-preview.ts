import assert from "node:assert/strict";
import { createPreviewStore, DefinitePreviewFailure, PreviewError, runCardTrialPreview, type PreviewRow, type PreviewStore, type CardTrialPreviewResult } from "../src/lib/card-trial-preview";

const result: CardTrialPreviewResult = {
  ok: true, target: { jobId: "job-1", title: "Engineer", company: "Acme", location: null, matchedJob: true },
  optimizedCV: { fullName: "Candidate", email: "candidate@example.test", phone: "", location: "", linkedinUrl: null, summary: "Experienced engineer", experiences: [], education: [], skills: { technical: ["TypeScript"], tools: [], soft: [] }, languages: [] },
  coverLetter: "A complete, tailored cover letter.", atsScore: 81, suggestions: [],
};
function memoryStore() {
  const rows = new Map<string, PreviewRow>();
  const store: PreviewStore = {
    async reserve(userId, jobId, leaseId) {
      const row = rows.get(userId);
      if (row && (row.state !== "failed" || row.jobId !== jobId)) return false;
      rows.set(userId, { userId, jobId, state: "reserved", leaseId, leaseExpiresAt: new Date(Date.now() + 120000), result: null });
      return true;
    },
    async read(userId) { return rows.get(userId) ?? null; },
    async succeed(userId, leaseId, output) {
      const row = rows.get(userId);
      if (!row || row.state !== "reserved" || row.leaseId !== leaseId) return false;
      row.state = "succeeded"; row.result = output; return true;
    },
    async fail(userId, leaseId) {
      const row = rows.get(userId);
      if (!row || row.state !== "reserved" || row.leaseId !== leaseId) return false;
      row.state = "failed"; return true;
    },
  };
  return { rows, store };
}
async function rejectsCode(promise: Promise<unknown>, code: string) {
  await assert.rejects(promise, (error: unknown) => error instanceof PreviewError && error.code === code);
}
async function main() {
  const { store, rows } = memoryStore();
  let calls = 0;
  let finish!: () => void;
  const pending = new Promise<void>((resolve) => { finish = resolve; });
  const run = (jobId = "job-1") => runCardTrialPreview({ userId: "u1", jobId, store, generate: async () => { calls++; await pending; return result; } });
  const first = run();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await rejectsCode(run(), "preview_in_progress");
  await rejectsCode(run("job-2"), "preview_job_locked");
  assert.equal(calls, 1);
  finish();
  assert.deepEqual(await first, result);
  assert.deepEqual(await run(), result);
  assert.equal(calls, 1, "replay never calls provider");
  await rejectsCode(run("job-2"), "preview_job_locked");
  assert.equal(await store.succeed("u1", "wrong-lease", result), false);
  assert.equal(await store.fail("u1", rows.get("u1")!.leaseId), false, "success cannot be released");

  const failed = memoryStore();
  const retryInput = { userId: "u2", jobId: "job-1", store: failed.store };
  await rejectsCode(runCardTrialPreview({ ...retryInput, generate: async () => { throw new DefinitePreviewFailure("provider_rejected", 502); } }), "provider_rejected");
  assert.equal(failed.rows.get("u2")!.state, "failed");
  await rejectsCode(runCardTrialPreview({ ...retryInput, jobId: "job-2", generate: async () => result }), "preview_job_locked");
  assert.deepEqual(await runCardTrialPreview({ ...retryInput, generate: async () => result }), result);

  const unknown = memoryStore();
  let unknownCalls = 0;
  const uncertain = () => runCardTrialPreview({ userId: "u3", jobId: "job-1", store: unknown.store, generate: async () => { unknownCalls++; throw new Error("timeout after provider submission"); } });
  await rejectsCode(uncertain(), "preview_reconciliation_required");
  unknown.rows.get("u3")!.leaseExpiresAt = new Date(0);
  await rejectsCode(uncertain(), "preview_reconciliation_required");
  assert.equal(unknownCalls, 1, "expired reservations cannot regenerate");
  assert.equal(unknown.rows.get("u3")!.state, "reserved");

  const persistence = memoryStore();
  persistence.store.succeed = async () => { throw new Error("DB unavailable"); };
  await rejectsCode(runCardTrialPreview({ userId: "u4", jobId: "job-1", store: persistence.store, generate: async () => result }), "preview_reconciliation_required");
  assert.equal(persistence.rows.get("u4")!.state, "reserved", "save failure cannot restore allowance");

  const acknowledgement = memoryStore();
  const persist = acknowledgement.store.succeed;
  acknowledgement.store.succeed = async (...args) => { await persist(...args); throw new Error("lost DB acknowledgement"); };
  const acknowledgementInput = { userId: "u6", jobId: "job-1", store: acknowledgement.store };
  await rejectsCode(runCardTrialPreview({ ...acknowledgementInput, generate: async () => result }), "preview_reconciliation_required");
  assert.deepEqual(await runCardTrialPreview({ ...acknowledgementInput, generate: async () => { throw new Error("must not regenerate"); } }), result);

  // Verify SQL contract without opening a database connection.
  const queries: { sql: string; values: unknown[] }[] = [];
  const db = {
    async $queryRaw(strings: TemplateStringsArray, ...values: unknown[]) { queries.push({ sql: strings.join("?"), values }); return [{ userId: "u5" }]; },
    async $executeRaw(strings: TemplateStringsArray, ...values: unknown[]) { queries.push({ sql: strings.join("?"), values }); return 1; },
  };
  const sqlStore = createPreviewStore(db as unknown as Parameters<typeof createPreviewStore>[0]);
  const maliciousId = "u5'; DROP TABLE x; --";
  assert.equal(await sqlStore.reserve(maliciousId, "job-1", "lease"), true);
  assert.match(queries[0].sql, /ON CONFLICT \("userId"\) DO UPDATE/);
  assert.match(queries[0].sql, /"state" = 'failed' AND/);
  assert.ok(!queries[0].sql.includes(maliciousId));
  assert.ok(queries[0].values.includes(maliciousId));
  await sqlStore.succeed("u5", "lease", result);
  assert.match(queries[1].sql, /"leaseId" = \? AND "state" = 'reserved'/);
  console.log("PASS card-trial preview: concurrent reservation, full replay, locked job, definite failure retry, unknown outcome quarantine, persistence failure, CAS, parameterized SQL");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
