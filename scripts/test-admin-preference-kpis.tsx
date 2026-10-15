import { posthogMocks } from "./helpers/posthog-mocks";
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as React from "react";
import * as jsx from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import { aggregateAdminPreferences } from "../src/lib/admin-preference-metrics";
import { ADMIN_ROLE_TAXONOMY, classifyAdminRole, normalizeAdminRole } from "../src/lib/admin-role-taxonomy";
import { isAdmin, isTestAccount } from "../src/lib/admin";

function loadModule(path: string, dependencies: Record<string, unknown>) {
  dependencies = { ...posthogMocks, ...dependencies };
  const code = ts.transpileModule(readFileSync(path, "utf8"), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  } }).outputText;
  const module = { exports: {} as Record<string, any> };
  vm.runInNewContext(code, {
    module, exports: module.exports, Date, Map, Set, URLSearchParams,
    require(id: string) { assert.ok(id in dependencies, `Unexpected dependency ${id}`); return dependencies[id]; },
  }, { filename: path });
  return module.exports;
}
const Link = { __esModule: true, default: (props: any) => React.createElement("a", props) };
const ui = loadModule("src/app/(app)/admin/_ui.tsx", {
  "react/jsx-runtime": jsx, "next/link": Link, "./_chart-hover": { ChartHover: () => null },
});
const { AdminPreferenceKpis } = loadModule("src/app/(app)/admin/product/_preference-kpis.tsx", {
  "react/jsx-runtime": jsx, "../_ui": ui,
});
const user = (id: string, roles: unknown, email = `${id}@work-mail.invalid`) => ({
  id, email, preferences: roles === undefined ? null : { rolesJson: typeof roles === "string" ? roles : JSON.stringify(roles) },
});
const privateText = "PRIVATE HEALTH INFORMATION";
const fixtures = [
  user("one", [" Graphic   designer ", "graphic designer", "Ｇｒａｐｈｉｃ　ｄｅｓｉｇｎｅｒ", "Visual designer", "Software engineer", privateText, privateText.toLowerCase()]),
  user("one", ["Graphic designer"]),
  user("two", ["Graphic designer", "Data analyst"]),
  user("three", undefined), user("four", []), user("five", ["", "  ", "\n"]),
  user("six", "{broken"), user("seven", { role: "Graphic designer" }), user("eight", [null, 4, {}]),
  user("nine", ["Account manager", null, " "]),
  user("ten", [privateText, "private.person@work-mail.invalid", "Software engineer at Private Person"]),
];
const report = aggregateAdminPreferences(fixtures);
assert.equal(report.totalUsers, 10, "Deduplicate users before calculating the denominator");
assert.equal(report.withRoles, 4);
assert.equal(report.coveragePercent, 40);
assert.equal(report.withoutRoles, 6);
assert.equal(report.missingPreferences, 1);
assert.equal(report.emptyRoles, 2);
assert.equal(report.invalidWithoutRoles, 3);
assert.equal(report.invalidRoleData, 4, "Mixed arrays keep valid roles and disclose invalid entries");
assert.equal(report.classifiedUsers, 3);
assert.equal(report.classificationPercent, 30);
assert.equal(report.unclassifiedUsers, 2);
assert.equal(report.unclassifiedOnlyUsers, 1);
assert.equal(report.unclassifiedPairs, 4);
assert.deepEqual(report.roles.find((row) => row.role === "Graphic designer"), { role: "Graphic designer", users: 2, percent: 20 });
assert.equal(report.areas.find((row) => row.area === "Design e creatività")?.users, 2, "Deduplicate several roles in one area per user");
assert.equal(report.sectors.collected, false);
assert.equal(report.sectors.missingUsers, 10);
const serialized = JSON.stringify(report);
for (const secret of [privateText.toLowerCase(), "work-mail.invalid", "Private Person", "{broken", '"id":', '"email":']) {
  assert.ok(!serialized.toLowerCase().includes(secret.toLowerCase()), `Aggregate leaked ${secret}`);
}

const allLabels = Object.values(ADMIN_ROLE_TAXONOMY).flat().map(normalizeAdminRole);
assert.equal(new Set(allLabels).size, allLabels.length, "A role must map to exactly one area");
assert.equal(classifyAdminRole("Graphic designer with personal notes"), null);
assert.equal(classifyAdminRole("Graphic designer / Data analyst"), null, "Do not split or guess composite free text");
assert.equal(classifyAdminRole("Any role"), null);
assert.equal(classifyAdminRole("Frontend developer")?.role, "Frontend developer");
assert.equal(classifyAdminRole("Front-end developer")?.role, "Front-end developer", "Do not silently merge aliases");
assert.equal(classifyAdminRole("<script>alert(1)</script>"), null);
assert.equal(classifyAdminRole("Graphic\u200b designer"), null, "Unrecognized Unicode remains unclassified");
const multi = aggregateAdminPreferences([user("multi", ["Graphic designer", "Software engineer"])]);
assert.equal(multi.roles.reduce((total, row) => total + row.percent, 0), 200);
assert.equal(multi.areas.reduce((total, row) => total + row.percent, 0), 200);
const empty = aggregateAdminPreferences([]);
assert.equal(empty.coveragePercent, 0);
assert.equal(empty.classificationPercent, 0);
assert.deepEqual(empty.roles, []);
assert.deepEqual(empty.areas, []);
assert.equal(empty.sectors.missingUsers, 0);
assert.equal(aggregateAdminPreferences([user("null", "null")]).invalidWithoutRoles, 1);

async function main() {
  const raw = [
    ...Array.from({ length: 501 }, (_, i) => user(`regular-${i}`, ["Graphic designer"])),
    user("seed", ["Data analyst"], "test@lavorai.it"),
    user("automated", ["Graphic designer"], "e2e-run@work-mail.invalid"),
    user("founder", ["Graphic designer"], "umberto.geraci0+kpi@googlemail.com"),
    user("disposable", ["Graphic designer"], "someone@mailinator.com"),
  ];
  const queries: any[] = [];
  const { loadAdminPreferenceReport } = loadModule("src/lib/admin-preference-report.ts", {
    "@/lib/db": { prisma: { user: { findMany: async (query: any) => {
      queries.push(query); return query.take ? raw.slice(0, query.take) : raw;
    } } } },
    "@/lib/admin": { isTestAccount }, "@/lib/admin-preference-metrics": { aggregateAdminPreferences },
  });
  const real = await loadAdminPreferenceReport();
  assert.equal(real.totalUsers, 502, "Full all-time cohort, including users beyond 500");
  assert.equal(real.excludedInternalUsers, 3);
  assert.equal(real.internalUsers, 0);
  assert.equal(real.roles.find((row: any) => row.role === "Data analyst")?.users, 1, "Preserve existing treatment of test@lavorai.it");
  const all = await loadAdminPreferenceReport(true);
  assert.equal(all.totalUsers, 505);
  assert.equal(all.internalUsers, 3);
  assert.equal(all.realUsers, 502);
  assert.equal(all.excludedInternalUsers, 0);
  assert.equal(JSON.stringify(queries[0]), JSON.stringify({ select: { id: true, email: true, preferences: { select: { rolesJson: true } } } }));
  assert.ok(!JSON.stringify(all).includes("@"));
  assert.ok(!JSON.stringify(all).includes("regular-"));

  let viewer: { email: string } | null = null;
  const reads: string[] = [];
  let periodQuery: any;
  const growth = { applications: [], currentUsers: [], cvUploaded: 0, onboarded: 0, delivered: 0, confirmed: 0, appByStatus: [], verified: 0, firstApplication: 0 };
  const { default: ProductPage } = loadModule("src/app/(app)/admin/product/page.tsx", {
    "react/jsx-runtime": jsx, "next/link": Link,
    "next/navigation": { notFound: () => { throw new Error("NOT_FOUND"); } },
    "@/lib/session": { getCurrentUser: async () => viewer }, "@/lib/admin": { isAdmin },
    "@/lib/admin-growth-metrics": {
      adminPeriod: (query: any) => { periodQuery = query; return query; },
      loadAdminGrowthMetrics: async () => { reads.push("growth"); return growth; },
    },
    "@/lib/admin-preference-report": { loadAdminPreferenceReport: async (include: boolean) => { reads.push(`preferences:${include}`); return include ? all : real; } },
    "./_preference-kpis": { AdminPreferenceKpis }, "../_ui": ui,
    "../_growth-ui": { GrowthHeader: () => null, DataNotice: ({ children }: any) => React.createElement("div", {}, children) },
    "lucide-react": { FileText: () => null, Send: () => null, ShieldCheck: () => null, UserRoundCheck: () => null },
  });
  await assert.rejects(ProductPage({}), /NOT_FOUND/);
  viewer = { email: "ordinary@work-mail.invalid" };
  await assert.rejects(ProductPage({}), /NOT_FOUND/);
  assert.deepEqual(reads, [], "Anonymous/non-admin access must not query either report");
  viewer = { email: "umbertogeraci0@gmail.com" };
  const query = { range: "custom", from: "2026-09-01", to: "2026-09-30" };
  const pageHtml = renderToStaticMarkup(await ProductPage({ searchParams: Promise.resolve(query) }));
  assert.deepEqual(reads, ["growth", "preferences:false"]);
  assert.deepEqual(periodQuery, query, "Keep existing signup-period filters for existing product metrics");
  assert.ok(pageHtml.includes("range=custom&amp;from=2026-09-01&amp;to=2026-09-30&amp;includeTest=1#preferenze"));
  const allHtml = renderToStaticMarkup(await ProductPage({ searchParams: Promise.resolve({ ...query, includeTest: "1" }) }));
  assert.ok(allHtml.includes("Inclusi 502 utenti reali e 3 account interni/test"));
  assert.ok(allHtml.includes("range=custom&amp;from=2026-09-01&amp;to=2026-09-30#preferenze"));
  assert.equal(reads.at(-1), "preferences:true");

  const { AppSidebar } = loadModule("src/components/design/sidebar.tsx", {
    "react/jsx-runtime": jsx, "next/link": Link,
    swr: { __esModule: true, default: () => ({ data: { autoApplyToday: 0, autoApplyRemaining: 10 } }) },
    "@/components/logo": { Logo: () => null }, "next/navigation": { usePathname: () => "/admin/product" },
    "next-auth/react": { signOut: () => { throw new Error("No actions in render tests"); } },
    "motion/react": { motion: { span: () => null } }, "next-intl": { useTranslations: () => (key: string) => key },
    "@/components/design/icon": { Icon: () => null }, "@/lib/utils": { cn: (...values: unknown[]) => values.filter(Boolean).join(" ") },
    "@/components/design/theme-toggle": { ThemeToggle: () => null },
  });
  const adminNav = renderToStaticMarkup(React.createElement(AppSidebar, { isAdmin: true }));
  const regularNav = renderToStaticMarkup(React.createElement(AppSidebar, { isAdmin: false }));
  assert.ok(adminNav.includes('href="/admin/product" class="ds-nav-item active"'), "Product is discoverable and selected in the actual admin sidebar");
  assert.ok(!regularNav.includes('href="/admin/product"'), "Product navigation remains administrator-only");

  const html = renderToStaticMarkup(React.createElement(AdminPreferenceKpis, { metrics: report, includeTest: false,
    actions: React.createElement("a", { href: "#preferenze", className: "adm-btn" }, "Preferenze: includi test"),
  }));
  for (const copy of ["Ruoli salvati nelle preferenze", "Aree professionali derivate dai ruoli", "Non classificati: 2 utenti", "superare il 100%", "Non raccolti", "suggerimenti AI", "20%", "iscritti in qualsiasi data"]) assert.ok(html.includes(copy), copy);
  assert.ok(html.includes("width:20%"), "Chart width uses all users, including missing preferences");
  for (const secret of [privateText, "private.person", "Private Person", "Software engineer at"]) assert.ok(!html.includes(secret));
  const emptyHtml = renderToStaticMarkup(React.createElement(AdminPreferenceKpis, { metrics: empty, includeTest: false }));
  assert.ok(emptyHtml.includes("Nessun utente nella base selezionata"));
  assert.ok(!/NaN|Infinity/.test(emptyHtml));
  const missingHtml = renderToStaticMarkup(React.createElement(AdminPreferenceKpis, { metrics: aggregateAdminPreferences([user("missing", undefined)]), includeTest: false }));
  assert.ok(missingHtml.includes("1 senza preferenze salvate"));
  const unknownHtml = renderToStaticMarkup(React.createElement(AdminPreferenceKpis, { metrics: aggregateAdminPreferences([user("unknown", [privateText])]), includeTest: false }));
  assert.ok(unknownHtml.includes("1 con sole voci fuori catalogo"));
  assert.ok(!unknownHtml.includes(privateText));

  // Opt-in local fixture preview: only synthetic data, no application server or DB.
  if (process.env.ADMIN_KPI_PREVIEW_DIR) {
    mkdirSync(process.env.ADMIN_KPI_PREVIEW_DIR, { recursive: true });
    const layout = readFileSync("src/app/(app)/admin/layout.tsx", "utf8");
    const styles = layout.split("<style>{`")[1].split("`}</style>")[0];
    for (const [name, body] of [["populated", html], ["empty", emptyHtml], ["unknown", unknownHtml]]) {
      writeFileSync(`${process.env.ADMIN_KPI_PREVIEW_DIR}/${name}.html`, `<!doctype html><html lang="it"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"><title>Admin KPI synthetic fixture</title><style>:root{--bg-elev:#161b22;--bg-sunken:#10151b;--border-ds:#303841;--fg:#f1f5f9;--fg-muted:#b3bdc9;--fg-subtle:#98a4b3;--primary:154 65% 48%}*{box-sizing:border-box}body{margin:0;background:#0d1117;color:var(--fg);font-family:Arial,sans-serif}h2,h3,p{margin:0}${styles}</style><div class="adm-root"><main class="adm-content"><div class="adm-page">${body}</div></main></div></html>`);
    }
  }
  console.log("Admin preference KPIs passed: distinct-user/area deduplication, normalization, missing/invalid/unknown coverage, privacy-safe classification, full cohort, unchanged test-account policy, auth-before-query, retained period filters and SSR rendering.");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
