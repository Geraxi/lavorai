import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Rete bloccata: nessun test può contattare ATS, AI o provider email.
globalThis.fetch = (async () => { throw new Error("network_blocked_in_tests"); }) as typeof fetch;
process.env.DATABASE_URL ??= "postgresql://blocked:blocked@127.0.0.1:1/blocked";

async function main() {
const { resolveAdapterByUrl, noAdapterMessageFor, UNSUPPORTED_PORTAL_MESSAGE, normalizeAtsUrl } = await import("../src/lib/ats-adapter-resolution");
const { runStuckAtsRequeue, staticSkipReason, classifyStuck } = await import("../src/lib/stuck-ats-requeue");
const { jobFreshnessWhere, maxJobAgeDays } = await import("../src/lib/auto-apply-cron");

// 1. Risoluzione per host, indipendente da app.portal.
const cases: Array<[string, string | null]> = [
  ["https://boards.greenhouse.io/acme/jobs/123", "greenhouse"],
  ["https://job-boards.greenhouse.io/acme/jobs/123?gh_src=x", "greenhouse"],
  ["https://BOARDS.Greenhouse.io./acme/jobs/1", "greenhouse"],
  ["https://jobs.ashbyhq.com/acme/0b1c", "ashby"],
  ["https://jobs.lever.co/acme/abc-def", "lever"],
  ["https://apply.workable.com/acme/j/ABC123/", "workable"],
  ["https://www.linkedin.com/jobs/view/1", null],
  ["https://greenhouse.io.evil.invalid/acme/jobs/1", null],
  ["javascript:alert(1)", null],
];
for (const [url, id] of cases) assert.equal(resolveAdapterByUrl([url])?.adapter.id ?? null, id, url);
assert.equal(resolveAdapterByUrl(["https://careers.acme.invalid/x", "https://jobs.lever.co/acme/1"])?.url, "https://jobs.lever.co/acme/1");
assert.equal(normalizeAtsUrl("ftp://x"), null);

// Messaggi: ATS supportato ≠ portale non supportato.
assert.equal(noAdapterMessageFor("https://example.invalid/job", { portalSubmitEnabled: true }), UNSUPPORTED_PORTAL_MESSAGE);
const gh = noAdapterMessageFor("https://boards.greenhouse.io/a/jobs/1", { portalSubmitEnabled: true });
assert.match(gh, /Greenhouse.*supportato.*adapter ATS non riuscito/i);
assert.doesNotMatch(gh, /non è supportato/);
assert.match(noAdapterMessageFor("https://jobs.lever.co/a/1", { portalSubmitEnabled: false }), /disattivato/);

// Wiring nel worker: niente più lookup grezzo su findPortalAdapter né messaggio fisso.
const worker = readFileSync("src/lib/application-worker.ts", "utf8");
assert.match(worker, /resolveAdapterByUrl\(\[app\.job\.url, resolvedUrl\]\)/);
assert.match(worker, /noAdapterMessageFor\(jobUrl/);
assert.doesNotMatch(worker, /"Questo portale non è supportato per invio automatico/);
// Liveness prima della generazione AI.
const live = worker.indexOf("ensureLiveJobForApplication(applicationId, workToken");
assert.ok(live > 0 && live < worker.indexOf("generateOptimizedCVDocx({"), "liveness check must precede AI generation");

// 3. Staleness.
assert.equal(maxJobAgeDays({}), 30);
assert.equal(maxJobAgeDays({ AUTO_APPLY_MAX_JOB_AGE_DAYS: "14" }), 14);
for (const bad of ["0", "-3", "abc", "9999"]) assert.equal(maxJobAgeDays({ AUTO_APPLY_MAX_JOB_AGE_DAYS: bad }), 30);
const now = new Date("2026-10-20T10:00:00Z");
const fw = jobFreshnessWhere(now, 30);
assert.equal(fw.closedAt, null);
assert.equal((fw.OR[0].postedAt as { gte: Date }).gte.toISOString(), "2026-09-20T10:00:00.000Z");
assert.match(readFileSync("src/lib/auto-apply-cron.ts", "utf8"), /AND: \[\s*(\/\/.*\s*)*jobFreshnessWhere\(\)/);

// 2. Requeue: selezione, dry-run, apply, idempotenza.
type Row = Parameters<typeof staticSkipReason>[0];
const base: Row = {
  id: "a1", userId: "u", jobId: "j1", status: "ready_to_apply", portal: "other", startedAt: null,
  errorMessage: UNSUPPORTED_PORTAL_MESSAGE,
  submittedAt: null, submittedVia: null, submitConfirmation: null, canaryLog: null, answersUsedJson: null,
  viewedAt: null, lastReplyAt: null, replyCount: 0, userStatus: null,
  submitClickPerformedAt: null, outboundSubmissionJson: null, destinationResponseJson: null,
  job: { id: "j1", url: "https://boards.greenhouse.io/acme/jobs/1", closedAt: null },
};
assert.equal(staticSkipReason({ ...base, submitClickPerformedAt: new Date() }), "possible_submission");
assert.equal(staticSkipReason({ ...base, outboundSubmissionJson: "{}" }), "possible_submission");
const rows: Row[] = [
  base,
  { ...base, id: "a2", jobId: "j2", status: "failed", errorMessage: '400 {"type":"error","error":{"type":"not_found_error","message":"model: claude-3-x"}}', job: { id: "j2", url: "https://jobs.lever.co/acme/2", closedAt: null } },
  { ...base, id: "a3", jobId: "j3", job: { id: "j3", url: "https://careers.acme.invalid/3", closedAt: null } }, // no adapter
  { ...base, id: "a4", jobId: "j4", submittedVia: "portal_greenhouse", job: { ...base.job, id: "j4" } }, // possibile invio
  { ...base, id: "a5", jobId: "j5", job: { id: "j5", url: "https://jobs.ashbyhq.com/acme/5", closedAt: null } }, // liveness closed
  { ...base, id: "a6", jobId: "j6", job: { id: "j6", url: "https://apply.workable.com/acme/j/6", closedAt: null } }, // unknown
  { ...base, id: "a7", jobId: "j7", errorMessage: "Annuncio non più online", status: "failed", job: { ...base.job, id: "j7" } }, // non bloccata
  { ...base, id: "a8", jobId: "j8", job: { id: "j8", url: "https://jobs.lever.co/acme/8", closedAt: new Date() } },
  { ...base, id: "a9", jobId: "j9", job: { id: "j9", url: "https://jobs.lever.co/acme/9", closedAt: null } }, // sibling inviato
];
assert.equal(classifyStuck(rows[1]), "model_not_found");
const makeDeps = () => {
  const state = new Map(rows.map((r) => [r.id, { ...r }]));
  const calls = { enqueue: [] as string[], closed: [] as string[], liveness: 0 };
  return { state, calls, deps: {
    findCandidates: async () => [...state.values()].filter((r) => ["ready_to_apply", "failed"].includes(r.status)),
    hasSubmittedSibling: async (r: Row) => r.id === "a9",
    checkLiveness: async (url: string) => { calls.liveness++; return { state: (url.includes("/5") ? "closed" : url.includes("/6") ? "unknown" : "live") as "live", reason: "mock", checkedAt: now }; },
    markJobClosed: async (id: string) => { calls.closed.push(id); },
    requeue: async (r: Row) => { const cur = state.get(r.id)!; if (cur.status !== r.status || cur.errorMessage !== r.errorMessage) return 0; cur.status = "queued"; cur.errorMessage = null; return 1; },
    enqueue: async (id: string) => { calls.enqueue.push(id); },
  } };
};
{
  const { deps, calls, state } = makeDeps();
  const r = await runStuckAtsRequeue(deps, { apply: false, limit: 50 });
  assert.deepEqual(r.eligibleIds, ["a1", "a2"]);
  assert.deepEqual(r.byKind, { unsupported_portal: 1, model_not_found: 1 });
  assert.deepEqual(r.byAdapter, { greenhouse: 1, lever: 1 });
  assert.deepEqual(r.skipped, { no_adapter: 1, possible_submission: 1, liveness_closed: 1, liveness_unknown: 1, not_stuck: 1, job_closed: 1, already_submitted_sibling: 1 });
  assert.equal(r.requeued, 0);
  assert.deepEqual(calls.enqueue, []); assert.deepEqual(calls.closed, []);
  assert.equal(state.get("a1")!.status, "ready_to_apply", "dry-run must not write");
}
{
  const { deps, calls } = makeDeps();
  const r1 = await runStuckAtsRequeue(deps, { apply: true, limit: 50 });
  assert.equal(r1.requeued, 2); assert.deepEqual(calls.enqueue, ["a1", "a2"]); assert.deepEqual(calls.closed, ["j5"]);
  const r2 = await runStuckAtsRequeue(deps, { apply: true, limit: 50 });
  assert.equal(r2.requeued, 0, "idempotent"); assert.deepEqual(calls.enqueue, ["a1", "a2"]);
}
{
  const { deps, calls } = makeDeps();
  const r = await runStuckAtsRequeue(deps, { apply: true, limit: 1 });
  assert.equal(r.requeued, 1); assert.deepEqual(calls.enqueue, ["a1"]);
}
{ // race: la riga cambia tra lettura e CAS → nessun enqueue
  const { deps, calls } = makeDeps();
  const r = await runStuckAtsRequeue({ ...deps, requeue: async () => 0 }, { apply: true, limit: 50 });
  assert.equal(r.raced, 2); assert.deepEqual(calls.enqueue, []);
}
const { parseArgs } = await import("./requeue-stuck-ats");
assert.deepEqual(parseArgs([]), { apply: false, limit: 50 });
assert.deepEqual(parseArgs(["--apply", "--limit", "7"]), { apply: true, limit: 7 });
assert.throws(() => parseArgs(["--limit", "0"]));
console.log("test-ats-unstick: ok");
}
main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
