import assert from "node:assert/strict";
import {
  backfillTruncatedDescriptions,
  createHostPacer,
  descriptionFetchBackoffMs,
  isDescriptionFetchDue,
  nextDescriptionFetchRetryAt,
  prioritizeTruncatedJobs,
  type DescriptionBackfillDb,
  type TruncatedJobRow,
} from "../src/lib/scrapers/description-backfill";
import { parseRetryAfterMs } from "../src/lib/scrapers/posting-description";

function row(partial: Partial<TruncatedJobRow> & { id: string; title: string }): TruncatedJobRow {
  return {
    source: "greenhouse",
    url: `https://boards.greenhouse.io/acme/jobs/${partial.externalId ?? partial.id}`,
    externalId: partial.externalId ?? partial.id,
    sourceSlug: "acme",
    description: "x".repeat(2000),
    ...partial,
  };
}

function fakeDb(jobs: TruncatedJobRow[], roles: string[] = ["Full-Stack Developer"]): {
  db: DescriptionBackfillDb;
  marks: Array<{ id: string; description: string }>;
  failures: Array<{ id: string; attempts: number; retryAt: Date }>;
} {
  const marks: Array<{ id: string; description: string }> = [];
  const failures: Array<{ id: string; attempts: number; retryAt: Date }> = [];
  return {
    marks,
    failures,
    db: {
      listTruncated: async () => jobs,
      userRoles: async () => roles,
      mark: async (id, description) => { marks.push({ id, description }); },
      markFailure: async (id, attempts, retryAt) => { failures.push({ id, attempts, retryAt }); },
    },
  };
}

const ghBody = JSON.stringify({ content: "<p>About us</p><p>You will use TypeScript, React and Node.js</p>" });
const ok = (body: string) => new Response(body, { status: 200, headers: { "content-type": "application/json" } });
const frozen = new Date("2026-10-24T20:00:00.000Z");

async function main() {
  assert.equal(descriptionFetchBackoffMs(1), 15 * 60_000);
  assert.equal(descriptionFetchBackoffMs(2), 30 * 60_000);
  assert.equal(descriptionFetchBackoffMs(3), 60 * 60_000);
  assert.equal(descriptionFetchBackoffMs(8), 24 * 60 * 60_000);
  assert.equal(isDescriptionFetchDue(null, frozen), true);
  assert.equal(isDescriptionFetchDue(new Date(+frozen - 1), frozen), true);
  assert.equal(isDescriptionFetchDue(new Date(+frozen + 1), frozen), false);
  assert.equal(+nextDescriptionFetchRetryAt(1, frozen) - +frozen, 15 * 60_000);
  assert.equal(+nextDescriptionFetchRetryAt(1, frozen, 90_000) - +frozen, 15 * 60_000, "backoff wins over a shorter Retry-After");
  assert.equal(+nextDescriptionFetchRetryAt(1, frozen, 2 * 60 * 60_000) - +frozen, 2 * 60 * 60_000);
  assert.equal(parseRetryAfterMs("90"), 90_000);
  assert.equal(parseRetryAfterMs("0"), 0);
  assert.equal(parseRetryAfterMs(null), undefined);
  const httpDate = new Date(+frozen + 120_000).toUTCString();
  assert.equal(parseRetryAfterMs(httpDate, +frozen), 120_000);

  const mixed = [
    row({ id: "tax", title: "Tax Accountant" }),
    row({ id: "fs", title: "Senior Full-Stack Engineer" }),
    row({ id: "remote", title: "Remote extra", source: "remotive", url: "https://remotive.com/x" }),
  ];
  const ordered = prioritizeTruncatedJobs(mixed, ["Full-Stack Developer"]);
  assert.equal(ordered.map((j) => j.id).join(","), "fs,tax");
  assert.equal(ordered.length, 2, "unsupported sources are dropped");

  const jobs = [
    row({ id: "a", title: "Full-Stack Engineer" }),
    row({ id: "b", title: "Barista" }),
    row({ id: "c", title: "Another Full-Stack Developer" }),
  ];
  const { db, marks } = fakeDb(jobs);
  const calls: string[] = [];
  const result = await backfillTruncatedDescriptions({
    db,
    fetchImpl: async (url) => { calls.push(url); return ok(ghBody); },
    limit: 2,
    concurrency: 1,
    deadline: Date.now() + 10_000,
    minGapMs: 0,
    sleep: async () => {},
  });
  assert.equal(result.scanned, 2);
  assert.equal(result.marked, 2);
  assert.equal(result.updated, 2);
  assert.equal(result.failed, 0);
  assert.deepEqual(marks.map((m) => m.id), ["a", "c"], "role-matching titles first");
  assert.ok(marks[0].description.includes("TypeScript"));
  assert.equal(calls.length, 2);

  const late = await backfillTruncatedDescriptions({
    db,
    fetchImpl: async () => { throw new Error("network must not run after deadline"); },
    limit: 10,
    deadline: Date.now() - 1,
    minGapMs: 0,
    sleep: async () => {},
  });
  assert.equal(late.marked, 0);
  assert.ok(late.skipped >= 1);

  const { db: failDb, failures } = fakeDb([row({ id: "z", title: "Full-Stack Engineer" })]);
  const failed = await backfillTruncatedDescriptions({
    db: failDb,
    fetchImpl: async () => new Response("", { status: 404 }),
    limit: 1,
    now: frozen,
    minGapMs: 0,
    sleep: async () => {},
  });
  assert.equal(failed.marked, 0);
  assert.equal(failed.failed, 1);
  assert.equal(failures.length, 1);
  assert.equal(failures[0].attempts, 1);
  assert.equal(+failures[0].retryAt, +frozen + 15 * 60_000, "failed rows leave the window until backoff elapses");

  const sameText = "x".repeat(2000);
  const { db: sameDb, marks: sameMarks } = fakeDb([row({ id: "same", title: "Full-Stack Engineer", description: sameText })]);
  const same = await backfillTruncatedDescriptions({
    db: sameDb,
    fetchImpl: async () => ok(JSON.stringify({ content: sameText })),
    limit: 1,
    minGapMs: 0,
    sleep: async () => {},
  });
  assert.equal(same.marked, 1, "successful fetch is marked even when length stays 2000");
  assert.equal(same.updated, 0);
  assert.equal(sameMarks[0].description.length, 2000);

  assert.deepEqual(await backfillTruncatedDescriptions({ db, limit: 0 }), {
    scanned: 0, updated: 0, marked: 0, skipped: 0, failed: 0,
  });

  let ashbyFetches = 0;
  const board = JSON.stringify({
    jobs: [
      { id: "job-1", descriptionHtml: "<p>TypeScript React</p>" },
      { id: "job-2", descriptionHtml: "<p>Coffee service</p>" },
    ],
  });
  const ashby = [
    row({ id: "ash1", source: "ashby", url: "https://jobs.ashbyhq.com/elevenlabs/1", externalId: "job-1", sourceSlug: "elevenlabs", title: "Full-Stack Engineer" }),
    row({ id: "ash2", source: "ashby", url: "https://jobs.ashbyhq.com/elevenlabs/2", externalId: "job-2", sourceSlug: "elevenlabs", title: "Barista" }),
  ];
  const { db: ashDb, marks: ashMarks } = fakeDb(ashby, []);
  await backfillTruncatedDescriptions({
    db: ashDb,
    fetchImpl: async () => { ashbyFetches++; return ok(board); },
    limit: 2,
    concurrency: 1,
    minGapMs: 0,
    sleep: async () => {},
  });
  assert.equal(ashbyFetches, 1, "Ashby board API is fetched once per run");
  assert.equal(ashMarks.length, 2);
  assert.ok(ashMarks.find((m) => m.id === "ash1")?.description.includes("TypeScript"));
  assert.ok(ashMarks.find((m) => m.id === "ash2")?.description.includes("Coffee"));

  // 429 + Retry-After: record backoff and skip remaining jobs on that host.
  const rateLimited = [
    row({ id: "tw1", title: "Full-Stack Engineer", externalId: "1", sourceSlug: "twilio" }),
    row({ id: "tw2", title: "Backend Engineer", externalId: "2", sourceSlug: "twilio" }),
    row({ id: "ok", title: "Full-Stack Engineer", source: "lever", url: "https://jobs.lever.co/acme/ok", externalId: "ok", sourceSlug: "acme" }),
  ];
  const { db: rlDb, failures: rlFail, marks: rlMarks } = fakeDb(rateLimited, []);
  let ghCalls = 0;
  const rl = await backfillTruncatedDescriptions({
    db: rlDb,
    fetchImpl: async (url) => {
      if (url.includes("greenhouse")) {
        ghCalls++;
        return new Response("", { status: 429, headers: { "retry-after": "120" } });
      }
      return ok(JSON.stringify({ descriptionPlain: "TypeScript React on Lever" }));
    },
    limit: 3,
    concurrency: 1,
    now: frozen,
    minGapMs: 0,
    sleep: async () => {},
  });
  assert.equal(ghCalls, 1, "one 429 cools the Greenhouse host for the rest of the run");
  assert.equal(rl.failed, 2);
  assert.equal(rl.marked, 1);
  assert.equal(rlMarks[0].id, "ok");
  assert.ok(rlFail.every((f) => +f.retryAt >= +frozen + 15 * 60_000));

  // Window advances: rows still in backoff are not listed.
  const due = row({ id: "due", title: "Full-Stack Engineer" });
  const cooling = row({ id: "cool", title: "Full-Stack Engineer" });
  const listed: string[] = [];
  const windowDb: DescriptionBackfillDb = {
    listTruncated: async (_limit, at) => {
      const pool = [
        { job: cooling, retryAt: new Date(+at + 60_000) },
        { job: due, retryAt: null as Date | null },
      ];
      const eligible = pool.filter((p) => isDescriptionFetchDue(p.retryAt, at)).map((p) => p.job);
      listed.push(...eligible.map((j) => j.id));
      return eligible;
    },
    userRoles: async () => [],
    mark: async () => {},
    markFailure: async () => {},
  };
  await backfillTruncatedDescriptions({
    db: windowDb,
    fetchImpl: async () => ok(ghBody),
    limit: 40,
    now: frozen,
    minGapMs: 0,
    sleep: async () => {},
  });
  assert.deepEqual(listed, ["due"], "rows in backoff are excluded so older jobs can enter");

  // Per-host pacing serializes two Greenhouse fetches.
  const order: string[] = [];
  const pacer = createHostPacer({
    minGapMs: 50,
    sleep: async (ms) => { order.push(`sleep:${ms}`); },
    now: (() => { let t = 1_000; return () => t; })(),
  });
  await Promise.all([
    pacer.run("boards-api.greenhouse.io", async () => { order.push("a"); }),
    pacer.run("boards-api.greenhouse.io", async () => { order.push("b"); }),
  ]);
  assert.deepEqual(order[0], "a");
  assert.ok(order.includes("sleep:50"), `second host slot waits the gap (${order.join(",")})`);
  assert.ok(order.indexOf("b") > order.indexOf("sleep:50"));

  console.log("PASS description backfill: role priority, backoff, 429 cooldown, host pacing, Ashby cache");
}

main().catch((e) => { console.error(e); process.exit(1); });
