import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as React from "react";
import * as jsx from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import * as catalogue from "../src/lib/job-catalogue-policy";
import * as seo from "../src/lib/job-seo";

// Exercise the actual public route with isolated database/UI boundaries. No network.
process.env.APPLICATION_PROVIDER_POLICY = "recruitee_only";
process.env.APPLICATION_PROVIDER_NOT_BEFORE = "2026-10-27T23:16:58.626Z";
const now = new Date();
const fresh = {
  id: "current-job", title: "Current developer", company: "Current company", location: "Milano",
  remote: false, source: "recruitee", url: "https://example.recruitee.com/o/developer",
  closedAt: null, cachedAt: now, postedAt: now, publicationVerifiedAt: now,
  applicationFormCapability: "standard", description: "Current description", contractType: null,
  salaryMin: null, salaryMax: null, protectedCategory: false, externalId: "fixture", category: "IT",
};
let job: any = fresh;
let alternatives: any[] = [];
let queries: any[] = [];
const Link = ({ children, ...props }: any) => React.createElement("a", props, children);
const deps: Record<string, any> = {
  "react/jsx-runtime": jsx,
  "next/link": { default: Link, __esModule: true },
  "@/lib/job-catalogue-policy": catalogue,
  "@/lib/job-source-label": { jobSourceLabel: () => "Recruitee" },
  "@/components/site-footer": { SiteFooter: () => null },
  "@/components/site-nav": { SiteNav: () => null },
  "@/components/design/company-logo": { CompanyLogo: () => null },
  "@/lib/db": { prisma: { job: {
    findUnique: async () => job,
    findMany: async (query: any) => { queries.push(query); return alternatives; },
  } } },
  "@/lib/jobs-repo": { formatSalary: () => null },
  "@/lib/job-seo": seo,
};
const path = "src/app/(marketing)/lavoro/[id]/page.tsx";
const code = ts.transpileModule(readFileSync(path, "utf8"), { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
} }).outputText;
const mod = { exports: {} as any };
vm.runInNewContext(code, {
  module: mod, exports: mod.exports, process, Date, console,
  require(id: string) { assert.ok(id in deps, `Unexpected dependency ${id}`); return deps[id]; },
}, { filename: path });
const params = { params: Promise.resolve({ id: "inbound-job" }) };
const render = async () => renderToStaticMarkup(await mod.exports.default(params));

function saveFixture(name: string, html: string) {
  mkdirSync("scripts/tmp/public-job-entry", { recursive: true });
  const css = readFileSync("src/app/globals.css", "utf8");
  writeFileSync(`scripts/tmp/public-job-entry/${name}.html`, `<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style></head><body><div data-theme="dark">${html}</div></body></html>`);
}

async function main() {
  for (const [name, patch] of Object.entries({
    missing: null,
    closed: { closedAt: now },
    stale: { publicationVerifiedAt: new Date(+now - catalogue.PUBLICATION_FRESH_MS - 1000) },
    unknown: { publicationVerifiedAt: null },
    future: { publicationVerifiedAt: new Date(+now + 60_000) },
    unsupported: { source: "lever" },
    questions: { applicationFormCapability: "questions" },
    test: { source: "ats_test" },
    ownedTest: { url: `${catalogue.OWNED_TEST_PREFIX}fixture` },
    expired: { cachedAt: new Date(+now - 31 * 86400_000) },
  })) {
    job = patch === null ? null : { ...fresh, id: "hidden-id", title: "HIDDEN TITLE", company: "HIDDEN COMPANY", description: "HIDDEN DESCRIPTION", url: "https://hidden.recruitee.com/o/private", protectedCategory: true, ...patch };
    alternatives = [fresh, { ...fresh, id: "blocked-alternative", source: "ats_test", title: "BLOCKED ALTERNATIVE" }];
    queries = [];
    const html = await render();
    if (name === "closed") saveFixture("unavailable", html);
    assert.match(html, /Questo annuncio non è disponibile/, name);
    assert.match(html, /href="\/signup\?next=%2Fjobs"/, name);
    assert.match(html, /carta richiesta prima dell’onboarding/, name);
    assert.match(html, /href="\/lavoro\/current-job"/, name);
    assert.match(html, /Current developer/, name);
    for (const hidden of ["HIDDEN TITLE", "HIDDEN COMPANY", "HIDDEN DESCRIPTION", "hidden.recruitee.com", "hidden-id", "BLOCKED ALTERNATIVE", "JobPosting", "&amp;protected=1", "Candidati con LavorAI"]) {
      assert.ok(!html.includes(hidden), `${name}: must not disclose ${hidden}`);
    }
    assert.equal(queries.length, 1);
    const query = queries[0];
    const at = query.where.AND[0].publicationVerifiedAt.lte;
    assert.equal(JSON.stringify(query.where.AND[0]), JSON.stringify(catalogue.catalogueWhere(at)));
    assert.equal(query.where.closedAt, null);
    assert.equal(query.where.id.not, "inbound-job");
    assert.ok(query.where.cachedAt.gte instanceof Date);
    assert.equal(query.take, 6);
    assert.ok(!query.select.description && !query.select.protectedCategory);
    const metadata = await mod.exports.generateMetadata(params);
    assert.equal(metadata.robots.index, false);
    assert.equal(metadata.robots.follow, true);
    assert.ok(!JSON.stringify(metadata).includes("HIDDEN"));
    assert.ok(!metadata.openGraph);
  }
  job = null;
  alternatives = [];
  saveFixture("empty", await render());
  assert.match(await render(), /Al momento non ci sono altre offerte da mostrare/);
  assert.match(await render(), /href="\/signup\?next=%2Fjobs"/);

  job = { ...fresh, protectedCategory: true };
  const html = await render();
  saveFixture("visible", html);
  assert.match(html, /Current description/);
  assert.match(html, /"@type":"JobPosting"/);
  assert.match(html, /href="\/signup\?next=%2Fjobs%2Fcurrent-job&amp;protected=1"/);
  assert.match(html, /Prova gratis, con carta richiesta/);
  assert.doesNotMatch(html, /Questo annuncio non è disponibile/);
  assert.equal((await mod.exports.generateMetadata(params)).robots.index, true);

  process.env.APPLICATION_PROVIDER_POLICY = "invalid-policy";
  alternatives = [fresh];
  assert.match(await render(), /Questo annuncio non è disponibile/);
  assert.doesNotMatch(await render(), /href="\/lavoro\/current-job"/);
  assert.equal((await mod.exports.generateMetadata(params)).robots.index, false);
  console.log("PASS public job entry: unavailable/hidden/missing/expired fail closed, no metadata or field leaks, current alternatives, empty state, signup and visible-job flow preserved; no network");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
