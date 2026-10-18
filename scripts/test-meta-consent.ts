import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";
import ts from "typescript";
import { NextRequest, NextResponse } from "next/server";
import * as zod from "zod";
import { CONSENT_REQUIRED_COUNTRIES, fetchRegion, parseTraceLoc, regionFromCountry, resolveRegionForVisit, REGION_SESSION_KEY } from "../src/lib/consent/region";
import { answersFromStorage, classifyAction, effectiveConsent, serializeConsent, type RegionState } from "../src/lib/consent/state";
import { CONSENT_NOTICE_VERSION, CONSENT_NOTICES, currentConsentNotice, isKnownNoticeVersion } from "../src/lib/consent/notice";
import { loadMetaPixel, revokeMetaPixel, trackCompleteRegistration, META_PIXEL_SRC, type PixelWindow } from "../src/lib/consent/meta-pixel";
import { claimAndSendRegistration, CLAIMED_SESSION_PREFIX, SENT_KEY_PREFIX } from "../src/lib/consent/registration-claim";
import { claimRegistrationConversion, createRegistrationConversion, REGISTRATION_CLAIM_WINDOW_MS } from "../src/lib/registration-conversion";
import * as csrf from "../src/lib/csrf";
import * as notice from "../src/lib/consent/notice";
import { GET as geoGET } from "../src/app/api/geo/route";

// No network, no database: every dependency below is a local stub.

const PIXEL = "2179944702960121";

function load(path: string, dependencies: Record<string, unknown>) {
  const module = { exports: {} as any };
  vm.runInNewContext(ts.transpileModule(readFileSync(path, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { module, exports: module.exports, Date, console, require: (name: string) => { assert.ok(name in dependencies, name); return dependencies[name]; } });
  return module.exports;
}

class MemKV {
  map = new Map<string, string>();
  getItem(k: string) { return this.map.has(k) ? this.map.get(k)! : null; }
  setItem(k: string, v: string) { this.map.set(k, String(v)); }
}

// ───────────────────────── region ─────────────────────────
async function testRegion() {
  assert.equal(parseTraceLoc("fl=1\nh=lavorai.it\nloc=IT\ntls=TLSv1.3\n"), "IT");
  assert.equal(parseTraceLoc("loc=us"), "US");
  assert.equal(parseTraceLoc("loc=XX"), null, "unknown XX");
  assert.equal(parseTraceLoc("loc=T1"), null, "Tor T1");
  assert.equal(parseTraceLoc("loc="), null);
  assert.equal(parseTraceLoc("loc=ITA"), null);
  assert.equal(parseTraceLoc("<html>404</html>"), null);
  assert.equal(parseTraceLoc(""), null);
  for (const c of ["IT", "DE", "FR", "IE", "NO", "IS", "LI", "GB", "CH"]) assert.equal(regionFromCountry(c).requiresConsent, true, c);
  for (const c of ["US", "BR", "IN", "JP"]) assert.equal(regionFromCountry(c).requiresConsent, false, c);
  assert.equal(CONSENT_REQUIRED_COUNTRIES.size, 32, "EU27 + EEA3 + GB + CH");
  assert.deepEqual(regionFromCountry(null), { country: null, requiresConsent: true }, "unresolved requires consent");

  const ok = (body: string) => async () => ({ ok: true, text: async () => body });
  assert.deepEqual(await fetchRegion(ok("loc=IT\n")), { country: "IT", requiresConsent: true });
  assert.deepEqual(await fetchRegion(ok("loc=US\n")), { country: "US", requiresConsent: false });
  assert.deepEqual(await fetchRegion(ok("loc=XX\n")), { country: null, requiresConsent: true });
  assert.deepEqual(await fetchRegion(ok("loc=T1\n")), { country: null, requiresConsent: true });
  assert.deepEqual(await fetchRegion(async () => ({ ok: false, text: async () => "loc=US" })), { country: null, requiresConsent: true }, "non-OK");
  assert.deepEqual(await fetchRegion(async () => { throw new Error("offline"); }), { country: null, requiresConsent: true }, "network failure");
  const started = Date.now();
  let aborted = false;
  const slow = (_: string, init?: { signal?: AbortSignal }) => new Promise<{ ok: boolean; text(): Promise<string> }>((resolve) => {
    init?.signal?.addEventListener("abort", () => { aborted = true; });
    setTimeout(() => resolve({ ok: true, text: async () => "loc=US" }), 500);
  });
  assert.deepEqual(await fetchRegion(slow, 50), { country: null, requiresConsent: true }, "timeout");
  assert.ok(Date.now() - started < 400 && aborted, "timeout aborts quickly");

  // Cached for the visit only after a resolved answer.
  const session = new MemKV();
  let calls = 0;
  const counting = async () => { calls++; return { ok: true, text: async () => "loc=DE" }; };
  assert.equal((await resolveRegionForVisit(counting, session)).country, "DE");
  assert.equal((await resolveRegionForVisit(counting, session)).country, "DE");
  assert.equal(calls, 1, "second lookup served from sessionStorage");
  assert.equal(session.getItem(REGION_SESSION_KEY), "DE");
  const s2 = new MemKV();
  await resolveRegionForVisit(async () => ({ ok: true, text: async () => "loc=XX" }), s2);
  assert.equal(s2.getItem(REGION_SESSION_KEY), null, "unresolved never cached");

  // Same-origin endpoint answers in trace format from Vercel's header.
  const geo = (h?: string) => geoGET(new NextRequest("http://localhost/api/geo", { headers: h ? { "x-vercel-ip-country": h } : {} }));
  assert.equal(await geo("IT").text(), "loc=IT\n");
  assert.equal(await geo("us").text(), "loc=US\n");
  assert.equal(await geo().text(), "loc=XX\n");
  assert.equal(await geo("<script>").text(), "loc=XX\n");
  assert.match(geo("IT").headers.get("cache-control") ?? "", /no-store/);
}

// ───────────────────────── consent gating ─────────────────────────
function testConsentGating() {
  const eu: RegionState = { status: "resolved", country: "IT", requiresConsent: true };
  const unknown: RegionState = { status: "resolved", country: null, requiresConsent: true };
  const us: RegionState = { status: "resolved", country: "US", requiresConsent: false };
  const pending: RegionState = { status: "pending" };
  const none = { analytics: null, advertising: null } as const;

  assert.deepEqual(effectiveConsent(none, pending), { analytics: false, advertising: false, showBanner: false, ready: false }, "nothing before region known");
  assert.deepEqual(effectiveConsent(none, eu), { analytics: false, advertising: false, showBanner: true, ready: true }, "EU default deny + banner");
  assert.deepEqual(effectiveConsent(none, unknown), { analytics: false, advertising: false, showBanner: true, ready: true }, "unresolved default deny + banner");
  assert.deepEqual(effectiveConsent(none, us), { analytics: true, advertising: true, showBanner: false, ready: true }, "elsewhere: no banner");
  assert.equal(effectiveConsent({ analytics: "denied", advertising: "denied" }, us).advertising, false, "explicit refusal honoured elsewhere");
  assert.equal(effectiveConsent({ analytics: "granted", advertising: null }, eu).advertising, false, "unanswered advertising is not acceptance");
  assert.equal(effectiveConsent({ analytics: "granted", advertising: null }, eu).showBanner, true);
  const split = effectiveConsent({ analytics: "granted", advertising: "denied" }, eu);
  assert.equal(split.analytics, true); assert.equal(split.advertising, false); assert.equal(split.showBanner, false, "separate choices preserved");

  // Storage parsing.
  const cur = serializeConsent({ analytics: "denied", advertising: "granted" }, new Date("2026-10-18T00:00:00Z"));
  assert.deepEqual(answersFromStorage(cur.stored, cur.legacy), { analytics: "denied", advertising: "granted" });
  assert.equal(cur.legacy, "essential");
  const old = JSON.stringify({ v: "old", analytics: "granted", advertising: "denied", at: "x" });
  assert.deepEqual(answersFromStorage(old, null), { analytics: null, advertising: "denied" }, "old-version grant re-asked, refusal kept");
  assert.deepEqual(answersFromStorage(null, "essential"), { analytics: "denied", advertising: "denied" }, "legacy refusal honoured");
  assert.deepEqual(answersFromStorage(null, "accepted"), { analytics: null, advertising: null }, "legacy bundled accept is not valid for the new notice");
  assert.deepEqual(answersFromStorage("{bad json", null), { analytics: null, advertising: null });

  assert.equal(classifyAction(none, { analytics: "granted", advertising: "granted" }), "accept_all");
  assert.equal(classifyAction(none, { analytics: "denied", advertising: "denied" }), "reject_all");
  assert.equal(classifyAction(none, { analytics: "granted", advertising: "denied" }), "save_preferences");
  assert.equal(classifyAction({ analytics: "granted", advertising: "granted" }, { analytics: "granted", advertising: "denied" }), "withdraw");

  // Notice is versioned and resolvable.
  assert.ok(isKnownNoticeVersion(CONSENT_NOTICE_VERSION));
  assert.equal(currentConsentNotice().version, CONSENT_NOTICE_VERSION);
  assert.ok(CONSENT_NOTICES[CONSENT_NOTICE_VERSION].purposes.advertising.recipients.some((r) => r.includes("Meta")));
  for (const lang of ["it", "en"] as const) {
    const t = currentConsentNotice().text[lang];
    assert.ok(t.choices.acceptAll && t.choices.rejectAll && t.purposes.analytics.label && t.purposes.advertising.label);
  }
}

// ───────────────────────── Meta pixel loader ─────────────────────────
function fakeBrowser() {
  const scripts: string[] = [];
  const cookies: string[] = [];
  const calls: unknown[][] = [];
  const win: PixelWindow = {};
  const doc = {
    createElement: () => ({ async: false, src: "" }),
    getElementsByTagName: () => [{ parentNode: { insertBefore: (el: any) => { scripts.push(el.src); } } }],
    head: { appendChild: (el: any) => { scripts.push(el.src); } },
    get cookie() { return ""; },
    set cookie(v: string) { cookies.push(v); },
    location: { hostname: "lavorai.it" },
  };
  return { win, doc, scripts, cookies, calls, queue: () => (win.fbq as any)?.queue as unknown[][] };
}

function testMetaPixel() {
  const b = fakeBrowser();
  assert.equal(b.scripts.length, 0, "nothing injected before consent");
  assert.equal(trackCompleteRegistration(b.win, "a1b2c3d4-0000-4000-8000-000000000000", () => true), false, "no event without loaded pixel");
  assert.equal(loadMetaPixel(b.win, b.doc as any, PIXEL), true);
  assert.equal(loadMetaPixel(b.win, b.doc as any, PIXEL), true);
  assert.deepEqual(b.scripts, [META_PIXEL_SRC], "script injected exactly once");
  const q = b.queue();
  const pageViews = q.filter((a) => a[0] === "track" && a[1] === "PageView");
  assert.equal(pageViews.length, 1, "one PageView per load");
  const iAuto = q.findIndex((a) => a[0] === "set" && a[1] === "autoConfig" && a[2] === false && a[3] === PIXEL);
  const iInit = q.findIndex((a) => a[0] === "init");
  assert.ok(iAuto >= 0 && iAuto < iInit, "autoConfig disabled before init");
  assert.deepEqual(q[iInit], ["init", PIXEL], "init carries no user data");
  assert.equal(loadMetaPixel(fakeBrowser().win, b.doc as any, "not-a-pixel"), false);

  // Re-check before each event.
  const id = "a1b2c3d4-0000-4000-8000-000000000000";
  assert.equal(trackCompleteRegistration(b.win, id, () => false), false);
  assert.equal(q.filter((a) => a[1] === "CompleteRegistration").length, 0);
  assert.equal(trackCompleteRegistration(b.win, id, () => true), true);
  const reg = q.filter((a) => a[1] === "CompleteRegistration");
  assert.deepEqual(reg, [["track", "CompleteRegistration", {}, { eventID: id }]], "no params, no value, opaque eventID");
  assert.equal(trackCompleteRegistration(b.win, "bad id with spaces", () => true), false);

  // Withdrawal on the already-loaded pixel.
  revokeMetaPixel(b.win, b.doc as any);
  assert.deepEqual(q[q.length - 1], ["consent", "revoke"]);
  assert.ok(b.cookies.some((c) => c.startsWith("_fbp=;")) && b.cookies.some((c) => c.startsWith("_fbc=;")), "Meta cookies expired");
  // Re-grant later reuses the loaded pixel (no second script, no second PageView).
  loadMetaPixel(b.win, b.doc as any, PIXEL);
  assert.equal(b.scripts.length, 1);
  assert.deepEqual(q[q.length - 1], ["consent", "grant"]);
  assert.equal(q.filter((a) => a[1] === "PageView").length, 1);
}

// ───────────────────────── server one-shot ─────────────────────────
function fakeRegistrationPrisma() {
  const rows = new Map<string, { id: string; userId: string; eventId: string; method: string; createdAt: Date; claimedAt: Date | null; outcome: string | null }>();
  let n = 0;
  const prisma = {
    registrationConversion: {
      async create({ data }: any) {
        if ([...rows.values()].some((r) => r.userId === data.userId)) throw Object.assign(new Error("unique"), { code: "P2002" });
        const id = `r${++n}`; rows.set(id, { id, ...data, createdAt: new Date(), claimedAt: null, outcome: null }); return { id };
      },
      async findUnique({ where }: any) {
        const r = [...rows.values()].find((x) => x.userId === where.userId);
        return r ? { id: r.id, eventId: r.eventId, createdAt: r.createdAt, claimedAt: r.claimedAt } : null;
      },
      async updateMany({ where, data }: any) {
        await new Promise((res) => setImmediate(res));
        const r = rows.get(where.id);
        if (!r || r.claimedAt !== null) return { count: 0 };
        r.claimedAt = data.claimedAt; r.outcome = data.outcome; return { count: 1 };
      },
    },
  };
  return { prisma, rows };
}

async function testServerDedup() {
  const { prisma, rows } = fakeRegistrationPrisma();
  assert.equal(await createRegistrationConversion(prisma as any, "u1", "password"), true);
  assert.equal(await createRegistrationConversion(prisma as any, "u1", "password"), false, "second create for same user never throws out of signup");
  const row = [...rows.values()][0];
  assert.match(row.eventId, /^[0-9a-f-]{36}$/, "opaque UUID");
  assert.ok(!row.eventId.includes("u1"));

  // Returning login: no row → nothing.
  assert.deepEqual(await claimRegistrationConversion(prisma as any, "returning", true), { eventId: null, outcome: "none" });

  // First claim with consent releases once; every later claim gets nothing.
  const first = await claimRegistrationConversion(prisma as any, "u1", true);
  assert.equal(first.eventId, row.eventId); assert.equal(first.outcome, "released");
  assert.equal((await claimRegistrationConversion(prisma as any, "u1", true)).eventId, null, "reload/revisit never resends");

  // Registration without ad consent is never replayed after later acceptance.
  await createRegistrationConversion(prisma as any, "u2", "google");
  assert.deepEqual(await claimRegistrationConversion(prisma as any, "u2", false), { eventId: null, outcome: "blocked_no_consent" });
  assert.equal((await claimRegistrationConversion(prisma as any, "u2", true)).eventId, null, "no replay after acceptance");

  // Too old → consumed as expired.
  await createRegistrationConversion(prisma as any, "u3", "password");
  const later = new Date(Date.now() + REGISTRATION_CLAIM_WINDOW_MS + 1000);
  assert.deepEqual(await claimRegistrationConversion(prisma as any, "u3", true, later), { eventId: null, outcome: "expired" });

  // Concurrent claims (two tabs / auth retry): exactly one release.
  await createRegistrationConversion(prisma as any, "u4", "google");
  const both = await Promise.all([claimRegistrationConversion(prisma as any, "u4", true), claimRegistrationConversion(prisma as any, "u4", true)]);
  assert.equal(both.filter((r) => r.eventId).length, 1, "race releases once");
}

// ───────────────────────── client one-shot ─────────────────────────
async function testClientDedup() {
  const eventId = "0d6c7a4e-1111-4222-8333-444455556666";
  let serverCalls = 0;
  let serverHasEvent = true;
  const post = async (_path: string, body: any) => {
    serverCalls++;
    assert.deepEqual(Object.keys(body), ["advertising"], "claim body carries no PII");
    const give = serverHasEvent && body.advertising; serverHasEvent = false;
    return { ok: true, json: async () => ({ eventId: give ? eventId : null }) };
  };
  const sent: string[] = [];
  const local = new MemKV(); const session = new MemKV();
  let allowed = true;
  const deps = () => ({ userId: "u1", advertisingAllowed: () => allowed, post, local, session, send: (id: string) => { sent.push(id); return true; } });

  assert.equal(await claimAndSendRegistration(deps()), "sent");
  assert.deepEqual(sent, [eventId]);
  assert.equal(await claimAndSendRegistration(deps()), "skipped_session", "rerender/reload in same session: no request");
  assert.equal(serverCalls, 1);
  assert.ok(local.getItem(SENT_KEY_PREFIX + eventId));

  // Server replays the id (should never happen) → local guard blocks.
  const local2 = new MemKV(); local2.setItem(SENT_KEY_PREFIX + eventId, "x");
  const replay = async () => ({ ok: true, json: async () => ({ eventId }) });
  assert.equal(await claimAndSendRegistration({ ...deps(), session: new MemKV(), local: local2, post: replay }), "duplicate");
  assert.equal(sent.length, 1);

  // Consent withdrawn between claim and send → nothing sent.
  let flips = 0;
  const flipping = () => { flips++; return flips === 1; };
  assert.equal(await claimAndSendRegistration({ ...deps(), session: new MemKV(), local: new MemKV(), post: replay, advertisingAllowed: flipping }), "blocked");
  assert.equal(sent.length, 1);

  // Network error: session not marked, so a later page may claim (server still one-shot).
  const s3 = new MemKV();
  assert.equal(await claimAndSendRegistration({ ...deps(), session: s3, post: async () => { throw new Error("offline"); } }), "network_error");
  assert.equal(s3.getItem(CLAIMED_SESSION_PREFIX + "u1"), null);
}

// ───────────────────────── consent evidence API ─────────────────────────
async function testConsentApi() {
  const inserted: any[] = [];
  let fail = false;
  const prisma = { consentRecord: {
    create: async ({ data }: any) => { if (fail) throw Object.assign(new Error("x"), { code: "P2021" }); inserted.push(data); return { id: `c${inserted.length}`, createdAt: new Date() }; },
    update: async () => { throw new Error("append-only: update must never be called"); },
    delete: async () => { throw new Error("append-only: delete must never be called"); },
  } };
  const route = load("src/app/api/consent/route.ts", {
    "next/server": { NextResponse }, zod, "@/lib/db": { prisma }, "@/lib/csrf": csrf,
    "@/lib/rate-limit": { analyticsLimiter: { limit: async () => ({ success: true }) } }, "@/lib/consent/notice": notice,
  });
  const body = { visitorId: "0d6c7a4e-1111-4222-8333-444455556666", noticeVersion: CONSENT_NOTICE_VERSION, region: "IT", consentRequired: true, analytics: "granted", advertising: "granted", action: "accept_all", source: "banner" };
  const req = (b: unknown, origin = "http://localhost") => new NextRequest("http://localhost/api/consent", { method: "POST", headers: { origin, host: "localhost", "content-type": "application/json" }, body: JSON.stringify(b) });
  assert.equal((await route.POST(req(body))).status, 201);
  assert.equal((await route.POST(req({ ...body, advertising: "denied", action: "withdraw", source: "settings" }))).status, 201);
  assert.equal(inserted.length, 2, "withdrawal appends; acceptance evidence retained");
  assert.equal(inserted[0].advertising, "granted"); assert.equal(inserted[1].action, "withdraw");
  assert.equal((await route.POST(req(body, "https://evil.invalid"))).status, 403);
  for (const bad of [{ ...body, noticeVersion: "made-up" }, { ...body, email: "a@b.c" }, { ...body, region: "Italy" }, { ...body, advertising: "yes" }, { ...body, visitorId: "short" }, null]) {
    assert.equal((await route.POST(req(bad))).status, 400);
  }
  assert.equal(inserted.length, 2);
  fail = true; assert.equal((await route.POST(req(body))).status, 503); fail = false;
}

// ───────────────────────── static guards ─────────────────────────
function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out); else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}
function testStaticGuards() {
  const files = walk("src");
  const fbRefs = files.filter((f) => /connect\.facebook\.net|facebook\.com\/tr/.test(readFileSync(f, "utf8")));
  assert.deepEqual(fbRefs, [join("src", "lib", "consent", "meta-pixel.ts")], "Meta network endpoints referenced only by the consent-gated loader");
  const gtm = files.filter((f) => /googletagmanager\.com\/gtm\.js|GTM-[A-Z0-9]+/.test(readFileSync(f, "utf8")));
  assert.deepEqual(gtm, [], "no tag manager");
  const regCalls = files.filter((f) => /["']CompleteRegistration["']/.test(readFileSync(f, "utf8")));
  assert.deepEqual(regCalls.sort(), [join("src", "lib", "consent", "meta-pixel.ts")], "CompleteRegistration only via the one-shot helper");
  const signup = readFileSync("src/app/signup/page.tsx", "utf8");
  assert.ok(!/trackConversion\(/.test(signup), "signup page no longer fires pixel events on submit");
  const migration = readFileSync("prisma/migrations/20261018020000_meta_signup_consent/migration.sql", "utf8");
  assert.ok(!/\b(DROP|ALTER\s+TABLE\s+"(?!RegistrationConversion)|ALTER\s+COLUMN|TRUNCATE|DELETE|UPDATE)\b/i.test(migration.replace(/^--.*$/gm, "").replace(/ON (DELETE|UPDATE) CASCADE/g, "")), "migration is additive only");
}

async function main() {
  await testRegion();
  testConsentGating();
  testMetaPixel();
  await testServerDedup();
  await testClientDedup();
  await testConsentApi();
  testStaticGuards();
  console.log("PASS meta consent: region (trace parse, XX/T1/timeout/non-OK → banner, visit cache, /api/geo), gating (EU/unresolved deny by default, refusal honoured elsewhere, separate purposes), pixel (single load + PageView, autoConfig off, no user data, revoke), one-shot CompleteRegistration (server consume, no replay after late acceptance, race, client guards), append-only consent evidence, static guards.");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
