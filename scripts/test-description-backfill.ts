import assert from "node:assert/strict";
import {
  backfillTruncatedDescriptions,
  prioritizeTruncatedJobs,
  type DescriptionBackfillDb,
  type TruncatedJobRow,
} from "../src/lib/scrapers/description-backfill";

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

function fakeDb(jobs: TruncatedJobRow[], roles: string[] = ["Full-Stack Developer"]): { db: DescriptionBackfillDb; marks: Array<{ id: string; description: string }> } {
  const marks: Array<{ id: string; description: string }> = [];
  return {
    marks,
    db: {
      listTruncated: async () => jobs,
      userRoles: async () => roles,
      mark: async (id, description) => { marks.push({ id, description }); },
    },
  };
}

const ghBody = JSON.stringify({ content: "<p>About us</p><p>You will use TypeScript, React and Node.js</p>" });
const ok = (body: string) => new Response(body, { status: 200, headers: { "content-type": "application/json" } });

async function main() {
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
  });
  assert.equal(result.scanned, 2);
  assert.equal(result.marked, 2);
  assert.equal(result.updated, 2);
  assert.deepEqual(marks.map((m) => m.id), ["a", "c"], "role-matching titles first");
  assert.ok(marks[0].description.includes("TypeScript"));
  assert.equal(calls.length, 2);

  const late = await backfillTruncatedDescriptions({
    db,
    fetchImpl: async () => { throw new Error("network must not run after deadline"); },
    limit: 10,
    deadline: Date.now() - 1,
  });
  assert.equal(late.marked, 0);
  assert.ok(late.skipped >= 1);

  const failed = await backfillTruncatedDescriptions({
    db: fakeDb([row({ id: "z", title: "Full-Stack Engineer" })]).db,
    fetchImpl: async () => new Response("", { status: 404 }),
    limit: 1,
  });
  assert.equal(failed.marked, 0);
  assert.equal(failed.skipped, 1);

  const sameText = "x".repeat(2000);
  const { db: sameDb, marks: sameMarks } = fakeDb([row({ id: "same", title: "Full-Stack Engineer", description: sameText })]);
  const same = await backfillTruncatedDescriptions({
    db: sameDb,
    fetchImpl: async () => ok(JSON.stringify({ content: sameText })),
    limit: 1,
  });
  assert.equal(same.marked, 1, "successful fetch is marked even when length stays 2000");
  assert.equal(same.updated, 0);
  assert.equal(sameMarks[0].description.length, 2000);

  assert.deepEqual(await backfillTruncatedDescriptions({ db, limit: 0 }), {
    scanned: 0, updated: 0, marked: 0, skipped: 0,
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
  });
  assert.equal(ashbyFetches, 1, "Ashby board API is fetched once per run");
  assert.equal(ashMarks.length, 2);
  assert.ok(ashMarks.find((m) => m.id === "ash1")?.description.includes("TypeScript"));
  assert.ok(ashMarks.find((m) => m.id === "ash2")?.description.includes("Coffee"));

  console.log("PASS description backfill: role priority, limit, deadline, idempotent mark, Ashby board cache");
}

main().catch((e) => { console.error(e); process.exit(1); });
