import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { trialEnd } from "../src/lib/billing";
import { trialLifecycleStage } from "../src/lib/lifecycle-cadence";
const now = Date.now(), day = 86400000;
const fixtures = [null, 1].map(version => ({ trialActivationVersion: version, id: String(version), email: `fixture-${version}@example.invalid`, locale: "en", name: "Fixture", createdAt: new Date(0), proTrialUsedAt: new Date(now - 3*day), trialEndsAt: new Date(now + 4*day), currentPeriodEnd: new Date(now + 4*day), subscriptionStatus: "trialing", preferences: {}, _count: { cvDocuments: 1, applications: 0 } }));
const recipients: string[] = [];
const dependencies: Record<string, unknown> = {
  "@/lib/db": { prisma: { user: { findMany: async (query: any) => {
    assert.equal(query.where.trialActivationVersion, 1, "Historical trials must never enter the new reminder campaign");
    assert.equal(query.select.currentPeriodEnd, true);
    assert.equal(query.select.subscriptionStatus, true);
    return fixtures.filter(user => user.trialActivationVersion === query.where.trialActivationVersion);
  } }, emailLog: { findMany: async () => [] } } },
  "@/lib/billing": { trialEnd },
  "@/lib/email-outbox": { sendQueuedNotification: async (_kind: string, to: string) => { recipients.push(to); return { sent: true }; } },
  "@/lib/email-brand": { renderBrandEmail: () => ({ html: "fixture", text: "fixture" }) },
  "@/lib/admin": { isTestAccount: () => false },
  "@/lib/lifecycle-cadence": { trialLifecycleStage },
};
const module = { exports: {} as any };
vm.runInNewContext(ts.transpileModule(readFileSync("src/lib/trial.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, {
  module, exports: module.exports, Date, Set, console, process: { env: { RESEND_API_KEY: "synthetic" } },
  require: (id: string) => { assert.ok(id in dependencies, `Unexpected dependency ${id}`); return dependencies[id]; },
});
async function main() {
  await module.exports.runTrialNudges();
  assert.deepEqual(recipients, ["fixture-1@example.invalid"]);
  let admin = false;
  const route = { exports: {} as any };
  const routeDeps: Record<string, unknown> = {
    "next/server": { NextResponse: { json: (body: unknown, init: { status: number }) => ({ body, status: init.status }) } },
    "@/lib/session": { getCurrentUser: async () => ({ email: "fixture@example.invalid" }) },
    "@/lib/admin": { isAdmin: () => admin },
  };
  vm.runInNewContext(ts.transpileModule(readFileSync("src/app/api/admin/grant-trial/route.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, {
    module: route, exports: route.exports,
    require: (id: string) => { assert.ok(id in routeDeps, "Legacy grant must never touch database or providers"); return routeDeps[id]; },
  });
  assert.equal((await route.exports.POST()).status, 401);
  admin = true;
  assert.deepEqual(JSON.parse(JSON.stringify(await route.exports.POST())), { body: { error: "legacy_trial_grant_retired", granted: 0 }, status: 410 });
  console.log("PASS trial notifications: new activation cohort only; no historical reminders or provider access.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
