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
    { ...base, id: "legacy", submittedAt: new Date("2026-10-01") },
    { ...base, id: "accepted", emailAttempts: [{ status: "accepted", providerEmailId: "accepted-id" }] },
    { ...base, id: "delivered", emailAttempts: [{ status: "delivered", providerEmailId: "delivered-id" }] },
    { ...base, id: "portal", submittedVia: "portal_greenhouse", submitConfirmation: "DETECTED_DOM", submissionReceiptJson: JSON.stringify({ version: 1, provider: "greenhouse", kind: "dom", jobId: "123", capturedAt: new Date().toISOString(), signal: "new_receipt_and_form_removed" }) },
    { ...base, id: "unverified-portal", submittedVia: "portal_greenhouse", submitConfirmation: "DETECTED_HTTP_200", submittedAt: new Date("2026-10-01") },
    { ...base, id: "bounce", emailAttempts: [{ status: "bounced", providerEmailId: "bounced-id" }] },
    { ...base, id: "mock", submittedVia: "mock_demo", submitConfirmation: "DETECTED_DOM" },
    { ...base, id: "foreign", userId: "someone-else", emailAttempts: [{ status: "delivered", providerEmailId: "foreign-id" }] },
    ...Array.from({ length: 196 }, (_, i) => ({ ...base, id: `old-${i}`, submittedAt: new Date("2026-10-01") })),
  ];
  let pages = 0;
  const db = { application: {
    findMany: async (query: any) => {
      assert.equal(query.where.userId, "owner");
      if (query.select.interviewSessions) return [];
      // Time-series read (sparklines/trend): owner-scoped, covered by test-dashboard-time-series.
      if (query.select.submittedAt && query.where.OR?.[0]?.submittedAt) return [];
      if (query.where.OR) {
        // Interview invites: evidence only (recruiter reply kind or user-declared status); practice sessions never count.
        assert.equal(JSON.stringify(query.where.OR), JSON.stringify([{ userStatus: "colloquio" }, { lastReplyKind: "colloquio" }]));
        assert.equal(query.select.interviewSessions, undefined);
        return [];
      }
      assert.equal(query.select.emailAttempts.take, 1); assert.equal(query.select.submissionReceiptJson, true);
      // Recent-activity list: a small, owner-scoped page that reads the same delivery evidence.
      if (query.take !== 200) return fixture.filter((row) => row.userId === "owner").slice(0, query.take);
      pages++;
      const start = query.cursor ? fixture.findIndex((row) => row.id === query.cursor.id) + 1 : 0;
      if (query.cursor) assert.equal(query.skip, 1);
      return fixture.slice(start, start + query.take);
    },
    groupBy: async (query: any) => {
      assert.equal(query.where.userId, "owner");
      assert.equal(JSON.stringify(query.by), JSON.stringify(["status"]));
      return [{ status: "success", _count: { _all: 8 } }, { status: "pending", _count: { _all: 2 } }];
    },
    count: async (query: any) => {
      assert.equal(query.where.userId, "owner");
      if (query.where.userStatus === "offerta") return 1;
      if (query.where.OR?.[0]?.userStatus === "colloquio") {
        assert.equal(JSON.stringify(query.where.OR), JSON.stringify([{ userStatus: "colloquio" }, { lastReplyKind: "colloquio" }]));
        return 1;
      }
      assert.equal(query.where.OR[0].replies.some.isHuman, true);
      assert.equal(query.where.OR[0].replies.some.isSecurityCode, false);
      assert.equal(query.where.OR[1].gmailMessages.some.userId, "owner");
      assert.equal(query.where.OR[1].gmailMessages.some.isHuman, true);
      assert.ok(!JSON.stringify(query).includes("viewedAt")); assert.ok(!JSON.stringify(query).includes("vista"));
      return 1;
    },
  },
  applicationReply: { findMany: async (query: any) => { assert.equal(query.where.application.userId, "owner"); return []; } },
  gmailMessage: { findMany: async (query: any) => { assert.equal(query.where.userId, "owner"); return []; } },
  job: { findMany: async (query: any) => {
    // getMatchingOpportunities: owner-scoped, open, not dismissed, not already applied.
    assert.equal(query.where.dismissals.none.userId, "owner"); assert.equal(query.where.closedAt, null);
    assert.equal(query.where.NOT.applications.some.userId, "owner");
    return [
      ...Array.from({ length: 5 }, (_, i) => ({ id: `j${i}`, title: "Product Designer", company: `Co ${i}`, description: "", salaryMin: null, salaryMax: null })),
      { id: "avoid", title: "Product Designer", company: "Avoid Co", description: "", salaryMin: null, salaryMax: null },
      { id: "role", title: "Backend Engineer", company: "Other", description: "", salaryMin: null, salaryMax: null },
      // Preferences store €k: 30 = €30k. 25000 and "25" (k) are both below it; 38000 passes.
      { id: "low", title: "Product Designer", company: "Low Pay", description: "", salaryMin: 20000, salaryMax: 25000 },
      { id: "lowk", title: "Product Designer", company: "Low Pay K", description: "", salaryMin: null, salaryMax: 25 },
      { id: "ok", title: "Product Designer", company: "Fair Pay", description: "", salaryMin: 38000, salaryMax: null },
    ];
  } },
  userPreferences: { findUnique: async (query: any) => { assert.equal(query.where.userId, "owner"); return { rolesJson: JSON.stringify(["Product Designer"]), salaryMin: 30, matchMin: 0 }; } },
  user: { findUnique: async (query: any) => { assert.equal(query.where.id, "owner"); return { avoidCompanies: "Avoid Co", cvProfile: null }; } },
  cVDocument: { findFirst: async (query: any) => { assert.equal(query.where.userId, "owner"); return null; } },
  cVProfile: { findUnique: async (query: any) => { assert.equal(query.where.userId, "owner"); return null; } },
  };
  const element = (type: unknown, props: unknown) => ({ type, props });
  const uiStatus = load("src/lib/ui-application-status.ts", {});
  const stageModule = load("src/lib/application-stage.ts", { "@/lib/application-evidence": evidence, "@/lib/ui-application-status": uiStatus });
  const metrics = load("src/lib/dashboard-metrics-shared.ts", { "@/lib/db": { prisma: db }, "@/lib/application-evidence": evidence, "@/lib/application-stage": stageModule, "@/lib/ui-application-status": uiStatus, "@/lib/inbox-counts": load("src/lib/inbox-counts.ts", {}),
    "@/lib/cv-profile-types": { rowToProfile: (row: unknown) => row },
    "@/lib/match-score": { quickMatchScore: () => 100 },
    "@/lib/role-match": load("src/lib/role-match.ts", {}) });
  assert.equal(await metrics.getMatchingOpportunityCount("owner"), 6, "Scopri/Dashboard/Jobs opportunities apply roles, avoided companies and the €k salary minimum");
  const lucide = new Proxy({}, { get: (_target, name) => String(name), has: () => true });
  const dependencies: Record<string, unknown> = {
    "react/jsx-runtime": { jsx: element, jsxs: element, Fragment: "Fragment" },
    "next/link": { default: "Link" }, "next-intl/server": { getLocale: async () => "it", getTranslations: async () => (key: string) => key },
    "@/lib/db": { prisma: db }, "@/lib/application-evidence": evidence, "@/lib/dashboard-metrics-shared": metrics,
    "lucide-react": lucide, "./dashboard.css": {},
    "@/components/ui-premium/sparkline": { Sparkline: "Sparkline" },
    "@/components/ui-premium/trend-chart": { TrendChart: "TrendChart", TrendLegend: "TrendLegend" },
    "@/components/ui-premium/pill": { Pill: "Pill" }, "@/components/ui-premium/avatar": { Avatar: "Avatar" },
    "@/components/ui-premium/empty-state": { EmptyState: "EmptyState" }, "@/components/ui-premium/status-bar": { StatusBar: "StatusBar" },
    "@/components/ui-premium/tone": load("src/components/ui-premium/tone.ts", {}),
    "@/lib/session": { getCurrentUser: async () => ({ id: "owner", email: "owner@example.test", name: "Owner", welcomeSeenAt: new Date(), emailVerified: new Date(), subscriptionStatus: "active" }) },
    "@/lib/attention-repository": { getAttentionQueue: async () => ({ items: [], unread: 0, unknownRead: 0, drafts: 0, limited: false }) },
    "@/components/attention-queue": { AttentionQueue: "AttentionQueue" },
    "@/lib/onboarding": { getOnboardingState: async () => ({ hasUploadedCv: true, hasSetPreferences: true, hasFirstApplication: true }) },
    "@/lib/dashboard-globe-data": { getDashboardGlobeData: async () => ({ markers: [], stats: { counts: { open: 0 } } }) },
    "@/lib/auto-apply-readiness": { getAutoApplyReadiness: async () => ({}) },
    "@/lib/cv-profile-types": { rowToProfile: () => null },
    "@/lib/ui-application-status": load("src/lib/ui-application-status.ts", {}),
  };
  const components: Record<string, string[]> = {
    "design/topbar": ["AppTopbar"], "design/icon": ["Icon"], "design/company-logo": ["CompanyLogo", "companyColor"],
    "onboarding-checklist": ["OnboardingChecklist"], "welcome-modal": ["WelcomeModal"], "dashboard-live-refresh": ["DashboardLiveRefresh"],
    "post-login-checkout": ["PostLoginCheckout"], "auto-apply-toggle": ["AutoApplyToggle"], "new-search-button": ["NewSearchButton"],
    "dashboard-globe-map": ["DashboardGlobeMap"], "dashboard-focus": ["DashboardFocusProvider"], "dashboard-region-panel": ["DashboardRegionPanel"],
    "auto-apply-readiness": ["AutoApplyReadinessCard"],
  };
  for (const [path, names] of Object.entries(components)) dependencies[`@/components/${path}`] = Object.fromEntries(names.map((name) => [name, name]));
  // The real KPI card renders the number the test reads.
  dependencies["@/components/ui-premium/kpi-card"] = load("src/components/ui-premium/kpi-card.tsx", {
    "react/jsx-runtime": dependencies["react/jsx-runtime"], "next/link": { default: "Link" },
  });
  const dashboard = load("src/app/(app)/dashboard/page.tsx", dependencies);
  const rendered = await dashboard.default();
  assert.equal(pages, 2, "Dashboard evidence query paginates instead of silently truncating totals");
  const kpis: Record<string, unknown> = {};
  const stageCounts: Record<string, number> = {};
  const walk = (node: any) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (typeof node.type === "function") { walk(node.type(node.props)); return; }
    const kpi = node.props?.["data-kpi"];
    if (kpi) {
      const find = (n: any): any => {
        if (!n || typeof n !== "object") return null;
        if (Array.isArray(n)) { for (const c of n) { const hit = find(c); if (hit) return hit; } return null; }
        return n.props?.className === "pm-kpi-value" ? n : find(n.props?.children);
      };
      kpis[kpi] = find(node.props.children).props.children;
    }
    if (node.props?.["data-stage"]) stageCounts[node.props["data-stage"]] = node.props["data-count"];
    walk(node.props?.children);
  };
  walk(rendered);
  assert.equal(kpis.confirmed, "1", "Only verified portal receipt / confirmedAt count; Resend delivered is not confirmed");
  assert.equal(kpis.replies, "1", "Recruiter replies come from human, non-security-code source rows");
  assert.equal(kpis.interviews, "1", "Interviews count recruiter/user evidence only");
  assert.equal(kpis.offers, "1", "Manual offer status remains intact");
  assert.equal(stageCounts.sent, 1, "Progress 'sent' uses receipts/confirmedAt only, not Resend delivered");
  assert.equal(stageCounts.submitted, 1, "Resend accepted is provider-accepted, not ATS-accepted");
  assert.equal(stageCounts.email_delivered, 1, "Resend delivered stays a distinct email-delivered count");
  assert.equal(uiStatus.STAGE_LABEL.sent_unverified.it, "Invii registrati, senza conferma");
  assert.equal(stageCounts.stopped, 1, "A bounced email is not sent");
  assert.equal(stageCounts.sent_unverified, 198, "Legacy success+submittedAt rows are sent-unverified, not fabricated receipts");
  assert.equal(stageCounts.unverified, 1, "Mock/demo success without a send timestamp stays outcome-unverified");
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
    "@/lib/application-evidence": evidence, "@/lib/city-centroids": { matchCity: () => ({ key: "milan", name: "Milan", cc: "IT", lat: 45, lng: 9 }) }, "@/lib/scrapers/ats-companies": { seedCompanyCountry: () => null },
    "@/lib/match-score": { quickMatchScore: () => 60 }, "@/lib/cv-profile-types": { rowToProfile: () => null },
    "@/lib/role-match": { titleMatchesAnyRole: () => true },
    "@/lib/globe-geometry": load("src/lib/globe-geometry.ts", {}),
  });
  const map = await globe.getDashboardGlobeData("owner");
  assert.equal(map.stats.counts.sent, 1); assert.equal(map.markers[0].counts.sent, 1);
  console.log("PASS globe sent pins exclude legacy success, provider-only acceptance, failures, mocks and foreign owners.");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
