import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import * as rollout from "../src/lib/application-rollout";
import { applicationsPaused, assertApplicationsRunning } from "../src/lib/application-pause";

function load(path: string, extra: Record<string, any> = {}): any {
  const source = readFileSync(path, "utf8");
  const exports = {};
  const unavailable = new Proxy({}, { get: () => { throw new Error("Paused code accessed an external dependency"); } });
  const mocks: Record<string, any> = {
    "@/lib/application-pause": { applicationsPaused, assertApplicationsRunning },
    "@/lib/application-rollout": rollout,
    "@/lib/db": { prisma: unavailable },
    "@/lib/scrapers/ats-companies": { GREENHOUSE_COMPANIES: [], LEVER_COMPANIES: [], ASHBY_COMPANIES: [], WORKABLE_COMPANIES: [], SMARTRECRUITERS_COMPANIES: [] },
    // In-process AsyncLocalStorage binding only (no I/O): token usage attribution.
    "@/lib/ai-usage": { withAiUsageContext: (_context: unknown, run: () => unknown) => run(), recordAiUsage: () => {} },
    ...extra,
  };
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  new Function("require", "exports", js)((name: string) => mocks[name] ?? {}, exports);
  return exports;
}

async function main() {
  const previous = process.env.APPLICATIONS_PAUSED;
  try {
    delete process.env.APPLICATIONS_PAUSED;
    assert.equal(applicationsPaused(), false);
    process.env.APPLICATIONS_PAUSED = "false";
    assert.equal(applicationsPaused(), false);
    for (const value of ["true", "on", "TRUE", "typo"]) {
      process.env.APPLICATIONS_PAUSED = value;
      assert.equal(applicationsPaused(), true);
      assert.throws(assertApplicationsRunning, /applications_paused/);
    }
    process.env.APPLICATIONS_PAUSED = "true";
    const worker = load("src/lib/application-worker.ts");
    await worker.processApplication("customer", { forceRealSubmit: true });
    await load("src/lib/application-queue.ts").enqueueApplication("customer");
    const claims = load("src/lib/application-claim.ts");
    assert.equal(await claims.claimApplication("customer"), false);
    assert.deepEqual(await claims.findClaimableQueued(5), []);
    assert.equal(await claims.recoverStuckApplications(), 0);
    await claims.resetClaim("customer");
    assert.equal((await load("src/lib/cron-self-heal.ts").runCronSelfHeal()).appsRequeued, 0);
    const cron = load("src/lib/auto-apply-cron.ts");
    assert.equal((await cron.runAutoApplyCron()).applicationsEnqueued, 0);
    assert.equal((await cron.runAutoApplyForUser("customer")).applicationsEnqueued, 0);
    const quota = load("src/lib/email-quota.ts");
    for (const kind of ["cv_ready", "application_sent", "application_manual", "application_no_reply_yet", "daily_summary"]) {
      assert.deepEqual(await quota.sendWithinQuota(kind, "customer@example.invalid", () => { throw new Error("Must not transmit"); }), { sent: false, reason: "applications_paused" });
    }
    const { z } = await import("zod");
    const routeMocks = { zod: { z }, "next/server": { NextResponse: { json: (body: unknown, options: any) => ({ body, status: options?.status ?? 200 }) } }, "@/lib/session": { getCurrentUser: async () => ({ id: "customer" }) } };
    for (const path of ["apply", "apply-batch", "manual", "consent"]) {
      const route = load(`src/app/api/applications/${path}/route.ts`, routeMocks);
      assert.equal((await route.POST({})).status, 503);
      const unauth = load(`src/app/api/applications/${path}/route.ts`, { ...routeMocks, "@/lib/session": { getCurrentUser: async () => null } });
      assert.equal((await unauth.POST({})).status, 401);
    }
    const previousCron = process.env.CRON_SECRET;
    process.env.CRON_SECRET = "synthetic-pause-test";
    try {
      for (const route of ["retry-credit-failures", "retry-captcha", "requeue-stuck", "reset-bogus-sends", "unstick-applying", "test-apply"]) {
        const api = load(`src/app/api/admin/${route}/route.ts`, { ...routeMocks, "@/lib/admin": { isAdmin: () => true } });
        assert.equal((await api.POST({ headers: new Headers({ authorization: `Bearer ${process.env.CRON_SECRET}` }) })).status, 503);
      }
    } finally { if (previousCron === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = previousCron; }
    // Removing the broad pause admits the shared pre-preparation-only recovery.
    if (readFileSync("src/lib/cron-self-heal.ts", "utf8").includes("appsRecoveredSafely")) {
      process.env.APPLICATIONS_PAUSED = "false";
      let safeRecoveryCalls = 0;
      const heal = load("src/lib/cron-self-heal.ts", {
        "@/lib/db": { prisma: { user: { findMany: async () => [] } } },
        "@/lib/application-claim": { recoverStuckApplications: async () => { safeRecoveryCalls++; return 2; } },
      });
      assert.equal((await heal.runCronSelfHeal()).appsRecoveredSafely, 2);
      assert.equal(safeRecoveryCalls, 1);
      assert(!readFileSync("src/lib/cron-self-heal.ts", "utf8").includes("prisma.application.update"));
      process.env.APPLICATIONS_PAUSED = "true";
    }
    const previousKey = process.env.ADMIN_SYNC_KEY;
    process.env.ADMIN_SYNC_KEY = "synthetic-test-only";
    try {
      const cronRoute = load("src/app/api/cron/auto-apply/route.ts", routeMocks);
      assert.equal((await cronRoute.GET({ headers: new Headers({ "x-admin-key": process.env.ADMIN_SYNC_KEY }) })).body.paused, true);
      assert.equal((await cronRoute.GET({ headers: new Headers() })).status, 401);
    } finally { if (previousKey === undefined) delete process.env.ADMIN_SYNC_KEY; else process.env.ADMIN_SYNC_KEY = previousKey; }
    const source = readFileSync("src/lib/application-worker.ts", "utf8");
    assert.match(source, /attemptAutoSubmit[\s\S]*?assertApplicationsRunning\(\)/);
    assert.match(source, /async function attemptPortalAdapterSubmit[\s\S]*?assertApplicationsRunning\(\)/);
    assert(!readFileSync("src/app/api/webhooks/resend/route.ts", "utf8").includes("applicationsPaused"), "Receiving and signed delivery webhooks must remain live");
    console.log("PASS release pause: producers, manual/auth, cron/GitHub, queue/fallback, worker force flag, claims, notification sends, inbound kept live, no DB/provider side effects.");
  } finally { if (previous === undefined) delete process.env.APPLICATIONS_PAUSED; else process.env.APPLICATIONS_PAUSED = previous; }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
