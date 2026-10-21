import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { descriptionFromDetail, fetchPostingDescription, fillMissingDescriptions, jobPostingLdDescription, postingDescriptionUrl } from "../src/lib/scrapers/posting-description";
import { fetchSmartRecruitersJobs } from "../src/lib/scrapers/smartrecruiters";
import { fetchBreezyJobs } from "../src/lib/scrapers/breezy";
import { fetchWorkableJobs } from "../src/lib/scrapers/workable";

// No network: every fetch is a local stub serving the fixtures below.
const fx = (f: string) => readFileSync(`scripts/fixtures/posting-description/${f}`, "utf8");
const WK = fx("workable-detail.json"), SR = fx("smartrecruiters-detail.json"), BZ = fx("breezy-posting.html");
const ok = (body: string, type = "application/json") => new Response(body, { status: 200, headers: { "content-type": type } });

async function main() {
  // Detail URLs per board.
  assert.equal(postingDescriptionUrl({ source: "workable", url: "https://apply.workable.com/treatwell/j/AB3B06F361/", externalId: "AB3B06F361", sourceSlug: "treatwell" }),
    "https://apply.workable.com/api/v2/accounts/treatwell/jobs/AB3B06F361");
  assert.equal(postingDescriptionUrl({ source: "smartrecruiters", url: "https://jobs.smartrecruiters.com/Santen/744000156288089", externalId: "744000156288089", sourceSlug: null }),
    "https://api.smartrecruiters.com/v1/companies/Santen/postings/744000156288089");
  assert.equal(postingDescriptionUrl({ source: "breezy", url: "https://zact-inc.breezy.hr/p/7a8e-architect?x=1", externalId: "7a8e", sourceSlug: "zact-inc" }), "https://zact-inc.breezy.hr/p/7a8e-architect");
  assert.equal(postingDescriptionUrl({ source: "breezy", url: "https://evil.example/p/1", externalId: "1" }), null, "Only the board's own host");
  assert.equal(postingDescriptionUrl({ source: "greenhouse", url: "https://boards.greenhouse.io/x/jobs/1", externalId: "1" }), null);

  // Parsing.
  const wk = descriptionFromDetail("workable", WK)!;
  assert.ok(wk.includes("TypeScript & React") && wk.includes("Node.js") && wk.includes("Remote days") && !wk.includes("<"), wk);
  const sr = descriptionFromDetail("smartrecruiters", SR)!;
  assert.ok(sr.includes("Build Python APIs") && sr.includes("Django") && sr.includes("Hybrid in Amsterdam"));
  assert.ok(!sr.includes("boilerplate"), "Company boilerplate is not the job description");
  assert.ok(jobPostingLdDescription(BZ)?.includes("Position Overview"), "JobPosting block, not the Organization block");
  assert.ok(descriptionFromDetail("breezy", BZ)!.includes("Java & cloud-native"));
  assert.equal(descriptionFromDetail("workable", "not json"), null);
  assert.equal(descriptionFromDetail("breezy", "<html>no ld</html>"), null);
  assert.equal(descriptionFromDetail("workable", JSON.stringify({ description: "x".repeat(5000) }))!.length, 2000, "Same 2000-char cap as the other scrapers");

  // Failures are null, never throw.
  const ref = { source: "workable", url: "https://apply.workable.com/a/j/B/", externalId: "B", sourceSlug: "a" };
  assert.equal(await fetchPostingDescription(ref, { fetchImpl: async () => new Response("", { status: 404 }) }), null);
  assert.equal(await fetchPostingDescription(ref, { fetchImpl: async () => { throw new Error("timeout"); } }), null);

  // Bounded backfill: limit, only empty rows of supported boards, deadline.
  const calls: string[] = [];
  const stub = async (u: string) => { calls.push(u); return ok(WK); };
  const rows = Array.from({ length: 6 }, (_, i) => ({ ...ref, url: `https://apply.workable.com/a/j/C${i}/`, externalId: `C${i}`, description: "" }));
  rows.push({ source: "greenhouse", url: "https://boards.greenhouse.io/x/jobs/1", externalId: "g", sourceSlug: "x", description: "" });
  rows.push({ ...ref, description: "already there" });
  const filled = await fillMissingDescriptions(rows, { limit: 3, concurrency: 2, fetchImpl: stub });
  assert.equal(filled.length, 3); assert.equal(calls.length, 3, "Per-call cap");
  assert.ok(rows.slice(0, 3).every((r) => r.description.includes("TypeScript")) && rows[3].description === "");
  assert.equal(rows[7].description, "already there");
  calls.length = 0;
  assert.equal((await fillMissingDescriptions(rows, { limit: 10, fetchImpl: stub, deadline: Date.now() - 1 })).length, 0);
  assert.equal(calls.length, 0, "Nothing starts after the deadline");

  // Scrapers read the detail endpoint when the list has no description.
  const srJobs = await fetchSmartRecruitersJobs("Santen", "Santen", { fetchImpl: async (u: string) => u.includes("/postings?")
    ? ok(JSON.stringify({ content: [{ id: "744000156288089", name: "Backend Developer", location: { city: "Amsterdam", country: "nl" } }] }))
    : u.endsWith("/postings/744000156288089") ? ok(SR) : new Response("", { status: 404 }) });
  assert.equal(srJobs.length, 1); assert.ok(srJobs[0].description.includes("Django"));

  const bzJobs = await fetchBreezyJobs("zact-inc", "Zact", { fetchImpl: async (u: string) => u.endsWith("/json")
    ? ok(JSON.stringify([{ id: "7a8e", friendly_id: "7a8e-architect", name: "Software Architect", url: "https://zact-inc.breezy.hr/p/7a8e-architect", location: { name: "Milan", country: { name: "Italy" } } }]))
    : u === "https://zact-inc.breezy.hr/p/7a8e-architect" ? ok(BZ, "text/html") : new Response("", { status: 302 }) });
  assert.equal(bzJobs.length, 1); assert.ok(bzJobs[0].description.includes("Java"));

  const realFetch = globalThis.fetch;
  try {
    // fetchWorkableAccountRaw uses the global fetch for the account feed.
    globalThis.fetch = (async () => ok(JSON.stringify({ results: [{ shortcode: "AB3B06F361", title: "Fullstack Engineer", location: { city: "Berlin", country: "Germany" } }] }))) as typeof fetch;
    const wkJobs = await fetchWorkableJobs("treatwell", "Treatwell", { fetchImpl: async (u: string) => u.endsWith("/jobs/AB3B06F361") ? ok(WK) : new Response("", { status: 404 }) });
    assert.equal(wkJobs.length, 1); assert.ok(wkJobs[0].description.includes("PostgreSQL"));
  } finally { globalThis.fetch = realFetch; }
  console.log("PASS posting descriptions: Workable/SmartRecruiters/Breezy detail parsing, bounded backfill, scrapers fill empty descriptions");
}
main().catch((e) => { console.error(e); process.exit(1); });
