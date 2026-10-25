import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createLivenessGate, livenessMaxChecksFromEnv, DEFAULT_LIVENESS_MAX_CHECKS } from "../src/lib/auto-apply-liveness-gate";

async function main() {
  const marked: string[] = []; const calls: string[] = [];
  const states: Record<string, "live" | "closed" | "unknown" | "throw" | "hang"> = { a: "live", b: "closed", c: "unknown", d: "throw", e: "hang" };
  const gate = createLivenessGate({
    maxChecks: 5, timeoutMs: 50,
    markClosed: async (id) => { marked.push(id); },
    check: async (url) => {
      calls.push(url); const s = states[url];
      if (s === "throw") throw new Error("network");
      if (s === "hang") return new Promise(() => {});
      return { state: s, reason: "test" };
    },
  });
  assert.equal(await gate.verdict({ id: "A", url: "a" }), "live");
  assert.equal(await gate.verdict({ id: "B", url: "b" }), "closed");
  assert.deepEqual(marked, ["B"], "closed job is marked closed");
  assert.equal(await gate.verdict({ id: "C", url: "c" }), "unchecked", "unknown never blocks");
  assert.equal(await gate.verdict({ id: "D", url: "d" }), "unchecked", "errors never block");
  const t0 = Date.now();
  assert.equal(await gate.verdict({ id: "E", url: "e" }), "unchecked", "timeout never blocks");
  assert.ok(Date.now() - t0 < 1000, "per-check timeout bounds the wait");
  // Cache: same job checked once per run, even across users.
  assert.equal(await gate.verdict({ id: "B", url: "b" }), "closed");
  assert.equal(calls.filter((u) => u === "b").length, 1);
  assert.equal(marked.length, 1);
  // Cap: beyond maxChecks no network call, admitted unchanged.
  states.f = "closed";
  assert.equal(await gate.verdict({ id: "F", url: "f" }), "unchecked");
  assert.ok(!calls.includes("f"), "no check beyond per-run cap");
  assert.deepEqual(gate.stats(), { checked: 5, closed: 1, unchecked: 4 });
  // markClosed failures do not throw.
  const g2 = createLivenessGate({ check: async () => ({ state: "closed", reason: "x" }), markClosed: async () => { throw new Error("db"); } });
  assert.equal(await g2.verdict({ id: "Z", url: "z" }), "closed");
  // Env parsing.
  assert.equal(livenessMaxChecksFromEnv(undefined), DEFAULT_LIVENESS_MAX_CHECKS);
  assert.equal(livenessMaxChecksFromEnv("0"), 0);
  assert.equal(livenessMaxChecksFromEnv("12"), 12);
  for (const bad of ["-1", "abc", "1.5", "9999"]) assert.equal(livenessMaxChecksFromEnv(bad), DEFAULT_LIVENESS_MAX_CHECKS);
  // Wiring: both cron producers and the consent endpoint gate before queueing.
  const cron = readFileSync("src/lib/auto-apply-cron.ts", "utf8");
  const helper = cron.indexOf("async function admitAutoApplyApplication");
  assert.ok(helper > 0, "creates go through admitAutoApplyApplication");
  const creates = [...cron.matchAll(/prisma\.application\.create\(/g)].map((m) => m.index!);
  assert.equal(creates.length, 2);
  assert.ok(creates.every((at) => at > helper), "application rows are created only inside the admission helper");
  const admissions = [...cron.matchAll(/admitAutoApplyApplication\(/g)].map((m) => m.index!).filter((at) => at < helper);
  assert.ok(admissions.length >= 2);
  for (const at of admissions) assert.ok(cron.slice(Math.max(0, at - 600), at).includes('livenessGate.verdict(job) === "closed"'), "create is preceded by liveness gate");
  const consent = readFileSync("src/app/api/applications/consent/route.ts", "utf8");
  assert.ok(consent.indexOf("gate.verdict(a.job)") < consent.indexOf('data: { status: "queued", consentGrantedAt'), "consent checks liveness before queueing");
  console.log("auto-apply liveness gate tests passed");
}
main().catch((e) => { console.error(e); process.exit(1); });
