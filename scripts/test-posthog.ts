import assert from "node:assert/strict";
import { gunzipSync } from "node:zlib";
import posthog from "posthog-js";
import { captureFunnel, syncPostHogConsent, identifyAnalyticsUser, resetAnalyticsUser, captureClientException } from "../src/lib/posthog/client";
import { safeProperties } from "../src/lib/posthog/shared";

async function main() {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST;
  const originalFetch = globalThis.fetch;
  const batches: Array<{ batch?: Array<{ event: string; properties: Record<string, unknown> }> }> = [];
  let consent: string | undefined;
  let queries = 0;
  const store = new Map<string, string>();
  // No database or external analytics service is used by this regression test.
  (globalThis as any).prisma = { conversionEvent: {
    findUnique: async () => { queries++; return consent ? { propertiesJson: consent } : null; },
    upsert: async (input: any) => { consent = input.create.propertiesJson; },
  } };
  globalThis.fetch = async (_url, init) => {
    if (init?.body) {
      const bytes = init.body;
      const raw = typeof bytes === "string" ? bytes : Buffer.from(bytes as Uint8Array);
      let data: string;
      try { data = gunzipSync(raw).toString(); } catch { data = raw.toString(); }
      batches.push(JSON.parse(data));
    }
    return new Response('{"status":1}', { status: 200, headers: { "Content-Type": "application/json" } });
  };
  const { captureServerEvent, rememberAnalyticsConsent } = await import("../src/lib/posthog/server");
  try {
    delete process.env.NEXT_PUBLIC_POSTHOG_KEY;
    await captureServerEvent("user-1", "application_sent");
    assert.equal(queries, 0, "disabled analytics must not query consent");
    assert.equal(batches.length, 0);
    process.env.NEXT_PUBLIC_POSTHOG_KEY = "phc_test";
    process.env.NEXT_PUBLIC_POSTHOG_HOST = "https://analytics.example.test";
    await captureServerEvent("user-1", "application_sent");
    assert.equal(batches.length, 0, "missing consent must fail closed");
    await rememberAnalyticsConsent("user-1", true);
    await captureServerEvent("user-1", "application_sent", { plan: "free", free_remaining: 4, email: "secret@example.test", cv: "private CV" } as any, "application_sent:app-1");
    const events = batches.flatMap(batch => batch.batch ?? []);
    assert.equal(events.length, 1, "awaited shutdown must deliver the event before returning");
    assert.equal(events[0].event, "application_sent");
    assert.equal(events[0].properties.plan, "free");
    assert.equal(events[0].properties.free_remaining, 4);
    assert.equal(events[0].properties.$insert_id, "application_sent:app-1");
    assert.ok(!JSON.stringify(events).includes("private CV"));
    assert.ok(!JSON.stringify(events).includes("secret@example.test"));
    await rememberAnalyticsConsent("user-1", false);
    const count = batches.length;
    await captureServerEvent("user-1", "subscription_started", { plan: "pro" });
    assert.equal(batches.length, count, "revoked consent must suppress webhook/worker events");

    const calls: Array<[string, ...any[]]> = [];
    let config: any;
    for (const method of ["init", "capture", "identify", "reset", "stopSessionRecording", "startSessionRecording", "opt_out_capturing", "opt_in_capturing", "captureException"] as const) {
      (posthog as any)[method] = (...args: any[]) => { calls.push([method, ...args]); if (method === "init") config = args[1]; };
    }
    (posthog as any).get_property = () => "user-1";
    (globalThis as any).window = {};
    (globalThis as any).localStorage = { getItem: (name: string) => store.get(name) ?? null };
    (globalThis as any).document = { cookie: "" };
    (globalThis as any).location = { protocol: "https:" };
    captureFunnel("signup_started");
    assert.equal(calls.length, 0, "no SDK initialization before consent");
    store.set("lavorai-cookie-consent", "accepted");
    delete process.env.NEXT_PUBLIC_POSTHOG_KEY;
    captureFunnel("signup_started");
    assert.equal(calls.length, 0, "missing key is a no-op even with consent");
    process.env.NEXT_PUBLIC_POSTHOG_KEY = "phc_test";
    captureFunnel("signup_started");
    assert.equal(calls.filter(x => x[0] === "init").length, 1);
    assert.equal(config.api_host, "/ingest");
    assert.equal(config.session_recording.maskAllInputs, true);
    assert.ok(config.session_recording.maskTextSelector.includes("[data-ph-mask]"));
    assert.equal(config.autocapture, false);
    identifyAnalyticsUser("user-1", "pro");
    assert.deepEqual(calls.find(x => x[0] === "identify"), ["identify", "user-1", { plan: "pro" }]);
    captureClientException(new Error("CV text and secret@example.test"));
    const error = calls.find(x => x[0] === "captureException")?.[1];
    assert.equal(error.message, "Unexpected application error");
    assert.equal(error.stack, undefined);
    const event = config.before_send({ properties: { $current_url: "https://app.test/?token=secret", plan: "free" } });
    assert.deepEqual(event.properties, { plan: "free" });
    resetAnalyticsUser(true);
    assert.ok(calls.some(x => x[0] === "reset"));
    store.set("lavorai-cookie-consent", "essential");
    assert.equal(syncPostHogConsent(), false);
    assert.ok(calls.some(x => x[0] === "stopSessionRecording"));
    assert.ok(calls.some(x => x[0] === "opt_out_capturing"));
    assert.equal(config.before_send({ properties: { plan: "free" } }), null);
    const captures = calls.filter(x => x[0] === "capture").length;
    captureFunnel("upgrade_clicked", { target_plan: "pro" });
    assert.equal(calls.filter(x => x[0] === "capture").length, captures);
    assert.deepEqual(safeProperties({ plan: "unknown", target_plan: "pro_plus", free_remaining: -2 }), { target_plan: "pro_plus", free_remaining: 0 });
    console.log("PostHog: consent, identity, replay privacy, sanitization and serverless flush passed");
  } finally {
    globalThis.fetch = originalFetch;
    if (key === undefined) delete process.env.NEXT_PUBLIC_POSTHOG_KEY; else process.env.NEXT_PUBLIC_POSTHOG_KEY = key;
    if (host === undefined) delete process.env.NEXT_PUBLIC_POSTHOG_HOST; else process.env.NEXT_PUBLIC_POSTHOG_HOST = host;
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
