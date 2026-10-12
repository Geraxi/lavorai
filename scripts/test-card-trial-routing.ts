/** Execute real async server-page routing using isolated dependencies; not Next E2E. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as policy from "../src/lib/card-trial-policy";
const jsx = (type: unknown, props: unknown) => ({ type, props });
function load(path: string, imports: Record<string, unknown>) {
  const source = readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const module = { exports: {} as { default: (...args: any[]) => Promise<any> } };
  runInNewContext(compiled, { module, exports: module.exports, Date, Boolean, Error, console, require(name: string) {
    if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
    if (!(name in imports)) throw new Error(`Unexpected dependency: ${name}`);
    return imports[name];
  } });
  return module.exports.default;
}
async function main() {
  const user = { id: "fixture-user", email: "fixture@example.test", locale: "en", emailVerified: new Date(), billingPolicy: policy.CARD_TRIAL_POLICY, createdAt: new Date(), tier: "free" };
  let enrollment: any = null;
  const redirect = (path: string) => { throw new Error(`REDIRECT:${path}`); };
  const legacyGuard = () => { throw new Error("New cohort reached legacy guard"); };
  const common = {
    "next/navigation": { redirect }, "@/lib/session": { getCurrentUser: async () => user },
    "@/lib/admin": { isAdmin: () => false }, "@/lib/card-trial-policy": policy,
    "@/lib/billing": { isApplicationAccessPaused: legacyGuard, requiresPaymentMethodBeforeApp: legacyGuard, trialEnd: legacyGuard },
  };
  const membership = load("src/app/start-membership/page.tsx", {
    ...common, "@/lib/activation-readiness": { getActivationReadiness: legacyGuard },
    "./start-membership-actions": { StartMembershipActions: "LegacyActions" },
    "./card-trial-membership": { CardTrialMembership: "Membership" },
    "@/components/user-popup": { UserPopup: "Popup" },
    "@/lib/card-trial-store": { getCardTrialEnrollment: async () => enrollment },
  });
  const renderMembership = () => membership({ searchParams: Promise.resolve({ subscribed: "1" }) });
  let rendered = await renderMembership();
  assert.equal(rendered.type, "Membership"); assert.equal(rendered.props.confirming, true); assert.equal(rendered.props.previewAvailable, false);
  enrollment = { tier: "pro", status: "trialing", subscriptionId: "sub-fixture", cardVerifiedAt: new Date(), trialEndsAt: new Date(Date.now() + 86400_000), cancelAtPeriodEnd: false, paidThrough: null };
  rendered = await renderMembership(); assert.equal(rendered.props.previewAvailable, true); assert.equal(rendered.props.enrollment.hasSubscription, true);
  enrollment.status = "payment_pending"; rendered = await renderMembership(); assert.equal(rendered.props.previewAvailable, false);
  enrollment.status = "active"; // active without paid-through never redirects
  await renderMembership();
  enrollment.paidThrough = new Date(Date.now() + 86400_000);
  await assert.rejects(renderMembership(), /REDIRECT:\/dashboard/);
  enrollment.paidThrough = new Date(Date.now() - 1); await renderMembership();
  for (const status of ["past_due", "canceled", "paused"]) { enrollment.status = status; await renderMembership(); }

  let paid = false, trial = false, cvReads = 0, jobReads = 0;
  const onboarding = load("src/app/onboarding/page.tsx", {
    ...common, "@/lib/auth": { auth: async () => ({ user }) },
    "@/lib/db": { prisma: { cVDocument: { findFirst: async () => { cvReads++; return null; } }, job: { findMany: async () => { jobReads++; return [{ id: "job", description: "Fixture role" }]; } } } },
    "@/lib/cv-profile": { extractProfile: () => { throw new Error("Unexpected profile extraction"); } },
    "@/lib/card-trial-store": { hasCardTrialPaidAccess: async () => paid, hasCardTrialPreviewWindow: async () => trial },
    "./card-trial-onboarding": { default: "Preview", __esModule: true },
    "./onboarding-client": { default: "FullSetup", __esModule: true },
  });
  await assert.rejects(onboarding(), /REDIRECT:\/start-membership/); assert.equal(cvReads, 0); assert.equal(jobReads, 0);
  trial = true; rendered = await onboarding(); assert.equal(rendered.type, "Preview"); assert.equal(jobReads, 1);
  trial = false; paid = true; rendered = await onboarding(); assert.equal(rendered.type, "FullSetup"); assert.equal(rendered.props.paidCardCohort, true);
  assert.equal(jobReads, 1, "Paid setup does not regenerate or start a second preview");
  console.log("PASS real server-page branches with mocks: card-required, verified preview, pending/failed/expired/canceled, paid redirect, isolated preview, paid setup; no Next/Stripe/DB integration");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
