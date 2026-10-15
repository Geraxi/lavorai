import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

function load(path: string, dependencies: Record<string, unknown>) {
  const module = { exports: {} as Record<string, any> };
  const output = ts.transpileModule(readFileSync(path, "utf8"), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  } }).outputText;
  vm.runInNewContext(output, { module, exports: module.exports, Date, Set, URL, Buffer, Uint8Array, Response,
    console: { log() {}, warn() {}, error() {} },
    require: (id: string) => { assert.ok(id in dependencies, `Unexpected dependency ${id}`); return dependencies[id]; },
  }, { filename: path });
  return module.exports;
}
async function main() {
  let status: string | null = null;
  let viewedAt: Date | null = null;
  let updates = 0;
  const application = {
    findUnique: async ({ where, select }: any) => {
      assert.equal(select.userStatus, undefined, "Tracking must not infer a user-declared status");
      return where.trackingToken === "valid-token" ? { id: "app", viewedAt, user: { email: "owner@example.test", cvProfile: null } } : null;
    },
    updateMany: async ({ where, data }: any) => {
      assert.equal(where.id, "app"); assert.equal(where.viewedAt, null);
      assert.deepEqual(Object.keys(data), ["viewedAt"], "Tracking cannot change userStatus, reply count or delivery state");
      if (viewedAt) return { count: 0 };
      viewedAt = data.viewedAt; updates++; return { count: 1 };
    },
  };
  const pixel = load("src/app/api/track/open/[token]/route.ts", { "@/lib/db": { prisma: { application } } });
  const invalid = await pixel.GET({}, { params: Promise.resolve({ token: "unknown" }) });
  assert.equal(invalid.status, 200); assert.equal(invalid.headers.get("Content-Type"), "image/png"); assert.equal(updates, 0);
  await Promise.all(Array.from({ length: 6 }, () => pixel.GET({}, { params: Promise.resolve({ token: "valid-token" }) })));
  assert.equal(updates, 1); assert.equal(status, null);
  const firstView = viewedAt;
  const link = load("src/app/r/[token]/route.ts", { "@/lib/db": { prisma: { application } }, "next/navigation": { redirect: (url: string) => { throw new Error(`redirect:${url}`); } } });
  await assert.rejects(link.GET({ nextUrl: new URL("https://example.test/r/valid-token?ref=email") }, { params: Promise.resolve({ token: "valid-token" }) }), /redirect:mailto:owner@example.test/);
  assert.equal(viewedAt, firstView); assert.equal(updates, 1);
  status = "offerta"; viewedAt = null;
  await assert.rejects(link.GET({ nextUrl: new URL("https://example.test/r/valid-token") }, { params: Promise.resolve({ token: "valid-token" }) }), /redirect:https:\/\/lavorai.it/);
  assert.equal(status, "offerta"); assert.equal(updates, 2);
  console.log("PASS pixel/link CAS first-view tracking, invalid-token response and zero human-status promotion.");

  const receipts = load("src/lib/submission-receipt.ts", {});
  const evidence = load("src/lib/application-evidence.ts", { "@/lib/submission-receipt": receipts });
  const base = { userId: "owner", status: "success", submittedVia: "email_recruiter", submitConfirmation: "EMAIL_SENT", submissionReceiptJson: null,
    viewedAt: new Date(), userStatus: "vista", emailAttempts: [] as any[], createdAt: new Date(),
    job: { id: "job", title: "Designer", company: "Example", location: "Milan" },
  };
  const fixture = [
    { ...base, id: "legacy" },
    { ...base, id: "accepted", emailAttempts: [{ status: "accepted", providerEmailId: "accepted-id" }] },
    { ...base, id: "delivered", emailAttempts: [{ status: "delivered", providerEmailId: "delivered-id" }] },
    { ...base, id: "portal", submittedVia: "portal_greenhouse", submitConfirmation: "DETECTED_DOM", submissionReceiptJson: JSON.stringify({ version: 1, provider: "greenhouse", kind: "dom", jobId: "123", capturedAt: new Date().toISOString(), signal: "new_receipt_and_form_removed" }) },
    { ...base, id: "unverified-portal", submittedVia: "portal_greenhouse", submitConfirmation: "DETECTED_HTTP_200" },
    { ...base, id: "bounce", emailAttempts: [{ status: "bounced", providerEmailId: "bounced-id" }] },
    { ...base, id: "mock", submittedVia: "mock_demo", submitConfirmation: "DETECTED_DOM" },
    { ...base, id: "foreign", userId: "someone-else", emailAttempts: [{ status: "delivered", providerEmailId: "foreign-id" }] },
    ...Array.from({ length: 196 }, (_, i) => ({ ...base, id: `old-${i}` })),
  ];
  let pages = 0;
  const db = { application: {
    findMany: async (query: any) => {
      assert.equal(query.where.userId, "owner");
      if (query.select.interviewSessions) return [];
      assert.equal(query.take, 200); assert.equal(query.select.emailAttempts.take, 1); assert.equal(query.select.submissionReceiptJson, true);
      pages++;
      const start = query.cursor ? fixture.findIndex((row) => row.id === query.cursor.id) + 1 : 0;
      if (query.cursor) assert.equal(query.skip, 1);
      return fixture.slice(start, start + query.take);
    },
    count: async (query: any) => {
      assert.equal(query.where.userId, "owner");
      if (query.where.userStatus === "offerta") return 1;
      assert.equal(query.where.OR[0].replies.some.isHuman, true);
      assert.equal(query.where.OR[0].replies.some.isSecurityCode, false);
      assert.equal(query.where.OR[1].gmailMessages.some.userId, "owner");
      assert.equal(query.where.OR[1].gmailMessages.some.isHuman, true);
      assert.ok(!JSON.stringify(query).includes("viewedAt")); assert.ok(!JSON.stringify(query).includes("vista"));
      return 1;
    },
  } };
  const element = (type: unknown, props: unknown) => ({ type, props });
  const dependencies: Record<string, unknown> = {
    "react/jsx-runtime": { jsx: element, jsxs: element, Fragment: "Fragment" },
    "next/link": { default: "Link" }, "next-intl/server": { getLocale: async () => "it", getTranslations: async () => (key: string) => key },
    "@/lib/db": { prisma: db }, "@/lib/application-evidence": evidence,
    "@/lib/session": { getCurrentUser: async () => ({ id: "owner", email: "owner@example.test", name: "Owner", welcomeSeenAt: new Date() }) },
    "@/lib/onboarding": { getOnboardingState: async () => ({ hasUploadedCv: true, hasSetPreferences: true, hasFirstApplication: true }) },
    "@/lib/dashboard-globe-data": { getDashboardGlobeData: async () => ({ markers: [], stats: { counts: { open: 0 } } }) },
    "@/lib/auto-apply-readiness": { getAutoApplyReadiness: async () => ({}) },
  };
  const components: Record<string, string[]> = {
    "design/topbar": ["AppTopbar"], "design/icon": ["Icon"], "design/company-logo": ["CompanyLogo", "companyColor"],
    "onboarding-checklist": ["OnboardingChecklist"], "welcome-modal": ["WelcomeModal"], "dashboard-live-refresh": ["DashboardLiveRefresh"],
    "post-login-checkout": ["PostLoginCheckout"], "auto-apply-toggle": ["AutoApplyToggle"], "new-search-button": ["NewSearchButton"],
    "dashboard-globe-map": ["DashboardGlobeMap"], "dashboard-focus": ["DashboardFocusProvider"], "dashboard-region-panel": ["DashboardRegionPanel"],
    "auto-apply-readiness": ["AutoApplyReadinessCard"],
  };
  for (const [path, names] of Object.entries(components)) dependencies[`@/components/${path}`] = Object.fromEntries(names.map((name) => [name, name]));
  const dashboard = load("src/app/(app)/dashboard/page.tsx", dependencies);
  const rendered = await dashboard.default();
  assert.equal(pages, 2, "Dashboard evidence query paginates instead of silently truncating totals");
  const summaries: any[] = [];
  const walk = (node: any) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (node.props?.role === "listitem") summaries.push(node);
    walk(node.props?.children);
  };
  walk(rendered);
  assert.equal(summaries[0].props.children[0].props.children, 2, "Only real delivered email + verified portal receipt count");
  assert.equal(summaries[0].props.children[2].props.children[0], 1, "Provider accepted gets a distinct pending-delivery label");
  assert.equal(summaries[1].props.children[0].props.children, 1);
  assert.equal(summaries[1].props.children[1].props.children, "Con risposte recruiter");
  assert.equal(summaries[3].props.children[0].props.children, 1, "Manual offer status remains intact");
  console.log("PASS dashboard owner isolation, complete bounded pagination, real receipt/delivery evidence and source-row response counts.");

  const globe = load("src/lib/dashboard-globe-data.ts", {
    "@/lib/db": { prisma: {
      job: { findMany: async () => [], count: async () => 0 },
      application: { findMany: async (query: any) => {
        assert.equal(query.where.userId, "owner");
        if (query.where.status?.in) return [];
        assert.equal(query.select.submissionReceiptJson, true); assert.equal(query.select.emailAttempts.take, 1); assert.equal(query.take, 500);
        return fixture;
      } },
      userPreferences: { findUnique: async () => null }, cVProfile: { findUnique: async () => null },
    } },
    "@/lib/application-evidence": evidence, "@/lib/city-centroids": { matchCity: () => ({ key: "milan", name: "Milan", cc: "IT", lat: 45, lng: 9 }) },
    "@/lib/match-score": { quickMatchScore: () => 60 }, "@/lib/cv-profile-types": { rowToProfile: () => null },
    "@/lib/role-match": { titleMatchesAnyRole: () => true },
  });
  const map = await globe.getDashboardGlobeData("owner");
  assert.equal(map.stats.counts.sent, 2); assert.equal(map.markers[0].counts.sent, 2);
  console.log("PASS globe sent pins exclude legacy success, provider-only acceptance, failures, mocks and foreign owners.");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
