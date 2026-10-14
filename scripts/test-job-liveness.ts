import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { autoApplyPreferenceMismatch, locationPreferenceMismatch } from "../src/lib/auto-apply-preferences";
import { hasVerifiedSubmissionReceipt } from "../src/lib/submission-receipt";

// The real source runs against mocked HTTP and DB. No remote site is contacted.
const output = ts.transpileModule(readFileSync("src/lib/job-liveness.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
let response = { status: 200, url: "https://careers.acme.test/job", html: "<h1>Acme Engineer</h1><p>Apply now</p>", json: null as unknown };
let apiResponse: { status: number; json: unknown } | null = null;
let throws = false;
const urls: string[] = [];
const module = { exports: {} as Record<string, any> };
vm.runInNewContext(output, { module, exports: module.exports, URL, Date, AbortSignal,
  require: (id: string) => { assert.equal(id, "@/lib/db"); return { prisma: { job: { update: () => { throw new Error("No DB writes allowed"); } } } }; },
  fetch: async (url: string) => {
    urls.push(url);
    if (throws) throw new Error("test network timeout");
    const r = /boards-api|api\.ashbyhq|api\.lever|\/api\/v2\/|api\.smartrecruiters/.test(url) ? (apiResponse ?? { status: 503, json: null }) : response;
    return { ...r, ok: r.status >= 200 && r.status < 300, headers: { get: () => "text/html" },
      text: async () => response.html, json: async () => r.json };
  },
});
const check = (url = "https://careers.acme.test/job") => module.exports.checkJobUrlLiveness(url);
async function main() {
  assert.equal((await check()).state, "live");
  for (const status of [403, 429, 500, 503]) { response.status = status; assert.equal((await check()).state, "unknown"); }
  for (const status of [404, 410]) { response.status = status; assert.equal((await check()).state, "closed"); }
  response.status = 200; response.html = "<h1>This job is no longer accepting applications</h1>";
  assert.equal((await check()).state, "closed");
  for (const html of ["<h1>Careers</h1>", "<html><script>loadApp()</script></html>", "<h1>Just a moment</h1><p>Verify you are human</p>"]) {
    response.html = html; assert.equal((await check()).state, "unknown");
  }
  response.html = '<h1>Acme Engineer</h1><p>Apply now</p><footer>Old job no longer accepting applications</footer>';
  assert.equal((await check()).state, "live", "Closed wording in unrelated footer is not removal evidence");
  throws = true; assert.equal((await check()).state, "unknown"); throws = false;
  response.url = "https://jobs.ashbyhq.com/acme";
  assert.equal((await check("https://jobs.ashbyhq.com/acme/01234567-0123-0123-0123-012345678901")).state, "closed");
  response.url = "https://unrelated.test/jobs";
  assert.equal((await check()).state, "unknown", "Cross-host redirect is not conclusive closure");
  response.url = "https://boards.greenhouse.io/acme/jobs/123"; response.html = "<html>loading</html>";
  apiResponse = { status: 200, json: { id: 123, title: "Engineer" } };
  assert.equal((await check(response.url)).state, "live");
  apiResponse = { status: 200, json: { id: 999, title: "Wrong job" } };
  assert.equal((await check(response.url)).state, "unknown");
  apiResponse = { status: 200, json: { error: "Invalid token" } };
  assert.equal((await check(response.url)).state, "unknown");
  apiResponse = { status: 404, json: null }; assert.equal((await check(response.url)).state, "closed");
  apiResponse = { status: 200, json: { jobs: [] } };
  assert.equal((await check("https://jobs.ashbyhq.com/acme/01234567-0123-0123-0123-012345678901")).state, "closed");
  apiResponse = { status: 503, json: null };
  assert.equal((await check(response.url)).state, "unknown");
  assert.equal(await module.exports.isJobUrlAlive(response.url), false, "Unknown cannot auto-send");
  const loc = (location: string | null, remote = true, description = "") => ({ location, remote, description });
  assert.equal(locationPreferenceMismatch(loc("Remote - US only"), ["Milano"]), "location");
  assert.equal(locationPreferenceMismatch(loc("Remote - US only"), ["Remote (EU)"]), "location");
  assert.equal(locationPreferenceMismatch(loc("Remote - EU"), ["Remote (EU)"]), null);
  assert.equal(locationPreferenceMismatch(loc("Remote - UK"), ["Remote (EU)"]), "location");
  assert.equal(locationPreferenceMismatch(loc("Remote"), ["Remote"]), "location_unverified");
  assert.equal(locationPreferenceMismatch(loc(null), ["Italy"]), "location_unverified");
  assert.equal(locationPreferenceMismatch(loc("Worldwide"), ["Milano"]), null);
  assert.equal(locationPreferenceMismatch(loc("Worldwide", true, "Candidates must be based in the United States."), ["Milano"]), "location");
  assert.equal(locationPreferenceMismatch(loc("Milano", true, "Our offices are in New York and Berlin. We are a global team."), ["Milano"]), null);
  assert.equal(locationPreferenceMismatch(loc("Berlin", false, "Our offices are in Milano. We are a global team."), ["Milano"]), "location");
  assert.equal(locationPreferenceMismatch(loc("Bergamo, Lombardia", false), ["Milano"]), "location");
  assert.equal(locationPreferenceMismatch(loc("Neuhausen", false), ["EU"]), "location", "EU is a token, not an arbitrary substring");
  const job = { ...loc("Milano", false), title: "Designer", contractType: "permanent", salaryMin: null, salaryMax: null, description: "You will partner with a consultant and a contractor." };
  assert.equal(autoApplyPreferenceMismatch(job, { employmentType: "employee", salaryMin: 30 }, ["Milano"]), null, "Generic colleagues are not the contract type");
  const receipt = { version: 1, provider: "greenhouse", kind: "http", jobId: "123", capturedAt: new Date().toISOString(), endpoint: "https://boards.greenhouse.io/acme/jobs/123", operation: "application.create", httpStatus: 201, signal: "application_id", receiptId: "receipt-1" };
  assert(hasVerifiedSubmissionReceipt(JSON.stringify(receipt), "portal_greenhouse"));
  for (const patch of [{ provider: "unknown" }, { operation: "upload" }, { httpStatus: 400 }, { signal: "request_ok" }, { capturedAt: "invalid" }, { endpoint: "https://evil.test/upload" }, { receiptId: null }]) {
    assert.equal(hasVerifiedSubmissionReceipt(JSON.stringify({ ...receipt, ...patch }), "portal_greenhouse"), false);
  }
  assert.equal(hasVerifiedSubmissionReceipt(JSON.stringify(receipt), "portal_lever"), false);
  assert.equal(hasVerifiedSubmissionReceipt(JSON.stringify({ ...receipt, kind: "dom", signal: "new_receipt_and_form_removed" })), true);
  assert.equal(hasVerifiedSubmissionReceipt(JSON.stringify({ ...receipt, kind: "dom", signal: "thank_you_in_job_description" })), false);
  console.log("PASS mocked job liveness (live/closed/unknown), redirect/API failures, geography constraints and receipt validation");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
