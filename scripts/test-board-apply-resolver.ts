import assert from "node:assert/strict";
import {
  BOARD_RESOLUTION_TTL_MS, canonicalItemFor, extractWwrApplyUrl, parseAtsPosting,
  resolveBoardApplyDestination, resolveBoardListingsForRoles,
} from "../src/lib/board-apply-resolver";

// No network: every fetch below is a local stub. No database: a stub db.

function testParseAtsPosting() {
  assert.deepEqual(parseAtsPosting("https://jobs.ashbyhq.com/zapier/c0582311-18cb-4415-9c86-79014f1b74f6"),
    { provider: "ashby", tenant: "zapier", postingId: "c0582311-18cb-4415-9c86-79014f1b74f6" });
  assert.deepEqual(parseAtsPosting("https://jobs.ashbyhq.com/gismart/059d1905-ddd2-46af-8364-c6e8cc2399c1/application?utm_source=arbeitnow.com&ref=arbeitnow.com"),
    { provider: "ashby", tenant: "gismart", postingId: "059d1905-ddd2-46af-8364-c6e8cc2399c1" });
  assert.deepEqual(parseAtsPosting("https://boards.greenhouse.io/acme/jobs/4567890"), { provider: "greenhouse", tenant: "acme", postingId: "4567890" });
  assert.deepEqual(parseAtsPosting("https://job-boards.greenhouse.io/Acme/jobs/4567890?gh_src=x"), { provider: "greenhouse", tenant: "acme", postingId: "4567890" });
  assert.deepEqual(parseAtsPosting("https://jobs.lever.co/acme/3f1c2a10-1111-4222-8333-944455556666/apply"),
    { provider: "lever", tenant: "acme", postingId: "3f1c2a10-1111-4222-8333-944455556666" });
  assert.deepEqual(parseAtsPosting("https://apply.workable.com/acme/j/AB12CD34EF/"), { provider: "workable", tenant: "acme", postingId: "AB12CD34EF" });
  for (const bad of [
    "http://jobs.ashbyhq.com/zapier/c0582311-18cb-4415-9c86-79014f1b74f6", // not https
    "https://jobs.ashbyhq.com/zapier", // board, not a posting
    "https://jobs.ashbyhq.com.evil.example/zapier/c0582311-18cb-4415-9c86-79014f1b74f6",
    "https://user:pw@boards.greenhouse.io/acme/jobs/4567890",
    "https://boards.greenhouse.io/acme", "https://boards.greenhouse.io/acme/jobs/abc",
    "https://stripe.com/jobs/listing/123?gh_jid=4567890", // custom career page: needs separate review
    "https://jobs.lever.co/acme", "https://apply.workable.com/acme/", "https://www.linkedin.com/jobs/view/1",
    "https://www.adzuna.it/land/ad/5919310613", "mailto:jobs@zapier.com", "not a url",
  ]) assert.equal(parseAtsPosting(bad), null, bad);
}

function testWwrExtraction() {
  const cta = (href: string) => `<a target="_blank" rel="noopener noreferrer" id="job-cta-alt" onclick="apply_for_job()" href="${href}">Apply now</a>`;
  const ashby = "https://jobs.ashbyhq.com/zapier/c0582311-18cb-4415-9c86-79014f1b74f6";
  assert.equal(extractWwrApplyUrl(`<div>${cta(ashby)}</div><aside>${cta(ashby)}</aside>`), ashby, "Both CTAs agree");
  assert.equal(extractWwrApplyUrl(`${cta(ashby)}${cta("https://boards.greenhouse.io/other/jobs/123456")}`), null, "Conflicting CTAs are ambiguous");
  assert.equal(extractWwrApplyUrl(cta("https://zapier.com/jobs/apply")), null, "Custom career page is not a supported ATS posting");
  assert.equal(extractWwrApplyUrl(`<a href="${ashby}">Similar job</a>`), null, "An ATS link that is not the apply CTA is not evidence");
  assert.equal(extractWwrApplyUrl("<p>no apply</p>"), null);
}

type Stub = { status: number; location?: string; body?: string };
function stubFetch(routes: Record<string, Stub>, calls: string[]) {
  return async (input: string) => {
    calls.push(input);
    const route = routes[input];
    if (!route) throw new Error(`unexpected fetch ${input}`);
    return new Response(route.body ?? "", { status: route.status, headers: route.location ? { location: route.location } : {} });
  };
}

async function testResolveDestination() {
  const calls: string[] = [];
  const ats = "https://jobs.ashbyhq.com/gismart/059d1905-ddd2-46af-8364-c6e8cc2399c1/application?utm_source=arbeitnow.com";
  const listing = "https://www.arbeitnow.com/jobs/companies/gismart/remote-motion-designer-dancebit-287210";
  const fetchImpl = stubFetch({
    [`${listing}/apply`]: { status: 302, location: ats },
    "https://www.arbeitnow.com/jobs/companies/acme/role-1/apply": { status: 302, location: "https://www.arbeitnow.com/r/acme-1" },
    "https://www.arbeitnow.com/r/acme-1": { status: 301, location: "https://boards.greenhouse.io/acme/jobs/4567890" },
    "https://www.arbeitnow.com/jobs/companies/custom/role-2/apply": { status: 302, location: "https://custom.example/careers/role-2" },
    "https://www.arbeitnow.com/jobs/companies/gone/role-3/apply": { status: 404 },
    "https://weworkremotely.com/remote-jobs/zapier-sr-motion-designer": { status: 200, body: `<a id="job-cta-alt" href="https://jobs.ashbyhq.com/zapier/c0582311-18cb-4415-9c86-79014f1b74f6">Apply now</a>` },
    "https://weworkremotely.com/remote-jobs/gone": { status: 404 },
  }, calls);
  const r1 = await resolveBoardApplyDestination({ source: "arbeitnow", url: listing }, fetchImpl);
  assert.equal(r1.kind, "ats");
  assert.deepEqual(r1.kind === "ats" && r1.posting, { provider: "ashby", tenant: "gismart", postingId: "059d1905-ddd2-46af-8364-c6e8cc2399c1" });
  const r2 = await resolveBoardApplyDestination({ source: "arbeitnow", url: "https://www.arbeitnow.com/jobs/companies/acme/role-1" }, fetchImpl);
  assert.equal(r2.kind === "ats" && r2.posting.provider, "greenhouse", "On-board redirect hops are followed");
  assert.deepEqual(await resolveBoardApplyDestination({ source: "arbeitnow", url: "https://www.arbeitnow.com/jobs/companies/custom/role-2" }, fetchImpl),
    { kind: "unsupported", reason: "destination_not_supported_ats" }, "Off-board non-ATS destinations are not followed further");
  assert.equal((await resolveBoardApplyDestination({ source: "arbeitnow", url: "https://www.arbeitnow.com/jobs/companies/gone/role-3" }, fetchImpl)).kind, "unsupported");
  const r3 = await resolveBoardApplyDestination({ source: "weworkremotely", url: "https://weworkremotely.com/remote-jobs/zapier-sr-motion-designer" }, fetchImpl);
  assert.equal(r3.kind === "ats" && r3.posting.tenant, "zapier");
  assert.equal((await resolveBoardApplyDestination({ source: "weworkremotely", url: "https://weworkremotely.com/remote-jobs/gone" }, fetchImpl)).kind, "unsupported");
  const before = calls.length;
  // Sources we must not (WAF, login gate, robots) or cannot resolve: no request at all.
  for (const [source, url] of [["adzuna", "https://www.adzuna.it/details/5919310613"], ["jobicy", "https://jobicy.com/jobs/155561-sr-motion-designer"],
    ["himalayas", "https://himalayas.app/companies/clario/jobs/x"], ["remoteok", "https://remoteok.com/remote-jobs/x-1"],
    ["arbeitnow", "https://evil.example/jobs/companies/x"], ["weworkremotely", "http://weworkremotely.com/remote-jobs/x"]]) {
    assert.equal((await resolveBoardApplyDestination({ source, url }, fetchImpl)).kind, "unsupported", `${source} ${url}`);
  }
  assert.equal(calls.length, before, "Unsupported sources and off-host URLs are never fetched");
  const failing = async () => { throw new Error("timeout"); };
  assert.deepEqual(await resolveBoardApplyDestination({ source: "arbeitnow", url: listing }, failing), { kind: "unsupported", reason: "fetch_failed" });
}

function item(overrides: Record<string, unknown> = {}) {
  return {
    id: "", externalId: "c0582311-18cb-4415-9c86-79014f1b74f6", source: "ashby", sourceSlug: "zapier", title: "Sr. Motion Designer",
    company: "Zapier", location: null, description: "Motion design.", url: "https://jobs.ashbyhq.com/zapier/c0582311-18cb-4415-9c86-79014f1b74f6",
    contractType: "FullTime", remote: true, salaryMin: null, salaryMax: null, category: "Design", postedAt: new Date(0),
    recruiterEmail: null, recruiterScrapedAt: null, ...overrides,
  } as any;
}

function testCanonical() {
  const posting = { provider: "ashby" as const, tenant: "zapier", postingId: "c0582311-18cb-4415-9c86-79014f1b74f6" };
  assert.equal(canonicalItemFor(posting, [item({ externalId: "other" }), item()])?.externalId, posting.postingId);
  assert.equal(canonicalItemFor(posting, [item({ externalId: "other" })]), null, "Closed/filtered postings are not promoted");
  assert.equal(canonicalItemFor(posting, [item({ url: "https://jobs.ashbyhq.com/zapier/00000000-0000-4000-8000-000000000000" })]), null,
    "Feed row whose URL identifies another posting is rejected");
  assert.equal(canonicalItemFor(posting, [item({ source: "lever" })]), null);
}

async function testResolvePass() {
  const now = new Date("2026-10-17T20:00:00.000Z");
  const rows = [
    { id: "wwr-1", source: "weworkremotely", url: "https://weworkremotely.com/remote-jobs/zapier-sr-motion-designer", company: "Zapier" },
    { id: "an-1", source: "arbeitnow", url: "https://www.arbeitnow.com/jobs/companies/gismart/a", company: "Gismart" },
    { id: "an-2", source: "arbeitnow", url: "https://www.arbeitnow.com/jobs/companies/custom/b", company: "Custom" },
    { id: "an-3", source: "arbeitnow", url: "https://www.arbeitnow.com/jobs/companies/racy/c", company: "Racy" },
  ];
  const queries: any[] = [], created: any[] = [], marked: any[] = [];
  const db = {
    job: {
      findMany: async (q: any) => { queries.push(q); return rows; },
      findFirst: async (q: any) => q.where.OR[0].externalId === "gismart-existing" ? { id: "existing" } : null,
      create: async (q: any) => {
        if (q.data.externalId === "racy-1") throw Object.assign(new Error("unique"), { code: "P2002" });
        created.push(q.data); return { id: "new" };
      },
      updateMany: async (q: any) => { marked.push(q); return { count: 1 }; },
    },
  };
  const resolve = async (row: { url: string }) => {
    if (row.url.includes("zapier")) return { kind: "ats" as const, posting: { provider: "ashby" as const, tenant: "zapier", postingId: "c0582311-18cb-4415-9c86-79014f1b74f6" }, applyUrl: "x" };
    if (row.url.includes("gismart")) return { kind: "ats" as const, posting: { provider: "ashby" as const, tenant: "gismart", postingId: "gismart-existing" }, applyUrl: "x" };
    if (row.url.includes("racy")) return { kind: "ats" as const, posting: { provider: "ashby" as const, tenant: "racy", postingId: "racy-1" }, applyUrl: "x" };
    return { kind: "unsupported" as const, reason: "destination_not_supported_ats" };
  };
  const canonical = async (posting: { postingId: string; tenant: string }, company: string | null) => item({
    externalId: posting.postingId, company, sourceSlug: posting.tenant,
    url: `https://jobs.ashbyhq.com/${posting.tenant}/${posting.postingId}`,
  });
  const stats = await resolveBoardListingsForRoles(["Motion Designer", "3D"], { now, db, resolve, canonical, limit: 50 });
  assert.deepEqual(stats, { attempted: 4, promoted: 1, existing: 2, unsupported: 1 });
  assert.equal(created.length, 1);
  assert.equal(created[0].source, "ashby");
  assert.equal(created[0].url, "https://jobs.ashbyhq.com/zapier/c0582311-18cb-4415-9c86-79014f1b74f6");
  assert.equal(created[0].company, "Zapier");
  assert.equal(created[0].closedAt, undefined, "Created rows are open; existing sync-owned rows are never updated or reopened");
  assert.deepEqual(marked.map((m) => m.where.id).sort(), ["an-1", "an-2", "an-3", "wwr-1"], "Every attempted board row records its lookup time");
  assert.ok(marked.every((m) => +m.data.recruiterScrapedAt === +now && Object.keys(m.data).length === 1));
  const q = queries[0];
  assert.equal(q.take, 20, "Hard cap on lookups per call");
  assert.deepEqual(q.where.source, { in: ["weworkremotely", "arbeitnow"] });
  assert.equal(q.where.closedAt, null);
  assert.equal(+q.where.OR[1].recruiterScrapedAt.lt, +now - BOARD_RESOLUTION_TTL_MS, "Re-check at most once per TTL");
  assert.deepEqual(q.where.AND[0].OR.length, 1, "Role tokens shorter than 3 chars are ignored like the pool query");

  assert.deepEqual(await resolveBoardListingsForRoles([], { db, resolve, canonical }), { attempted: 0, promoted: 0, existing: 0, unsupported: 0 });
  // Exhausted run budget: no lookup is started.
  const beforeBudget = queries.length;
  assert.equal((await resolveBoardListingsForRoles(["Motion Designer"], { db, resolve, canonical, deadline: Date.now() + 500 })).attempted, 0);
  assert.equal(queries.length, beforeBudget);
  // Budget runs out mid-lookup: the row is not marked as looked-up, so it is retried next run.
  marked.length = 0;
  let clock = 0;
  const slowResolve = async (row: { url: string }) => { clock = 1; return resolve(row); };
  const tight = Date.now() + 3_500;
  const realNow = Date.now;
  Date.now = () => realNow() + (clock ? 3_000 : 0);
  try {
    const partial = await resolveBoardListingsForRoles(["Motion Designer"], { db, resolve: slowResolve, canonical, deadline: tight, now });
    assert.equal(partial.promoted, 0);
    assert.deepEqual(marked.map((m) => m.where.id), ["an-2"], "Only the definitively unsupported row is cached; budget-skipped rows stay unmarked");
  } finally { Date.now = realNow; }
  const previous = process.env.BOARD_APPLY_RESOLUTION;
  process.env.BOARD_APPLY_RESOLUTION = "false";
  try {
    const before = queries.length;
    assert.equal((await resolveBoardListingsForRoles(["Motion Designer"], { db, resolve, canonical })).attempted, 0);
    assert.equal(queries.length, before, "Kill switch: no lookup at all");
  } finally {
    if (previous === undefined) delete process.env.BOARD_APPLY_RESOLUTION; else process.env.BOARD_APPLY_RESOLUTION = previous;
  }
}

async function main() {
  testParseAtsPosting();
  testWwrExtraction();
  await testResolveDestination();
  testCanonical();
  await testResolvePass();
  console.log("[board-apply-resolver] ATS parsing, board apply resolution, canonical promotion and bounds passed.");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
