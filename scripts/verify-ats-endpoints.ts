/**
 * Verification script for ATS seed endpoints.
 * Checks whether the reported dead seeds are actually dead or alive,
 * and verifies new seeds before adding them.
 */

const UA = "Mozilla/5.0 (compatible; LavorAI-Verify/1.0; +https://lavorai.it)";

interface CheckResult {
  slug: string;
  ats: string;
  status: number;
  ok: boolean;
  jobCount?: number;
  italianJobCount?: number;
  error?: string;
}

async function checkGreenhouse(slug: string): Promise<CheckResult> {
  const url = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(slug)}/jobs?content=true`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: AbortSignal.timeout(15000),
    });
    const status = res.status;
    if (!res.ok) {
      return { slug, ats: "greenhouse", status, ok: false, error: `HTTP ${status}` };
    }
    const data = (await res.json()) as { jobs?: Array<{ location?: { name?: string } }> };
    const jobs = Array.isArray(data.jobs) ? data.jobs : [];
    const italianJobs = jobs.filter((j) => {
      const loc = (j.location?.name ?? "").toLowerCase();
      return loc.includes("italy") || loc.includes("italia") || loc.includes("milan") || loc.includes("rome") || loc.includes("remote");
    });
    return { slug, ats: "greenhouse", status, ok: true, jobCount: jobs.length, italianJobCount: italianJobs.length };
  } catch (err) {
    return { slug, ats: "greenhouse", status: 0, ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function checkLever(slug: string): Promise<CheckResult> {
  const url = `https://api.lever.co/v0/postings/${encodeURIComponent(slug)}?mode=json`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: AbortSignal.timeout(15000),
    });
    const status = res.status;
    if (!res.ok) {
      return { slug, ats: "lever", status, ok: false, error: `HTTP ${status}` };
    }
    const data = (await res.json()) as Array<{ categories?: { location?: string } }>;
    const jobs = Array.isArray(data) ? data : [];
    const italianJobs = jobs.filter((j) => {
      const loc = (j.categories?.location ?? "").toLowerCase();
      return loc.includes("italy") || loc.includes("italia") || loc.includes("milan") || loc.includes("rome") || loc.includes("remote");
    });
    return { slug, ats: "lever", status, ok: true, jobCount: jobs.length, italianJobCount: italianJobs.length };
  } catch (err) {
    return { slug, ats: "lever", status: 0, ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function checkWorkable(slug: string): Promise<CheckResult> {
  const url = `https://apply.workable.com/api/v1/widget/accounts/${encodeURIComponent(slug)}`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: AbortSignal.timeout(15000),
    });
    const status = res.status;
    if (!res.ok) {
      return { slug, ats: "workable", status, ok: false, error: `HTTP ${status}` };
    }
    const data = (await res.json()) as { jobs?: Array<{ country?: string }> };
    const jobs = Array.isArray(data.jobs) ? data.jobs : [];
    const italianJobs = jobs.filter((j) => {
      const country = (j.country ?? "").toLowerCase();
      return country === "italy" || country === "italia" || country === "it";
    });
    return { slug, ats: "workable", status, ok: true, jobCount: jobs.length, italianJobCount: italianJobs.length };
  } catch (err) {
    return { slug, ats: "workable", status: 0, ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function checkRecruitee(slug: string): Promise<CheckResult> {
  const url = `https://${encodeURIComponent(slug)}.recruitee.com/api/offers/`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: AbortSignal.timeout(15000),
    });
    const status = res.status;
    if (!res.ok) {
      return { slug, ats: "recruitee", status, ok: false, error: `HTTP ${status}` };
    }
    const data = (await res.json()) as { offers?: Array<{ country?: string; city?: string }> };
    const jobs = Array.isArray(data.offers) ? data.offers : [];
    const italianJobs = jobs.filter((j) => {
      const country = (j.country ?? "").toLowerCase();
      const city = (j.city ?? "").toLowerCase();
      return country === "italy" || country === "italia" || city.includes("milan") || city.includes("rome");
    });
    return { slug, ats: "recruitee", status, ok: true, jobCount: jobs.length, italianJobCount: italianJobs.length };
  } catch (err) {
    return { slug, ats: "recruitee", status: 0, ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function checkSmartRecruiters(slug: string): Promise<CheckResult> {
  const url = `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(slug)}/postings`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: AbortSignal.timeout(15000),
    });
    const status = res.status;
    if (!res.ok) {
      return { slug, ats: "smartrecruiters", status, ok: false, error: `HTTP ${status}` };
    }
    const data = (await res.json()) as { content?: Array<{ location?: { country?: string; city?: string } }> };
    const jobs = Array.isArray(data.content) ? data.content : [];
    const italianJobs = jobs.filter((j) => {
      const country = (j.location?.country ?? "").toLowerCase();
      const city = (j.location?.city ?? "").toLowerCase();
      return country === "italy" || country === "italia" || city.includes("milan") || city.includes("rome");
    });
    return { slug, ats: "smartrecruiters", status, ok: true, jobCount: jobs.length, italianJobCount: italianJobs.length };
  } catch (err) {
    return { slug, ats: "smartrecruiters", status: 0, ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function main() {
  console.log("=== Verification of ATS Seeds ===\n");

  console.log("--- REPORTED DEAD SEEDS (re-verify) ---\n");

  console.log("Greenhouse Italian seeds (reported 404):");
  for (const slug of ["satispay", "bendingspoons", "scalapay", "casavo", "moneyfarm", "docebo", "everli", "treatwell", "nexi", "prima"]) {
    const result = await checkGreenhouse(slug);
    console.log(`  ${slug}: ${result.ok ? `✓ OK (${result.jobCount} jobs, ${result.italianJobCount} Italian)` : `✗ ${result.error}`}`);
    await new Promise((r) => setTimeout(r, 500));
  }

  console.log("\nLever seeds (reported 404):");
  for (const slug of ["mollie", "pleo", "spendesk", "glovo", "factorial"]) {
    const result = await checkLever(slug);
    console.log(`  ${slug}: ${result.ok ? `✓ OK (${result.jobCount} jobs, ${result.italianJobCount} Italian)` : `✗ ${result.error}`}`);
    await new Promise((r) => setTimeout(r, 500));
  }

  console.log("\nRecruitee seeds (reported 404):");
  for (const slug of ["growens", "subito"]) {
    const result = await checkRecruitee(slug);
    console.log(`  ${slug}: ${result.ok ? `✓ OK (${result.jobCount} jobs, ${result.italianJobCount} Italian)` : `✗ ${result.error}`}`);
    await new Promise((r) => setTimeout(r, 500));
  }

  console.log("\nSmartRecruiters seeds (reported 200 with 0 postings):");
  for (const slug of ["Generali", "Eni", "UniCredit", "IKEA", "BoschGroup"]) {
    const result = await checkSmartRecruiters(slug);
    console.log(`  ${slug}: ${result.ok ? `✓ OK (${result.jobCount} jobs, ${result.italianJobCount} Italian)` : `✗ ${result.error}`}`);
    await new Promise((r) => setTimeout(r, 500));
  }

  console.log("\n--- NEW SEEDS TO ADD (verify) ---\n");

  console.log("Workable new seeds:");
  for (const slug of ["moneyfarm", "treatwell"]) {
    const result = await checkWorkable(slug);
    console.log(`  ${slug}: ${result.ok ? `✓ OK (${result.jobCount} jobs, ${result.italianJobCount} Italian)` : `✗ ${result.error}`}`);
    await new Promise((r) => setTimeout(r, 500));
  }

  console.log("\nGreenhouse new seed:");
  const sumup = await checkGreenhouse("sumup");
  console.log(`  sumup: ${sumup.ok ? `✓ OK (${sumup.jobCount} jobs, ${sumup.italianJobCount} Italian)` : `✗ ${sumup.error}`}`);
}

main().catch(console.error);
