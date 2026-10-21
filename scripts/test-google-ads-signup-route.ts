import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { NextRequest, NextResponse } from "next/server";
import * as zod from "zod";

// Real signup handler with every service mocked. No account, DB, email or network.
async function main() {
  let exists = false, fail = false, created = 0, events = 0;
  const db = { user: {
    findFirst: async () => exists ? { id: "fixture" } : null,
    create: async () => {
      if (fail || exists) throw new Error("fixture creation failure");
      exists = true; created++;
      return { id: "fixture", email: "fixture@example.test", locale: "it" };
    },
  } };
  const deps: Record<string, unknown> = {
    "@/lib/billing": { registrationTrialEnd: () => new Date() }, "next/server": { NextResponse }, zod,
    bcryptjs: { default: { hash: async () => "fixture-hash" } }, "@/lib/db": { prisma: db },
    "@/lib/rate-limit": { authLimiter: { limit: async () => ({ success: true }) } },
    "@/lib/password-policy": { validatePassword: () => ({ ok: true }) },
    "@/lib/csrf": { checkOrigin: () => true }, "@/lib/email-verification": { sendVerificationEmail: async () => {} },
    "@/lib/analytics": { AnalyticsEvent: {} }, "@/lib/conversion-events": { recordConversionEvent: async () => {} },
    "@/lib/registration-conversion": { createRegistrationConversion: async () => { assert.equal(created, 1); events++; } },
  };
  const module = { exports: {} as { POST: (r: NextRequest) => Promise<Response> } };
  vm.runInNewContext(ts.transpileModule(readFileSync("src/app/api/auth/signup/route.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { module, exports: module.exports, Date, console: { error: () => {} }, require: (key: string) => { assert.ok(key in deps, `Unmocked: ${key}`); return deps[key]; } });
  const req = (body: unknown = { email: "fixture@example.test", password: "Test-Only-123!", privacyConsent: true }) => new NextRequest("http://localhost/api/auth/signup", { method: "POST", body: JSON.stringify(body) });
  assert.equal((await module.exports.POST(req({}))).status, 400); assert.equal(events, 0);
  exists = true;
  assert.equal((await module.exports.POST(req())).status, 409); assert.equal(events, 0);
  exists = false; fail = true;
  assert.equal((await module.exports.POST(req())).status, 500); assert.equal(events, 0);
  fail = false;
  const responses = await Promise.all([module.exports.POST(req()), module.exports.POST(req())]);
  assert.equal(responses.filter((r) => r.ok).length, 1); assert.equal(events, 1); assert.equal(created, 1);
  console.log("PASS real signup handler: validation/existing/create failure issue no event; double submit issues exactly one event, after account creation. All services mocked.");
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
