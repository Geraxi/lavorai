import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { onboardingAccessBlock } from "../src/lib/onboarding-access";
import * as roleMatch from "../src/lib/role-match";
import * as preferenceMatch from "../src/lib/auto-apply-preferences";
import { AnalyticsEvent } from "../src/lib/analytics";
import { trialEligibility } from "../src/lib/trial-eligibility";

// Only explicit in-memory boundaries. Any accidental queue, mail, Stripe or network import fails.
let user: any = { id: "fixture", email: "fixture@example.org", emailVerified: new Date(), tier: "free" };
let account: any;
let ready = true;
let fail = false;
let generated = 0;
let release: (() => void) | null = null;
let hold: Promise<void> | null = null;
let viewed = 0;
const baseJob = { title: "Product Designer", company: "Fixture", location: "Milano", description: "Design products", remote: false, contractType: "employee", salaryMin: null, salaryMax: null };
function reset() {
  account = { id: "fixture", demoGeneratedAt: null, demoPreviewJson: null, demoClaimedAt: null,
    cvDocuments: [{ extractedText: "Synthetic product designer CV" }], avoidCompanies: null,
    preferences: { rolesJson: '["Product Designer"]', locationsJson: '["Milano"]', sourcesJson: '["sede"]', employmentType: "employee", salaryMin: 0 } };
}
function match(where: any): boolean {
  return Object.entries(where).every(([key, value]: [string, any]) => {
    if (key === "OR") return value.some(match);
    if (value && typeof value === "object" && "lt" in value) return account[key] != null && account[key] < value.lt;
    return account[key] === value;
  });
}
const deps: Record<string, any> = {
  "next/server": { NextResponse }, zod: { z },
  "@/lib/onboarding-access": { onboardingAccessBlock },
  "@/lib/session": { getCurrentUser: async () => user },
  "@/lib/role-match": roleMatch, "@/lib/auto-apply-preferences": preferenceMatch,
  "@/lib/db": { prisma: { user: {
    findUnique: async () => account,
    updateMany: async ({ where, data }: any) => { if (!match(where)) return { count: 0 }; Object.assign(account, data); return { count: 1 }; },
  }, job: { findMany: async () => [baseJob, { ...baseJob, title: "Software Engineer" }, { ...baseJob, location: "Roma" }] } } },
  "@/lib/activation-readiness": { getActivationReadiness: async () => ({ ready, issue: "upload_cv" }), ACTIVATION_MESSAGES: { upload_cv: "Upload CV" } },
  "@/lib/claude": { optimizeCV: async () => { generated++; if (hold) await hold; if (fail) throw new Error("fixture AI failure"); return { atsScore: 75, optimizedCV: { summary: "Fixture summary", skills: { technical: ["Design"], tools: [] } }, suggestions: ["Fixture suggestion"], coverLetter: "Fixture letter" }; } },
  "@/lib/analytics": { AnalyticsEvent },
  "@/lib/conversion-events": { recordConversionEvent: async () => { viewed++; } },
};
function load(path: string) {
  const code = ts.transpileModule(readFileSync(path, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} as any };
  vm.runInNewContext(code, { module, exports: module.exports, Date, JSON, console, require(id: string) { assert.ok(id in deps, `Unexpected dependency ${id}`); return deps[id]; } });
  return module.exports.POST;
}
const preview = load("src/app/api/onboarding/demo/route.ts");
const view = load("src/app/api/onboarding/demo/viewed/route.ts");
const req = () => new NextRequest("https://fixture.invalid/api/onboarding/demo", { method: "POST", body: JSON.stringify({ targetRole: "Product Designer" }) });
async function main() {
  reset();
  const original = user; user = null;
  assert.equal((await preview(req())).status, 401);
  user = { ...original, emailVerified: null };
  assert.equal((await preview(req())).status, 403);
  user = original; ready = false;
  assert.equal((await preview(req())).status, 409); ready = true;
  assert.equal((await view()).status, 409);
  hold = new Promise<void>(resolve => { release = resolve; });
  const first = preview(req());
  // The first call reaches the async model boundary; the second is rejected by its persisted claim.
  await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal((await preview(req())).status, 409);
  release!(); hold = null;
  const response = await first;
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.offers.length, 1, "Wrong role and wrong location are excluded");
  assert.equal(data.target.matchedJob, true);
  assert.equal(generated, 1); assert.equal(viewed, 0, "Generation is not a viewed event");
  assert.deepEqual(await (await preview(req())).json(), data, "Refresh returns the same private saved preview");
  assert.equal(generated, 1);
  assert.equal((await view()).status, 200); assert.equal(viewed, 1);
  reset(); fail = true;
  assert.equal((await preview(req())).status, 502);
  assert.equal(account.demoClaimedAt, null, "Failed generation can be retried");
  fail = false;
  account.preferences.locationsJson = '["Torino"]';
  const noMatch = await (await preview(req())).json();
  assert.equal(noMatch.target.matchedJob, false); assert.deepEqual(noMatch.offers, []);
  for (const u of [null, { proTrialUsedAt: new Date() }, { trialEndsAt: new Date() }]) assert.equal(trialEligibility(u, false), "used_or_review_required");
  assert.equal(trialEligibility({}, true), "used_or_review_required");
  assert.equal(trialEligibility({}, false), "used_or_review_required");
  assert.equal(trialEligibility({ trialActivationVersion: 1 }, false), "eligible");
  assert.equal(trialEligibility({ trialActivationVersion: 1, proTrialUsedAt: new Date() }, false), "used_or_review_required");
  assert.equal(trialEligibility({ trialActivationVersion: 1 }, true), "used_or_review_required");
  console.log("PASS value-first preview: auth/verification, readiness, concurrent claims, retry, refresh, private persistence, role/location matching, empty inventory, viewed event, conservative legacy eligibility. No network services.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
