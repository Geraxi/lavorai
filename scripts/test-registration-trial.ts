import { encode } from "next-auth/jwt";
import { NextRequest } from "next/server";
import { proxy } from "../src/proxy";
import assert from "node:assert/strict";
import { trialState, effectiveTier, isApplicationAccessPaused, dailyApplicationLimit, requiresPaymentMethodBeforeApp, trialEnd } from "../src/lib/billing";
import { prisma } from "../src/lib/db";

async function main() {
  const now = Date.now();
  const free = { id: "free-test", email: "free@example.org", tier: "free", createdAt: new Date(now), trialEndsAt: null, subscriptionStatus: null, cardSetupAt: null as Date | null };
  assert.equal(trialState(free).status, "none", "New signups do not implicitly receive a trial");
  assert.equal(effectiveTier(free), "free");
  assert.equal(requiresPaymentMethodBeforeApp(free), true);
  assert.equal(requiresPaymentMethodBeforeApp({ ...free, cardSetupAt: new Date() }), false);
  assert.equal(isApplicationAccessPaused({ ...free, createdAt: new Date(0) }), false, "Free has no expiry");
  assert.equal(dailyApplicationLimit(free), 5);
  const end = new Date(now + 3 * 86400000);
  const legacy = { ...free, trialEndsAt: end, subscriptionStatus: "trialing" };
  assert.equal(trialState(legacy).status, "active");
  assert.equal(trialEnd(legacy)?.getTime(), +end, "Existing trial keeps its stored end");
  assert.equal(effectiveTier(legacy), "pro");
  assert.equal(requiresPaymentMethodBeforeApp(legacy), false);
  const ended = { ...legacy, trialEndsAt: new Date(now - 1) };
  assert.equal(trialState(ended).status, "ended");
  assert.equal(effectiveTier(ended), "free");
  assert.equal(isApplicationAccessPaused(ended), false);
  const find = prisma.user.findUnique;
  process.env.AUTH_SECRET = "local-test-secret-free-plan-only";
  const salt = "__Secure-authjs.session-token";
  const token = await encode({ token: { sub: free.id }, secret: process.env.AUTH_SECRET, salt });
  let current = free;
  (prisma.user as any).findUnique = async () => current;
  try {
    const req = (path: string) => new NextRequest(`https://lavorai.it${path}`, { headers: { cookie: `${salt}=${token}` } });
    assert.equal((await proxy(req("/dashboard"))).headers.get("location"), "https://lavorai.it/start-membership");
    assert.equal((await proxy(req("/api/applications/apply"))).status, 402);
    current = { ...free, cardSetupAt: new Date() };
    assert.equal((await proxy(req("/dashboard"))).status, 200);
    assert.equal((await proxy(req("/api/applications/apply"))).status, 200);
    assert.equal((await proxy(req("/api/stripe/checkout"))).status, 200);
  } finally { prisma.user.findUnique = find; }
  console.log("PASS new Free accounts, mandatory verified card, no implicit trial and preserved historical deadlines");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
