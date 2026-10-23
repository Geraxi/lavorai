import assert from "node:assert/strict";
import { autoApplyPreferenceMismatch, homeCountries, locationPreferenceMismatch, remoteScopeFromDescription } from "../src/lib/auto-apply-preferences";
import { ashbyLocation, fetchAshbyJobs } from "../src/lib/scrapers/ashby";
import { seedCompanyCountry } from "../src/lib/scrapers/ats-companies";
import { quickMatchScore } from "../src/lib/match-score";
import { fetchWorkableAccountRaw } from "../src/lib/scrapers/workable";
import { fetchWorkableSearchJobs, sameWorkablePosting, workableSearchWheres, workableSlugCandidates } from "../src/lib/scrapers/workable-search";

// No network, no database: every fetch below is a local stub.

const loc = (location: string | null, remote = true, description = "") => ({ location, remote, description });
const jose = ["Remoto", "Philadelphia, PA USA"];
const matteo = ["Losine", "Brescia", "Iseo", "Rezzato", "Gussago"];

function testHomeCountries() {
  assert.deepEqual(homeCountries(jose), ["US"]);
  assert.deepEqual(homeCountries(matteo), ["IT"]);
  assert.deepEqual(homeCountries(["Remoto"]), []);
  assert.deepEqual(homeCountries(["Losine"]), [], "Unknown towns add no country");
}

function testBareRemoteIsRemoteFromHome() {
  // PostHog on Ashby: "Remote", country "US | EU", secondary "Remote, USA".
  assert.equal(locationPreferenceMismatch(loc("Remote · US | EU · USA"), jose), null, "US-open remote is eligible for a US user who chose Remote");
  assert.equal(locationPreferenceMismatch(loc("Remote · United States"), jose), null);
  assert.equal(locationPreferenceMismatch(loc("Remote · EMEA"), jose), "location", "EMEA-only stays ineligible for a US user");
  assert.equal(locationPreferenceMismatch(loc("Remote · Canada"), jose), "location");
  assert.equal(locationPreferenceMismatch(loc("Remote · Remote"), jose), "location_unverified", "No scope evidence stays unverified");
  // Bare "Remote" + curated EU board country (seedCompanyCountry) → remote from the EU.
  {
    const it = ["Milano", "Roma", "Remoto"];
    assert.equal(seedCompanyCountry("ashby", "lexroom"), "IT");
    assert.equal(seedCompanyCountry("ashby", "LEXROOM"), "IT", "Slug lookup is case-insensitive");
    assert.equal(seedCompanyCountry("ashby", "some-discovered-tenant"), null);
    assert.equal(locationPreferenceMismatch(loc("Remote"), it, { companyCountry: "IT" }), null, "Italian board, Italian remote user");
    assert.equal(locationPreferenceMismatch(loc("Remote"), it, { companyCountry: "DE" }), null, "EU board, EU remote user");
    assert.equal(locationPreferenceMismatch(loc("Remote"), it, { companyCountry: "EU" }), null);
    assert.equal(locationPreferenceMismatch(loc("Remote"), it, { companyCountry: "US" }), "location_unverified", "US board stays unverified");
    assert.equal(locationPreferenceMismatch(loc("Remote"), it, { companyCountry: "UK" }), "location_unverified", "Non-EU Europe stays unverified");
    assert.equal(locationPreferenceMismatch(loc("Remote"), it), "location_unverified", "No country signal → unverified");
    assert.equal(locationPreferenceMismatch(loc("Remote"), ["Milano"], { companyCountry: "IT" }), "location_unverified", "Only users who want remote");
    assert.equal(locationPreferenceMismatch(loc("Remote"), ["Milano"], { companyCountry: "IT", acceptsRemote: true }), null, "Remote work mode counts");
    assert.equal(locationPreferenceMismatch(loc("Remote"), jose, { companyCountry: "DE" }), "location_unverified", "US user: EU board is no signal");
    assert.equal(locationPreferenceMismatch(loc("Remote", true, "Candidates must be based in the US."), it, { companyCountry: "DE" }), "location", "An explicit restriction still wins");
    assert.equal(locationPreferenceMismatch(loc("Remote · United States"), it, { companyCountry: "DE" }), "location", "A stated region still wins");
    const base = { title: "Full-Stack Engineer", contractType: null, description: "", salaryMin: null, salaryMax: null, location: "Remote", remote: true };
    assert.equal(autoApplyPreferenceMismatch({ ...base, source: "ashby", sourceSlug: "lexroom" }, { employmentType: "both", salaryMin: 0, sourcesJson: '["remoto"]' }, it), null);
    assert.equal(autoApplyPreferenceMismatch({ ...base, source: "ashby", sourceSlug: "elevenlabs" }, { employmentType: "both", salaryMin: 0, sourcesJson: '["remoto"]' }, it), "location_unverified");
  }
  // Alan on Workable: "Anywhere in France · France" is France-only, not worldwide.
  const owner = ["Milano", "Roma", "Remoto"];
  assert.equal(locationPreferenceMismatch(loc("Anywhere in France · France"), owner), "location", "Country-scoped anywhere is not worldwide");
  assert.equal(locationPreferenceMismatch(loc("Anywhere in Belgium · Belgium", false), owner), "location");
  assert.equal(locationPreferenceMismatch(loc("Anywhere in Italy · Italy"), owner), null, "Anywhere in the home country stays eligible");
  assert.equal(locationPreferenceMismatch(loc("Remote, Global"), owner), null, "Global remote stays eligible");
  assert.equal(locationPreferenceMismatch(loc("Anywhere"), owner), null, "Bare anywhere stays worldwide");
  assert.equal(locationPreferenceMismatch(loc("Remote · Anywhere in the World"), owner), null, "Anywhere in the world stays worldwide");
  assert.equal(locationPreferenceMismatch(loc("Anywhere in France, Belgium, Spain · European Union", false), owner), "location", "Listed countries scope the job; the EU rollup does not widen it");
  assert.equal(locationPreferenceMismatch(loc("Anywhere in Italy, Spain · European Union", false), owner), null);
  assert.equal(locationPreferenceMismatch(loc("Anywhere in Europe · Europe", false), owner), null);
  assert.equal(locationPreferenceMismatch(loc("Remote · US"), ["Remote"]), "location", "Bare Remote without a home country never satisfies a region");
  // Region stated in the posting text for a bare "Remote" field.
  assert.equal(locationPreferenceMismatch(loc("Remote", true, "This is a remote (US only) position."), jose), null);
  assert.equal(locationPreferenceMismatch(loc("Remote", true, "We hire anywhere in the US"), jose), null);
  assert.equal(locationPreferenceMismatch(loc("Remote", true, "Candidates must be based in the US"), jose), null, "Explicit eligibility sentence naming the user's country");
  assert.equal(locationPreferenceMismatch(loc("Remote", true, "Candidates must be based in Germany"), jose), "location");
  assert.equal(locationPreferenceMismatch(loc("Remote", true, "Remote - EU. Join our team"), jose), "location", "EU-scoped remote is not eligible for a US user");
  assert.equal(locationPreferenceMismatch(loc("Remote", true, "Come build with us. Tell us about you."), jose), "location_unverified", "The pronoun 'us' is not the country");
  assert.equal(locationPreferenceMismatch(loc("Remote", true, "You can work from anywhere in the world."), jose), null, "Explicitly worldwide");
  assert.equal(locationPreferenceMismatch(loc("Remote", true, "We serve customers worldwide."), jose), "location_unverified", "Customer reach is not hiring scope");
  assert.equal(locationPreferenceMismatch(loc("Remote", true, "Work from anywhere in the US or Canada"), jose), null, "Region beats the worldwide phrase");
  assert.equal(locationPreferenceMismatch(loc("Remote", true, "Work from anywhere in the EU"), jose), "location");
}

function testTitleBasedPlace() {
  const agoda = { location: "Milan, Lombardy, Italy", remote: false, description: "", title: "Senior Product Designer - Flights (Bangkok - Based, Relocation Provided)" };
  assert.equal(locationPreferenceMismatch(agoda, ["Rome", "Remoto", "Milan"]), "location", "Title says Bangkok-based");
  assert.equal(locationPreferenceMismatch({ ...agoda, title: "Product Designer (Milan-based)" }, ["Milan"]), null);
  assert.equal(locationPreferenceMismatch({ location: "United States", remote: true, title: "Motion Designer (US-based)" }, jose), null);
  assert.equal(locationPreferenceMismatch({ location: "Remote · Europe", remote: true, title: "Senior Designer, London-based" }, ["Remote (EU)"]), "location");
  assert.equal(locationPreferenceMismatch({ ...agoda, title: "Product Designer" }, ["Milan"]), null, "No based-in phrase: unchanged");
}

function testScopeParser() {
  assert.deepEqual(remoteScopeFromDescription("Remote (US)").regions, ["us"]);
  assert.deepEqual(remoteScopeFromDescription("EU-based applicants").regions, ["eu"]);
  assert.deepEqual(remoteScopeFromDescription("Tell us more").regions, []);
  assert.equal(remoteScopeFromDescription("Remote - worldwide").worldwide, true);
}

function testCitySegmentPreference() {
  assert.equal(locationPreferenceMismatch(loc("Philadelphia, Pennsylvania, United States", false), jose), null, "City part of 'Philadelphia, PA USA' matches");
  assert.equal(locationPreferenceMismatch(loc("Pittsburgh, PA", false), jose), "location");
  assert.equal(locationPreferenceMismatch(loc("New York, NY", false), jose), "location", "A US city is not 'remote from the US'");
}

function testRemoteWorkModeForTownPrefs() {
  // Unchanged without the work-mode signal.
  assert.equal(locationPreferenceMismatch(loc("Remote · Italy"), matteo), "location");
  assert.equal(locationPreferenceMismatch(loc("EMEA"), matteo), "location");
  const remoteOk = { acceptsRemote: true };
  assert.equal(locationPreferenceMismatch(loc("Remote · Italy"), matteo, remoteOk), null, "User picked 'remoto': remote open to Italy");
  assert.equal(locationPreferenceMismatch(loc("Remote · EMEA"), matteo, remoteOk), null);
  assert.equal(locationPreferenceMismatch(loc("Remote · United States"), matteo, remoteOk), "location");
  assert.equal(locationPreferenceMismatch(loc("Milan, Italy", false), matteo, remoteOk), "location", "On-site elsewhere is still not a commute town");
  assert.equal(locationPreferenceMismatch(loc("Remote · Italy"), ["Losine"], remoteOk), "location", "No known home country → no remote scope");
  const job = { ...loc("Remote · Italy"), title: "Graphic Designer", contractType: null, salaryMin: null, salaryMax: null };
  assert.equal(autoApplyPreferenceMismatch(job, { employmentType: "employee", salaryMin: 25, sourcesJson: '["remoto","ibrido","sede"]' }, matteo), null);
  assert.equal(autoApplyPreferenceMismatch(job, { employmentType: "employee", salaryMin: 25, sourcesJson: '["sede"]' }, matteo), "location");
  assert.equal(autoApplyPreferenceMismatch(job, { employmentType: "employee", salaryMin: 25 }, matteo), "location");
}

function testBareRemoteJobVariations() {
  // "Remote · Remote job" or "Remote, Remote" should be treated as bare "Remote" (scope unverified).
  assert.equal(locationPreferenceMismatch(loc("Remote · Remote job"), jose), "location_unverified", "Remote job suffix: scope unverified");
  assert.equal(locationPreferenceMismatch(loc("Remote, Remote"), jose), "location_unverified", "Duplicate Remote: scope unverified");
  assert.equal(locationPreferenceMismatch(loc("Remote, Remote job"), jose), "location_unverified");
  // With a curated board country, these should resolve the same as bare "Remote".
  assert.equal(locationPreferenceMismatch(loc("Remote · Remote job"), ["Milano", "Remoto"], { companyCountry: "IT" }), null, "Italian board + remote user");
  assert.equal(locationPreferenceMismatch(loc("Remote, Remote"), ["Milano", "Remoto"], { companyCountry: "IT" }), null);
}

function testCountryWideListingMatchesCityPreference() {
  // A country-wide listing ("Italia", "Italy") should match users who chose Italian cities.
  assert.equal(locationPreferenceMismatch(loc("Italia", false), matteo), null, "Italia matches Italian city preferences");
  assert.equal(locationPreferenceMismatch(loc("Italy", false), matteo), null, "Italy (English) matches Italian city preferences");
  assert.equal(locationPreferenceMismatch(loc("United States", false), jose), null, "United States matches US city Philadelphia");
  assert.equal(locationPreferenceMismatch(loc("USA", false), jose), null, "USA matches US city");
  // Should not match cities from other countries.
  assert.equal(locationPreferenceMismatch(loc("France", false), matteo), "location", "French listing does not match Italian cities");
  assert.equal(locationPreferenceMismatch(loc("Germany", false), matteo), "location", "German listing does not match Italian cities");
  // Remote preferences should still require remote flag or work mode.
  assert.equal(locationPreferenceMismatch(loc("Italia", false), ["Remoto"]), "location", "Country listing without remote flag does not match bare Remote preference");
  // Remote + country listing will match if user has the city preference and acceptsRemote.
  assert.equal(locationPreferenceMismatch(loc("Italia", true), matteo, { acceptsRemote: true }), null, "Remote Italy matches Italian cities with remote work mode");
}

function testAshbyLocation() {
  assert.equal(ashbyLocation({
    location: "Remote",
    address: { postalAddress: { addressCountry: "US | EU" } },
    secondaryLocations: [{ location: "Remote", address: { postalAddress: { addressCountry: "USA" } } }],
  }), "Remote · US | EU · USA");
  assert.equal(ashbyLocation({ location: "San Francisco" }), "San Francisco");
  assert.equal(ashbyLocation({ location: null }), null);
  assert.equal(ashbyLocation({ location: "New York City", address: { postalAddress: { addressCountry: "United States" } }, secondaryLocations: [{ location: "Remote (United States)" }] }), "New York City · United States · Remote (United States)");
}

function testWorkableHelpers() {
  assert(workableSlugCandidates("Moneyfarm").includes("moneyfarm"));
  assert(workableSlugCandidates("TP-Link Systems Inc.").includes("tp-link-systems"));
  assert(workableSlugCandidates("Sand Cherry Associates", "http://sandcherryassociates.com").includes("sandcherryassociates"));
  assert(workableSlugCandidates("A".repeat(3)).length <= 5);
  const hit = { id: "x", title: "Motion Designer", location: { city: "", countryName: "United States" } };
  assert.equal(sameWorkablePosting(hit, { title: "Motion  designer", location: { country: "United States" } }), true);
  assert.equal(sameWorkablePosting(hit, { title: "Motion Designer", location: { country: "Canada" } }), false);
  assert.equal(sameWorkablePosting(hit, { title: "Senior Motion Designer", location: { country: "United States" } }), false);
  assert.deepEqual(workableSearchWheres(jose, ["remoto", "ibrido"]), ["Philadelphia", "United States"]);
  assert.deepEqual(workableSearchWheres(matteo, ["remoto", "ibrido", "sede"]), [...matteo, "Italy"]);
  assert.deepEqual(workableSearchWheres(matteo, ["sede"]), matteo);
}

async function testWorkableSearch() {
  const requested: string[] = [];
  const fetchImpl = (async (url: string) => {
    requested.push(url);
    const u = new URL(url);
    assert.equal(u.host, "jobs.workable.com");
    assert.equal(u.pathname, "/api/v1/jobs");
    return { ok: true, status: 200, json: async () => ({ jobs: [
      { id: "1", title: "Motion Designer", description: "<p>Remote in the US. Candidates must be based in the US.</p>", location: { city: "", countryName: "United States" }, company: { id: "c1", title: "Acme Studio", website: "https://acme.example" } },
      { id: "2", title: "Account Manager", location: { countryName: "United States" }, company: { id: "c1", title: "Acme Studio" } },
      { id: "3", title: "Motion Designer", location: { countryName: "United States" }, company: { id: "c2", title: "Ghost Co" } },
    ] }) };
  }) as unknown as typeof fetch;
  const feeds: Record<string, unknown[] | null> = {
    "acme-studio": null,
    acmestudio: [
      { shortcode: "AB12CD34EF", title: "Motion Designer", remote: true, location: { country: "United States" } },
      { shortcode: "ZZ99", title: "Office Manager", remote: true, location: { country: "United States" } },
    ],
    "ghost-co": [{ shortcode: "Q1", title: "Something else", location: { country: "United States" } }],
  };
  const probed: string[] = [];
  const { items, stats } = await fetchWorkableSearchJobs([{ what: "Motion Designer", where: "United States" }], {
    fetchImpl, accountFeed: async (slug) => { probed.push(slug); return (feeds[slug] ?? null) as never; }, concurrency: 1,
    requireItalianJobs: false,
  });
  assert.equal(requested.length, 1);
  assert.equal(stats.companies, 2, "Non-matching titles are dropped before resolution");
  assert.equal(stats.resolved, 1);
  assert.equal(stats.unresolved, 1, "A company whose feed lacks the posting is skipped");
  const motion = items.find((i) => i.externalId === "AB12CD34EF");
  assert(motion, "Canonical posting from the verified account");
  assert.equal(motion.url, "https://apply.workable.com/acmestudio/j/AB12CD34EF/");
  assert.equal(motion.source, "workable");
  assert.equal(motion.location, "United States");
  assert.match(motion.description, /Candidates must be based in the US/);
  assert(items.some((i) => i.externalId === "ZZ99"), "Whole account feed is returned (board close stays consistent)");
  assert(!items.some((i) => (i as { sourceSlug?: string }).sourceSlug === "ghost-co"));
  assert(probed.length <= 10);
  // The canonical row passes the location gate for Jose and fails for Matteo.
  assert.equal(locationPreferenceMismatch(motion, jose), null);
  assert.equal(locationPreferenceMismatch(motion, matteo, { acceptsRemote: true }), "location");
}

async function testAshbyRemoteFlag() {
  const original = globalThis.fetch;
  globalThis.fetch = (async () => ({ ok: true, status: 200, json: async () => ({ jobs: [
    { id: "a", title: "Motion Designer, Business Marketing", location: "San Francisco", isRemote: true, workplaceType: "Hybrid", jobUrl: "https://jobs.ashbyhq.com/openai/a",
      address: { postalAddress: { addressCountry: "United States", addressLocality: "San Francisco" } }, secondaryLocations: [] },
    { id: "b", title: "Motion Designer", location: "New York City", isRemote: true, workplaceType: "Hybrid", jobUrl: "https://jobs.ashbyhq.com/perplexity/b",
      address: { postalAddress: { addressCountry: "United States" } }, secondaryLocations: [{ location: "Remote (United States)" }] },
    { id: "c", title: "Animator", location: "Remote", isRemote: true, workplaceType: "Remote", jobUrl: "https://jobs.ashbyhq.com/posthog/c",
      address: { postalAddress: { addressCountry: "US | EU" } } },
  ] }) })) as unknown as typeof fetch;
  try {
    const jobs = await fetchAshbyJobs("x", "X");
    const byId = new Map(jobs.map((j) => [j.externalId, j]));
    assert.equal(byId.get("a")?.remote, false, "Hybrid posting is not remote even with isRemote=true");
    assert.equal(byId.get("b")?.remote, true, "Hybrid with a Remote (United States) option is remote");
    assert.equal(byId.get("c")?.remote, true);
    assert.equal(locationPreferenceMismatch(byId.get("a")!, jose), "location", "SF hybrid is not remote-from-Philadelphia");
    assert.equal(locationPreferenceMismatch(byId.get("b")!, jose), null);
    assert.equal(locationPreferenceMismatch(byId.get("c")!, jose), null);
  } finally {
    globalThis.fetch = original;
  }
}

async function testWorkablePagination() {
  const original = globalThis.fetch;
  const bodies: string[] = [];
  let failSecond = false;
  globalThis.fetch = (async (_url: string, init: { body: string }) => {
    bodies.push(init.body);
    const token = JSON.parse(init.body).token;
    if (token && failSecond) return { ok: false, status: 500, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => token
      ? { results: [{ shortcode: "B", title: "Two" }], nextPage: null }
      : { results: [{ shortcode: "A", title: "One" }], nextPage: "tok" } };
  }) as unknown as typeof fetch;
  try {
    const all = await fetchWorkableAccountRaw("acme");
    assert.deepEqual(all?.map((j) => j.shortcode), ["A", "B"], "Second page is read");
    assert.equal(JSON.parse(bodies[1]).token, "tok");
    failSecond = true;
    assert.equal(await fetchWorkableAccountRaw("acme"), null, "A failed later page is not a complete feed");
  } finally {
    globalThis.fetch = original;
  }
}

function testRoleTitleBoost() {
  const profile = { title: "Motion Designer", summary: "", experiences: [], skills: [{ name: "After Effects" }, { name: "Cinema 4D" }, { name: "Storyboarding" }] } as never;
  assert(quickMatchScore(profile, "Animator & Motion Graphics Designer\nPostHog\nWe are remote.") >= 55, "Role tokens in the job title count as the role");
  assert(quickMatchScore(profile, "Senior Motion Designer\nAcme\n") >= 55, "Exact phrase still boosts");
  assert(quickMatchScore(profile, "Product Designer\nAcme\nMotion is our product.") < 50, "Missing role token: no boost");
}

async function main() {
  testHomeCountries();
  testRoleTitleBoost();
  testBareRemoteIsRemoteFromHome();
  testScopeParser();
  testTitleBasedPlace();
  testCitySegmentPreference();
  testRemoteWorkModeForTownPrefs();
  testBareRemoteJobVariations();
  testCountryWideListingMatchesCityPreference();
  testAshbyLocation();
  testWorkableHelpers();
  await testWorkableSearch();
  await testWorkablePagination();
  await testAshbyRemoteFlag();
  console.log("PASS remote scope from home country, posting scope, work-mode remote, bare remote variations, country-wide listings, Ashby structured location, Workable search resolution and paging");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
