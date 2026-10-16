import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { NextRequest, NextResponse } from "next/server";

function load(path: string, dependencies: Record<string, unknown>) {
  const module = { exports: {} as any };
  vm.runInNewContext(ts.transpileModule(readFileSync(path, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { module, exports: module.exports, Date, Buffer, console, require: (name: string) => { assert.ok(name in dependencies, name); return dependencies[name]; } });
  return module.exports;
}
async function main() {
  let owner: string | null = "owner", blocked = false, failure = false;
  const rows = new Map<string, Date | null>([["owner", null], ["other", null]]);
  let changes = 0;
  const prisma = { user: {
    findUnique: async () => owner ? { id: owner, email: "synthetic@example.invalid", suspendedAt: null } : null,
    updateMany: async ({ where, data }: any) => {
      if (failure) throw Error("Synthetic outage");
      assert.deepEqual(Object.keys(data), ["privacyConsentAt"]);
      assert.equal(where.id, owner); assert.equal(where.privacyConsentAt, null);
      if (rows.get(where.id) === null) { rows.set(where.id, data.privacyConsentAt); changes++; return { count: 1 }; }
      return { count: 0 };
    },
  } };
  const workspace = load("src/lib/workspace-mutation.ts", { "next/server": { NextResponse }, "@/lib/auth": { auth: async () => owner ? { user: { id: owner } } : null },
    "@/lib/db": { prisma }, "@/lib/admin": { isAdmin: () => false }, "@/lib/billing": { isApplicationAccessPaused: () => blocked, requiresPaymentMethodBeforeApp: () => false } });
  const route = load("src/app/api/account/privacy-consent/route.ts", { "next/server": { NextResponse }, "@/lib/db": { prisma }, "@/lib/workspace-mutation": workspace });
  const request = (body: unknown, origin = "http://localhost") => new NextRequest("http://localhost/api/account/privacy-consent", { method: "POST", headers: { origin, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  owner = null; assert.equal((await route.POST(request({ privacyConsent: true }))).status, 401); owner = "owner";
  blocked = true; assert.equal((await route.POST(request({ privacyConsent: true }))).status, 403); blocked = false;
  assert.equal((await route.POST(request({ privacyConsent: true }, "https://foreign.invalid"))).status, 403);
  for (const body of [null, {}, { privacyConsent: false }, { privacyConsent: "true" }, { privacyConsent: true, userId: "other" }, { privacyConsent: true, consentGrantedAt: new Date().toISOString() }]) assert.equal((await route.POST(request(body))).status, 400);
  assert.equal(changes, 0);
  failure = true; assert.equal((await route.POST(request({ privacyConsent: true }))).status, 503); failure = false;
  const replies = await Promise.all([route.POST(request({ privacyConsent: true })), route.POST(request({ privacyConsent: true }))]);
  assert.ok(replies.every(r => r.status === 200)); assert.equal(changes, 1); assert.equal(rows.get("other"), null);
  const first = rows.get("owner"); await route.POST(request({ privacyConsent: true })); assert.equal(rows.get("owner"), first);
  console.log("PASS privacy consent: explicit boolean, authenticated owner, CSRF, access gates, outage, idempotent timestamp, no application or queue mutations.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
