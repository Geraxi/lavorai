import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { GET, dynamic, revalidate, fetchCache } from "../src/app/api/health/application-pause/route";
import { RELEASE_HEALTH_URL, RELEASE_REPAIR_VERSION, verifyProductionApplicationPause } from "../src/lib/release-health";

async function main() {
  const saved = { railway: process.env.RAILWAY_GIT_COMMIT_SHA, vercel: process.env.VERCEL_GIT_COMMIT_SHA,
    pause: process.env.APPLICATIONS_PAUSED, secret: process.env.APP_WORKER_SECRET };
  const originalFetch = globalThis.fetch;
  const originalNow = Date.now;
  const commit = "a".repeat(40);
  let requests = 0;
  const response = (mutate: (body: Record<string, unknown>) => unknown = body => body,
    options: { status?: number; headers?: Record<string, string>; redirected?: boolean; url?: string; raw?: string } = {}) =>
    async (input: any, init: any) => {
      requests++;
      const url = new URL(String(input));
      assert.equal(url.origin + url.pathname, RELEASE_HEALTH_URL);
      assert.match(url.searchParams.get("nonce")!, /^[a-f0-9]{32}$/);
      assert.equal(init.method, "GET"); assert.equal(init.body, undefined);
      assert.equal(init.redirect, "error"); assert.equal(init.cache, "no-store");
      assert.equal(init.credentials, "omit");
      assert(init.signal instanceof AbortSignal);
      assert.deepEqual(init.headers, { accept: "application/json", "cache-control": "no-cache, no-store", pragma: "no-cache" });
      const body = mutate({ applicationsPaused: true, repairVersion: RELEASE_REPAIR_VERSION,
        deploymentCommit: commit, nonce: url.searchParams.get("nonce"), observedAt: originalNow() });
      const result = new Response(options.raw ?? JSON.stringify(body), { status: options.status ?? 200,
        headers: options.headers ?? { "content-type": "application/json", "cache-control": "no-store" } });
      Object.defineProperty(result, "url", { value: options.url ?? String(input) });
      Object.defineProperty(result, "redirected", { value: options.redirected ?? false });
      return result;
    };
  try {
    delete process.env.APP_WORKER_SECRET;
    globalThis.fetch = response();
    delete process.env.RAILWAY_GIT_COMMIT_SHA;
    assert.equal(await verifyProductionApplicationPause(), false);
    process.env.RAILWAY_GIT_COMMIT_SHA = "unknown";
    assert.equal(await verifyProductionApplicationPause(), false);
    assert.equal(requests, 0, "Missing automatic build identity must not make a request");
    process.env.RAILWAY_GIT_COMMIT_SHA = commit;
    assert.equal(await verifyProductionApplicationPause(), true, "No secret is needed for exact fresh public health");
    for (const mutation of [
      { applicationsPaused: false }, { applicationsPaused: "true" }, { repairVersion: "old-repair" },
      { deploymentCommit: "b".repeat(40) }, { deploymentCommit: undefined }, { nonce: "0".repeat(32) },
      { observedAt: originalNow() - 60_000 }, { observedAt: originalNow() + 60_000 },
      { observedAt: String(originalNow()) }, { observedAt: undefined },
    ]) {
      globalThis.fetch = response(body => ({ ...body, ...mutation }));
      assert.equal(await verifyProductionApplicationPause(), false, JSON.stringify(mutation));
    }
    const responseFailures: NonNullable<Parameters<typeof response>[1]>[] = [
      { status: 302 }, { status: 503 }, { redirected: true }, { url: "https://other.example.invalid/health" },
      { headers: { "content-type": "application/json", "cache-control": "max-age=60" } },
      { headers: { "content-type": "application/json", "cache-control": "no-store", age: "1" } },
      { headers: { "content-type": "text/html", "cache-control": "no-store" } },
      { raw: "malformed" }, { raw: " ".repeat(2049) },
    ];
    for (const options of responseFailures) {
      globalThis.fetch = response(body => body, options);
      assert.equal(await verifyProductionApplicationPause(), false, JSON.stringify(options));
    }
    for (const error of [new TypeError("network unavailable"), new DOMException("timeout", "TimeoutError")]) {
      globalThis.fetch = async () => { throw error; };
      assert.equal(await verifyProductionApplicationPause(), false);
    }
    const time = originalNow(); let clockReads = 0;
    Date.now = () => time + (clockReads++ === 0 ? 0 : 16_000);
    globalThis.fetch = response();
    assert.equal(await verifyProductionApplicationPause(), false, "Expired probes cannot pass after a slow response");
    Date.now = originalNow;

    assert.equal(dynamic, "force-dynamic"); assert.equal(revalidate, 0); assert.equal(fetchCache, "force-no-store");
    const nonce = "c".repeat(32);
    const request = () => new Request(`${RELEASE_HEALTH_URL}?nonce=${nonce}`);
    process.env.VERCEL_GIT_COMMIT_SHA = commit;
    process.env.APPLICATIONS_PAUSED = "true";
    const health = await GET(request());
    assert.equal(health.status, 200);
    for (const key of ["cache-control", "cdn-cache-control", "vercel-cdn-cache-control"]) {
      assert.match(health.headers.get(key)!, /no-store/);
    }
    const healthBody = await health.json();
    assert.deepEqual(Object.keys(healthBody).sort(), ["applicationsPaused", "deploymentCommit", "nonce", "observedAt", "repairVersion"]);
    assert.equal(healthBody.applicationsPaused, true); assert.equal(healthBody.deploymentCommit, commit);
    assert.equal(healthBody.repairVersion, RELEASE_REPAIR_VERSION); assert.equal(healthBody.nonce, nonce);
    assert(Math.abs(healthBody.observedAt - originalNow()) < 5_000);
    const savedRollout = { mode: process.env.APPLICATION_ROLLOUT_MODE, start: process.env.APPLICATION_ROLLOUT_START_AT, cap: process.env.APPLICATION_ROLLOUT_DAILY_CAP };
    try {
      delete process.env.APPLICATION_ROLLOUT_MODE;
      const closed = await GET(request());
      assert.equal(closed.headers.get("x-lavorai-rollout-mode"), "closed");
      assert.equal(closed.headers.get("x-lavorai-rollout-cap"), "0");
      assert.equal(closed.headers.get("x-lavorai-rollout-start"), "unavailable");
      process.env.APPLICATION_ROLLOUT_MODE = "manual_only";
      process.env.APPLICATION_ROLLOUT_START_AT = new Date(originalNow() - 60000).toISOString();
      process.env.APPLICATION_ROLLOUT_DAILY_CAP = "10";
      const configured = await GET(request());
      assert.equal(configured.headers.get("x-lavorai-rollout-mode"), "manual_only");
      assert.equal(configured.headers.get("x-lavorai-rollout-cap"), "10");
      assert.equal(configured.headers.get("x-lavorai-rollout-start"), process.env.APPLICATION_ROLLOUT_START_AT);
      assert.equal(configured.headers.get("x-lavorai-automatic-producers"), "blocked");
      process.env.APPLICATION_ROLLOUT_DAILY_CAP = "11";
      assert.equal((await GET(request())).headers.get("x-lavorai-rollout-mode"), "closed");
    } finally {
      for (const [key, value] of Object.entries({ APPLICATION_ROLLOUT_MODE: savedRollout.mode, APPLICATION_ROLLOUT_START_AT: savedRollout.start, APPLICATION_ROLLOUT_DAILY_CAP: savedRollout.cap })) {
        if (value === undefined) delete process.env[key]; else process.env[key] = value;
      }
    }
    process.env.APPLICATIONS_PAUSED = "false";
    assert.equal((await (await GET(request())).json()).applicationsPaused, false);
    delete process.env.VERCEL_GIT_COMMIT_SHA;
    assert.equal((await GET(request())).status, 503);
    process.env.VERCEL_GIT_COMMIT_SHA = "unknown";
    assert.equal((await GET(request())).status, 503);
    for (const query of ["", "?nonce=invalid", "?nonce=" + "0".repeat(64)]) {
      assert.equal((await GET(new Request(RELEASE_HEALTH_URL + query))).status, 400);
    }
    const route = readFileSync("src/app/api/health/application-pause/route.ts", "utf8");
    for (const forbidden of ["@/lib/db", "APP_WORKER_SECRET", "OWNER_ID", "RECIPIENT", "processApplication", "POST("]) {
      assert(!route.includes(forbidden), `Public health must not expose identity or perform privileged work: ${forbidden}`);
    }
    console.log("PASS release health: exact cross-runtime build, source version, nonce freshness, no-cache, stale/redirect/unavailable rejection, missing metadata fail-closed, credential-free read-only endpoint.");
  } finally {
    globalThis.fetch = originalFetch; Date.now = originalNow;
    for (const [key, value] of Object.entries({ RAILWAY_GIT_COMMIT_SHA: saved.railway,
      VERCEL_GIT_COMMIT_SHA: saved.vercel, APPLICATIONS_PAUSED: saved.pause, APP_WORKER_SECRET: saved.secret })) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
