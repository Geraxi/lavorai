import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { z } from "zod";
import * as React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import * as rollout from "../src/lib/application-rollout";
import * as pause from "../src/lib/application-pause";

// Actual server and client source, isolated from DB, authentication and network.
function load(path: string, dependencies: Record<string, unknown>) {
  const module = { exports: {} as Record<string, any> };
  const output = ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    fileName: path,
  }).outputText;
  new Function("require", "module", "exports", "fetch", output)(
    (name: string) => { assert.ok(name in dependencies, `Unexpected dependency ${name}`); return dependencies[name]; },
    module, module.exports, () => { throw new Error("Network forbidden in visibility tests"); },
  );
  return module.exports;
}
const start = new Date(Date.now() - 3_600_000).toISOString();
function configure(overrides: Record<string, string | undefined> = {}) {
  const env = { APPLICATIONS_PAUSED: "false", APPLICATION_SENDING_MODE: "manual_only",
    APPLICATION_ROLLOUT_START_AT: start, APPLY_GLOBAL_DAILY_CAP: "10", ...overrides };
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
}
function renderToggle(data: any, previouslyOpen = false) {
  let stateIndex = 0;
  const component = load("src/components/auto-apply-toggle.tsx", {
    react: { ...React, useState: (initial: unknown) => [stateIndex++ === 1 ? previouslyOpen : initial, () => {}] },
    "react/jsx-runtime": jsxRuntime,
    swr: { __esModule: true, default: () => ({ data, mutate: () => { throw new Error("Preference mutation forbidden"); } }) },
    sonner: { toast: { success: () => {}, error: () => {} } },
    "@/components/design/icon": { Icon: ({ name }: { name: string }) => React.createElement("i", { "data-icon": name }) },
  }).AutoApplyToggle;
  return renderToStaticMarkup(React.createElement(component));
}
async function main() {
  const original = { ...process.env };
  let preferenceReads = 0;
  let forbiddenAccesses = 0;
  const unavailable = new Proxy({}, { get() { forbiddenAccesses++; throw new Error("Unexpected database mutation or history read"); } });
  const dependencies = {
    zod: { z }, "@/lib/application-rollout": rollout, "@/lib/application-pause": pause,
    "next/server": { NextResponse: { json: (body: unknown, options?: { status: number }) => ({ body, status: options?.status ?? 200 }) } },
    "@/lib/session": { getCurrentUser: async () => ({ id: "owner" }) },
  };
  try {
    const states = [
      { env: {}, paused: false, cap: 10 },
      { env: { APPLICATIONS_PAUSED: "true" }, paused: true, cap: 10 },
      { env: { APPLICATIONS_PAUSED: "typo" }, paused: true, cap: 10 },
      { env: { APPLICATION_SENDING_MODE: "auto" }, paused: true, cap: null },
      { env: { APPLICATION_SENDING_MODE: "invalid" }, paused: true, cap: null },
      { env: { APPLICATION_ROLLOUT_START_AT: "invalid" }, paused: true, cap: null },
      { env: { APPLICATION_ROLLOUT_START_AT: new Date(Date.now() + 3_600_000).toISOString() }, paused: true, cap: null },
      { env: { APPLY_GLOBAL_DAILY_CAP: "0" }, paused: true, cap: null },
      { env: { APPLY_GLOBAL_DAILY_CAP: "99999" }, paused: true, cap: null },
      { env: { APPLY_GLOBAL_DAILY_CAP: undefined }, paused: false, cap: 300 },
      { env: { APPLY_GLOBAL_DAILY_CAP: "5" }, paused: false, cap: 5 },
    ];
    for (const state of states) for (const savedMode of ["auto", "hybrid", "manual", "off"]) {
      configure(state.env);
      const savedPreference = { autoApplyMode: savedMode, matchMin: 73 };
      const before = structuredClone(savedPreference);
      const route = load("src/app/api/preferences/route.ts", {
        ...dependencies, "@/lib/db": { prisma: { userPreferences: {
          findUnique: async () => { preferenceReads++; return savedPreference; },
          upsert: unavailable,
        } } },
      });
      const response = await route.GET();
      assert.equal(response.status, 200);
      assert.equal(response.body.autoApplyMode, savedMode);
      assert.equal(response.body.matchMin, 73);
      assert.deepEqual(savedPreference, before);
      assert.deepEqual(response.body.applicationService, {
        automaticBlocked: true, submissionsPaused: state.paused, dailyCap: state.cap,
      });
      assert.deepEqual(Object.keys(response.body.applicationService).sort(), ["automaticBlocked", "dailyCap", "submissionsPaused"]);
      assert.ok(!JSON.stringify(response.body).includes(start), "Do not expose rollout timestamp or configuration internals");

      const readiness = load("src/lib/auto-apply-readiness.ts", {
        "@/lib/application-rollout": rollout, "@/lib/application-pause": pause, "@/lib/db": { prisma: unavailable },
      });
      const notice = await readiness.getAutoApplyReadiness("owner", 500);
      assert.equal(notice.title, state.paused ? "Invii in pausa" : "Solo candidature confermate");
      assert.equal(notice.tone, state.paused ? "paused" : "action");
      assert.doesNotMatch(notice.title + notice.detail, /Auto-apply al lavoro|ricerca attiva|Riattiva auto-apply/);
      if (!state.paused) {
        assert.match(notice.detail, new RegExp(`complessivo di ${state.cap} invii al giorno \\(UTC\\)`));
        assert.match(notice.detail, /automatico è sospeso/);
      }

      // Existing open menus disappear too after the server reports a hold.
      for (const previouslyOpen of [false, true]) {
        const html = renderToggle(response.body, previouslyOpen);
        assert.match(html, /disabled=""/);
        assert.match(html, state.paused ? /Invii in pausa/ : /Solo candidature confermate/);
        assert.doesNotMatch(html, /100% automatico|100% Automatica|chevron-down|Richiede approvazione/);
        if (!state.paused) assert.match(html, new RegExp(`limite complessivo ${state.cap} al giorno \\(UTC\\)`));
      }
    }
    // Default automatic sending (no mode env): automatic controls are live,
    // the global cap is reported, and readiness explains real progress.
    for (const capEnv of [undefined, "450"]) {
      configure({ APPLICATION_SENDING_MODE: undefined, APPLY_GLOBAL_DAILY_CAP: capEnv });
      const route = load("src/app/api/preferences/route.ts", {
        ...dependencies, "@/lib/db": { prisma: { userPreferences: {
          findUnique: async () => ({ autoApplyMode: "auto", matchMin: 73 }), upsert: unavailable,
        } } },
      });
      const response = await route.GET();
      assert.deepEqual(response.body.applicationService, { automaticBlocked: false, submissionsPaused: false, dailyCap: capEnv ? 450 : 300 });
      const readiness = load("src/lib/auto-apply-readiness.ts", {
        "@/lib/application-rollout": rollout, "@/lib/application-pause": pause, "@/lib/db": { prisma: {
          userPreferences: { findUnique: async () => ({ autoApplyMode: "auto", rolesJson: '["Engineer"]', locationsJson: '["Milano"]' }) },
          cVDocument: { count: async () => 1 }, application: { count: async () => 0 },
        } },
      });
      const notice = await readiness.getAutoApplyReadiness("owner", 12);
      assert.equal(notice.tone, "ready");
      assert.doesNotMatch(notice.title + notice.detail, /sospeso|Solo candidature confermate|Invii in pausa/);
      const html = renderToggle(response.body);
      assert.doesNotMatch(html, /disabled=""/);
      assert.doesNotMatch(html, /Solo candidature confermate|Invii in pausa|Stato invii non disponibile/);
    }
    configure({ APPLICATION_SENDING_MODE: undefined, APPLICATIONS_PAUSED: "true" });
    assert.equal((await load("src/app/api/preferences/route.ts", { ...dependencies, "@/lib/db": { prisma: { userPreferences: {
      findUnique: async () => ({ autoApplyMode: "auto", matchMin: 73 }), upsert: unavailable } } } }).GET()).body.applicationService.submissionsPaused, true,
      "APPLICATIONS_PAUSED kill switch still wins in automatic mode");
    configure();
    const readsBefore = preferenceReads;
    const unauthenticated = load("src/app/api/preferences/route.ts", {
      ...dependencies, "@/lib/session": { getCurrentUser: async () => null }, "@/lib/db": { prisma: unavailable },
    });
    assert.equal((await unauthenticated.GET()).status, 401);
    assert.equal(preferenceReads, readsBefore);
    for (const data of [undefined, { autoApplyMode: "auto" }]) {
      const html = renderToggle(data, true);
      assert.match(html, /Stato invii non disponibile/);
      assert.match(html, /disabled=""/);
      assert.doesNotMatch(html, /100% automatico|chevron-down/);
    }
    const toggleSource = readFileSync("src/components/auto-apply-toggle.tsx", "utf8");
    assert.match(toggleSource, /if \(controlsDisabled \|\| nextMode === mode\) return;/, "Programmatic mode changes are guarded too");
    assert.match(toggleSource, /open && !controlsDisabled/, "A previously open menu cannot survive a service hold");
    const preferencesSource = readFileSync("src/app/api/preferences/route.ts", "utf8");
    assert.doesNotMatch(preferencesSource.slice(preferencesSource.indexOf("export async function PUT")), /applicationService|applicationRolloutConfig|automaticApplicationsBlocked|applicationsPaused/,
      "Stored preference writes remain independent and unchanged");
    assert.equal(forbiddenAccesses, 0);
    console.log("PASS sending visibility: default automatic state, server-derived pause/manual-only states, validated global cap, unchanged saved preferences, fail-closed rendered toggle and blocked activation menus. No DB writes, history reads or network calls.");
  } finally {
    for (const key of Object.keys(process.env)) if (!(key in original)) delete process.env[key];
    Object.assign(process.env, original);
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
