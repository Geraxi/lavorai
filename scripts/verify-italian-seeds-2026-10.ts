/**
 * Verification script for Italian ATS seeds added 2026-10.
 * Verifies the 'A' confidence seeds from the Italian ATS research.
 * 
 * Run with: npx tsx scripts/verify-italian-seeds-2026-10.ts
 */

const UA = "Mozilla/5.0 (compatible; LavorAI-Verify/1.0; +https://lavorai.it)";

interface CheckResult {
  slug: string;
  ats: string;
  name: string;
  status: number;
  ok: boolean;
  jobCount?: number;
  italianJobCount?: number;
  error?: string;
}

async function checkAshby(slug: string, name: string): Promise<CheckResult> {
  const url = `https://jobs.ashbyhq.com/${encodeURIComponent(slug)}`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(15000),
    });
    const status = res.status;
    if (!res.ok) {
      return { slug, ats: "ashby", name, status, ok: false, error: `HTTP ${status}` };
    }
    const html = await res.text();
    // Count Italian location mentions
    const italianMatches = html.match(/\b(Milan[oa]?|Rome|Roma|Turin|Torino|Bologna|Florence|Firenze|Naples|Napoli|Italy|Italia)\b/gi);
    const italianJobCount = italianMatches ? italianMatches.length : 0;
    return { slug, ats: "ashby", name, status, ok: italianJobCount >= 1, jobCount: -1, italianJobCount };
  } catch (err) {
    return { slug, ats: "ashby", name, status: 0, ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function checkLever(slug: string, name: string): Promise<CheckResult> {
  const url = `https://api.lever.co/v0/postings/${encodeURIComponent(slug)}?mode=json`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: AbortSignal.timeout(15000),
    });
    const status = res.status;
    if (!res.ok) {
      return { slug, ats: "lever", name, status, ok: false, error: `HTTP ${status}` };
    }
    const data = (await res.json()) as Array<{ categories?: { location?: string } }>;
    const jobs = Array.isArray(data) ? data : [];
    const italianJobs = jobs.filter((j) => {
      const loc = (j.categories?.location ?? "").toLowerCase();
      return loc.includes("italy") || loc.includes("italia") || loc.includes("milan") || loc.includes("rome");
    });
    return { slug, ats: "lever", name, status, ok: true, jobCount: jobs.length, italianJobCount: italianJobs.length };
  } catch (err) {
    return { slug, ats: "lever", name, status: 0, ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function checkRecruitee(slug: string, name: string): Promise<CheckResult> {
  const url = `https://${encodeURIComponent(slug)}.recruitee.com/api/offers/`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: AbortSignal.timeout(15000),
    });
    const status = res.status;
    if (!res.ok) {
      return { slug, ats: "recruitee", name, status, ok: false, error: `HTTP ${status}` };
    }
    const data = (await res.json()) as { offers?: Array<{ country?: string; city?: string }> };
    const jobs = Array.isArray(data.offers) ? data.offers : [];
    const italianJobs = jobs.filter((j) => {
      const country = (j.country ?? "").toLowerCase();
      const city = (j.city ?? "").toLowerCase();
      return country === "italy" || country === "italia" || city.includes("milan") || city.includes("rome");
    });
    return { slug, ats: "recruitee", name, status, ok: true, jobCount: jobs.length, italianJobCount: italianJobs.length };
  } catch (err) {
    return { slug, ats: "recruitee", name, status: 0, ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function checkSmartRecruiters(slug: string, name: string): Promise<CheckResult> {
  const url = `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(slug)}/postings`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: AbortSignal.timeout(15000),
    });
    const status = res.status;
    if (!res.ok) {
      return { slug, ats: "smartrecruiters", name, status, ok: false, error: `HTTP ${status}` };
    }
    const data = (await res.json()) as { content?: Array<{ location?: { country?: string; city?: string } }> };
    const jobs = Array.isArray(data.content) ? data.content : [];
    const italianJobs = jobs.filter((j) => {
      const country = (j.location?.country ?? "").toLowerCase();
      const city = (j.location?.city ?? "").toLowerCase();
      return country === "italy" || country === "italia" || city.includes("milan") || city.includes("rome");
    });
    return { slug, ats: "smartrecruiters", name, status, ok: true, jobCount: jobs.length, italianJobCount: italianJobs.length };
  } catch (err) {
    return { slug, ats: "smartrecruiters", name, status: 0, ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function checkTeamtailor(slug: string, name: string): Promise<CheckResult> {
  const url = `https://${encodeURIComponent(slug)}.teamtailor.com/jobs.json`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: AbortSignal.timeout(15000),
    });
    const status = res.status;
    if (!res.ok) {
      return { slug, ats: "teamtailor", name, status, ok: false, error: `HTTP ${status}` };
    }
    const data = (await res.json()) as { items?: Array<{ content_html?: string; title?: string }> };
    const jobs = Array.isArray(data.items) ? data.items : [];
    const italianJobs = jobs.filter((j) => {
      const content = ((j.content_html ?? "") + (j.title ?? "")).toLowerCase();
      return content.includes("italy") || content.includes("italia") || content.includes("milan") || content.includes("rome");
    });
    return { slug, ats: "teamtailor", name, status, ok: true, jobCount: jobs.length, italianJobCount: italianJobs.length };
  } catch (err) {
    return { slug, ats: "teamtailor", name, status: 0, ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function checkBambooHR(slug: string, name: string): Promise<CheckResult> {
  const url = `https://${encodeURIComponent(slug)}.bamboohr.com/careers/list`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(15000),
    });
    const status = res.status;
    if (!res.ok) {
      return { slug, ats: "bamboohr", name, status, ok: false, error: `HTTP ${status}` };
    }
    const html = await res.text();
    const italianMatches = html.match(/\b(Milan[oa]?|Rome|Roma|Turin|Torino|Bologna|Florence|Firenze|Naples|Napoli|Italy|Italia)\b/gi);
    const italianJobCount = italianMatches ? italianMatches.length : 0;
    return { slug, ats: "bamboohr", name, status, ok: italianJobCount >= 1, jobCount: -1, italianJobCount };
  } catch (err) {
    return { slug, ats: "bamboohr", name, status: 0, ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function checkWorkable(slug: string, name: string): Promise<CheckResult> {
  const url = `https://apply.workable.com/api/v1/widget/accounts/${encodeURIComponent(slug)}`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: AbortSignal.timeout(15000),
    });
    const status = res.status;
    if (!res.ok) {
      return { slug, ats: "workable", name, status, ok: false, error: `HTTP ${status}` };
    }
    const data = (await res.json()) as { jobs?: Array<{ country?: string }> };
    const jobs = Array.isArray(data.jobs) ? data.jobs : [];
    const italianJobs = jobs.filter((j) => {
      const country = (j.country ?? "").toLowerCase();
      return country === "italy" || country === "italia" || country === "it";
    });
    return { slug, ats: "workable", name, status, ok: true, jobCount: jobs.length, italianJobCount: italianJobs.length };
  } catch (err) {
    return { slug, ats: "workable", name, status: 0, ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

const NEW_SEEDS = [
  { ats: "ashby", slug: "lexroom", name: "Lexroom", expectedMin: 2 },
  { ats: "lever", slug: "octoenergy", name: "Octopus Energy", expectedMin: 2 },
  { ats: "recruitee", slug: "boggimilano1", name: "Boggi Milano", expectedMin: 2 },
  { ats: "recruitee", slug: "jobsdeerns", name: "Deerns Italia", expectedMin: 2 },
  { ats: "smartrecruiters", slug: "Santen", name: "Santen", expectedMin: 2 },
  { ats: "teamtailor", slug: "nidec", name: "Nidec Conversion", expectedMin: 2 },
  { ats: "teamtailor", slug: "obicamozzarellabar", name: "Obicà", expectedMin: 2 },
  { ats: "teamtailor", slug: "clubdelsolesrl", name: "Club del Sole", expectedMin: 2 },
  { ats: "teamtailor", slug: "oneexpressitaliaspa", name: "One Express Italia", expectedMin: 2 },
  { ats: "teamtailor", slug: "unobravo", name: "Unobravo", expectedMin: 2 },
  { ats: "teamtailor", slug: "meatcrew", name: "Meat Crew", expectedMin: 2 },
  { ats: "teamtailor", slug: "swegonitaly", name: "Swegon Italy", expectedMin: 2 },
  { ats: "bamboohr", slug: "talentgarden", name: "Talent Garden", expectedMin: 2 },
  { ats: "workable", slug: "cleafy", name: "Cleafy", expectedMin: 2 },
];

async function main() {
  console.log("=== Verification of Italian ATS Seeds (2026-10) ===\n");
  console.log("Checking 14 'A' confidence seeds from Italian ATS research\n");

  const results: CheckResult[] = [];
  
  for (const seed of NEW_SEEDS) {
    process.stdout.write(`Checking ${seed.ats}/${seed.slug} (${seed.name})... `);
    
    let result: CheckResult;
    switch (seed.ats) {
      case "ashby":
        result = await checkAshby(seed.slug, seed.name);
        break;
      case "lever":
        result = await checkLever(seed.slug, seed.name);
        break;
      case "recruitee":
        result = await checkRecruitee(seed.slug, seed.name);
        break;
      case "smartrecruiters":
        result = await checkSmartRecruiters(seed.slug, seed.name);
        break;
      case "teamtailor":
        result = await checkTeamtailor(seed.slug, seed.name);
        break;
      case "bamboohr":
        result = await checkBambooHR(seed.slug, seed.name);
        break;
      case "workable":
        result = await checkWorkable(seed.slug, seed.name);
        break;
      default:
        throw new Error(`Unknown ATS: ${seed.ats}`);
    }
    
    results.push(result);
    
    const meetsCriteria = result.ok && (result.italianJobCount ?? 0) >= seed.expectedMin;
    if (meetsCriteria) {
      console.log(`✓ OK (${result.italianJobCount} IT jobs)`);
    } else if (!result.ok) {
      console.log(`✗ ${result.error}`);
    } else {
      console.log(`✗ Only ${result.italianJobCount} IT jobs (expected ≥${seed.expectedMin})`);
    }
    
    await new Promise((r) => setTimeout(r, 800));
  }

  console.log("\n=== SUMMARY ===\n");
  
  const verified = results.filter((r) => r.ok && (r.italianJobCount ?? 0) >= 2);
  const failed = results.filter((r) => !r.ok || (r.italianJobCount ?? 0) < 2);
  
  console.log(`Verified: ${verified.length}/${results.length}`);
  verified.forEach((r) => console.log(`  ✓ ${r.ats}/${r.slug} - ${r.name} (${r.italianJobCount} IT jobs)`));
  
  if (failed.length > 0) {
    console.log(`\nFailed: ${failed.length}/${results.length}`);
    failed.forEach((r) => console.log(`  ✗ ${r.ats}/${r.slug} - ${r.name} (${r.error || `only ${r.italianJobCount} jobs`})`));
  }
  
  console.log(`\n${verified.length === results.length ? "✅ All seeds verified!" : "⚠️  Some seeds failed verification"}`);
  
  process.exit(verified.length === results.length ? 0 : 1);
}

main().catch(console.error);
