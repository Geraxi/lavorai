import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import * as React from "react";
import * as jsx from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import * as billing from "../src/lib/billing";

function load(path: string, deps: Record<string, unknown>) {
  const code = ts.transpileModule(readFileSync(path, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const module = { exports: {} as any };
  vm.runInNewContext(code, { module, exports: module.exports, Date, Map, Set, console, process,
    require(name: string) { assert(name in deps, `Unexpected dependency ${name}`); return deps[name]; } });
  return module.exports;
}
async function main() {
  let used = 0, preview: any = null;
  const user = { id: "free-fixture", email: "free@example.invalid", tier: "free", emailVerified: new Date(), trialEndsAt: null, cardSetupAt: new Date(), freeApplicationsUsed: 0 };
  let previewQuery: any;
  const db = { user: { findUniqueOrThrow: async () => ({ freeApplicationsUsed: used }) }, applicationPreview: {
    findFirst: async (query: any) => { previewQuery = query; return preview; },
  } };
  const free = load("src/lib/free-plan.ts", { "@/lib/db": { prisma: db }, "@/lib/billing": billing });
  assert.equal(await free.freePlanBlock(user), null);
  used = 5;
  assert.equal((await free.freePlanBlock(user)).error, "free_quota_exhausted");
  assert.equal(await free.freePlanBlock({ ...user, tier: "pro" }), null);
  assert.equal(await free.approvedPreview(user.id, "job", undefined), null);
  preview = { resultJson: "{\"serverOwned\":true}" };
  assert.equal(await free.approvedPreview(user.id, "job", "preview"), preview);
  assert.equal(previewQuery.where.userId, user.id);
  assert.equal(previewQuery.where.jobId, "job");
  assert.equal(previewQuery.where.id, "preview");
  assert(+previewQuery.where.createdAt.gt > Date.now() - 24 * 60 * 60_000 - 1000);
  const common = {
    "next/server": { NextResponse }, zod: { z }, "@/lib/db": { prisma: db }, "@/lib/session": { getCurrentUser: async () => user },
    "@/lib/billing": billing, "@/lib/free-plan": free,
    "@/lib/application-rollout": { rolloutCreationBlocked: () => false, applicationRolloutConfig: () => ({ enabled: true, startedAt: new Date(0) }) },
    "@/lib/application-pause": { applicationsPaused: () => false },
    "@/lib/rate-limit": { applyLimiter: { limit: async () => ({ success: true }) }, applyBatchLimiter: { limit: async () => ({ success: true }) } },
    "@/lib/admin-user-actions": {}, "@/lib/application-queue": {}, "@/lib/match-score": {}, "@/lib/cv-profile-types": {}, "@/lib/apply-session": {},
    "@/lib/conversion-events": {}, "@/lib/analytics": {}, "@/lib/activation-readiness": {},
  };
  const request = (body: unknown) => new NextRequest("https://fixture.invalid/api/applications", { method: "POST", body: JSON.stringify(body) });
  for (const [file, body] of [["apply", { jobId: "job", portal: "other" }], ["apply-batch", { jobIds: ["job"] }], ["consent", {}]] as const) {
    const route = load(`src/app/api/applications/${file}/route.ts`, common);
    const response = await route.POST(request(body));
    assert.equal(response.status, 402, `${file} blocks exhausted Free before creation or enqueue`);
    assert.equal((await response.json()).upgradeTier, "pro");
    used = 0; preview = null;
    if (file !== "consent") {
      const missing = await route.POST(request(body));
      assert.equal(missing.status, 409);
      assert.equal((await missing.json()).error, "preview_required");
    }
    used = 5;
  }
  // Paid plans remain EUR 19.99 and EUR 39.99; Free has no Stripe price.
  assert.equal(billing.TIERS.pro.price, 19.99);
  assert.equal(billing.TIERS.pro_plus.price, 39.99);
  assert.equal(billing.TIERS.free.stripePriceIdEnv, null);
  const reactDeps = { react: React, "react/jsx-runtime": jsx };
  const status = load("src/components/free-plan-status.tsx", reactDeps).FreePlanStatus;
  assert.match(renderToStaticMarkup(React.createElement(status, { remaining: 5 })), /5 di 5 candidature gratuite rimaste/);
  assert.match(renderToStaticMarkup(React.createElement(status, { remaining: 0 })), /Passa a Pro, EUR 19,99/);
  const review = load("src/components/application-preview.tsx", reactDeps).ApplicationPreview;
  const markup = renderToStaticMarkup(React.createElement(review, { preview: { previewId: "server-preview", jobTitle: "Designer", company: "Acme",
    cv: { fullName: "Candidate", summary: "<script>alert(1)</script>", experiences: [], education: [], skills: { technical: [], soft: [], tools: [] }, languages: [] },
    coverLetter: "Position-specific cover letter" }, busy: false, onConfirm() {}, onCancel() {} }));
  assert.match(markup, /Designer/); assert.match(markup, /Position-specific cover letter/);
  assert.match(markup, /&lt;script&gt;/); assert(!markup.includes("<script>"));
  assert.match(markup, /role="dialog"/); assert.match(markup, /Confermo i documenti e invio/);
  console.log("PASS Free API quota walls (single/batch/consent), mandatory server-owned previews, ownership/position/expiry binding and unchanged Pro+ price");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
