/**
 * Browser check for consent-gated Meta Pixel loading against a LOCAL Next
 * server (default http://localhost:3100; start it with
 * `NEXT_PUBLIC_META_PIXEL_ID=2179944702960121 npx next dev -p 3100`).
 *
 * Every request to Meta (connect.facebook.net / facebook.com) is intercepted
 * and answered locally with an inert stub, so nothing ever reaches Meta; the
 * test only counts whether the page TRIED to contact Meta.
 * Region is simulated with the `x-vercel-ip-country` header that Vercel's
 * edge would add in production.
 */
import assert from "node:assert/strict";
import { chromium } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const PAGE = `${BASE}/privacy`;
const isMeta = (url) => /(^|\.)facebook\.(net|com)$/.test(new URL(url).hostname);

async function newContext(browser, country) {
  const context = await browser.newContext({ extraHTTPHeaders: country ? { "x-vercel-ip-country": country } : {} });
  const meta = [];
  const consentPosts = [];
  await context.route("**/*", async (route) => {
    const url = route.request().url();
    if (isMeta(url)) {
      meta.push(url);
      return route.fulfill({ status: 200, contentType: "application/javascript", body: "/* inert local stub */" });
    }
    if (url.endsWith("/api/consent") && route.request().method() === "POST") {
      consentPosts.push(JSON.parse(route.request().postData() ?? "{}"));
      return route.fulfill({ status: 201, contentType: "application/json", body: '{"ok":true}' });
    }
    return route.continue();
  });
  return { context, meta, consentPosts };
}

const banner = (page) => page.locator('[role="dialog"].lavorai-cookie-banner');
const settle = (page) => page.waitForTimeout(4000); // > 2s region timeout + script injection

const browser = await chromium.launch();
const results = [];
try {
  // 1. Italy, no answer → banner, no Meta request.
  {
    const { context, meta } = await newContext(browser, "IT");
    const page = await context.newPage();
    await page.goto(PAGE, { waitUntil: "load", timeout: 100000 });
    await settle(page);
    assert.equal(await banner(page).isVisible(), true, "IT: banner visible");
    const accept = page.getByRole("button", { name: "Accetta tutto" });
    const reject = page.getByRole("button", { name: "Rifiuta tutto" });
    assert.equal(await accept.getAttribute("class"), await reject.getAttribute("class"), "Accept and Reject styled identically");
    assert.deepEqual(meta, [], "IT without consent: zero requests to Meta");
    assert.equal(await page.evaluate(() => typeof window.fbq), "undefined", "no fbq without consent");
    results.push("IT no-consent: banner shown, 0 Meta requests");

    // 2. Reject → still nothing; evidence posted.
    await reject.click();
    await settle(page);
    assert.deepEqual(meta, [], "IT after reject: zero requests to Meta");
    await page.reload({ waitUntil: "load", timeout: 100000 });
    await settle(page);
    assert.equal(await banner(page).count(), 0, "choice persisted: no banner after reload");
    assert.deepEqual(meta, [], "IT after reject + reload: zero Meta requests");
    results.push("IT reject: 0 Meta requests, persisted");
    await context.close();
  }

  // 3. Unresolved region (no country header → loc=XX) → banner, nothing loads.
  {
    const { context, meta } = await newContext(browser, null);
    const page = await context.newPage();
    await page.goto(PAGE, { waitUntil: "load", timeout: 100000 });
    await settle(page);
    assert.equal(await banner(page).isVisible(), true, "unresolved: banner visible");
    assert.deepEqual(meta, [], "unresolved: zero Meta requests");
    results.push("Unresolved region: banner shown, 0 Meta requests");
    await context.close();
  }

  // 4. Italy accept → pixel loads once; withdrawal in another tab revokes immediately.
  {
    const { context, meta, consentPosts } = await newContext(browser, "IT");
    const a = await context.newPage();
    await a.goto(PAGE, { waitUntil: "load", timeout: 100000 });
    await settle(a);
    await a.getByRole("button", { name: "Accetta tutto" }).click();
    await a.waitForTimeout(1500);
    assert.equal(meta.filter((u) => u.includes("fbevents.js")).length, 1, "pixel script requested exactly once after accept");
    const queue = await a.evaluate(() => window.fbq.queue.map((args) => JSON.parse(JSON.stringify(args))));
    assert.deepEqual(queue.filter((q) => q[0] === "init"), [["init", "2179944702960121"]], "init with pixel id only");
    assert.ok(queue.some((q) => q[0] === "set" && q[1] === "autoConfig" && q[2] === false), "autoConfig disabled");
    assert.equal(queue.filter((q) => q[0] === "track" && q[1] === "PageView").length, 1, "one PageView");
    assert.equal(queue.filter((q) => q[1] === "CompleteRegistration").length, 0, "no registration event for an anonymous visitor");
    assert.equal(consentPosts.at(-1)?.advertising, "granted");
    assert.ok(consentPosts.at(-1)?.noticeVersion);

    const b = await context.newPage();
    await b.goto(PAGE, { waitUntil: "load", timeout: 100000 });
    await settle(b);
    await b.locator("main").getByRole("button", { name: "Impostazioni cookie" }).click();
    const adBox = b.locator('input[name="consent-advertising"]');
    assert.equal(await adBox.isChecked(), true, "settings opens with saved choice (not reset)");
    await adBox.uncheck();
    await b.getByRole("button", { name: "Salva scelte" }).click();
    await a.waitForTimeout(800);
    const after = await a.evaluate(() => window.fbq.queue.map((args) => JSON.parse(JSON.stringify(args))));
    assert.deepEqual(after.at(-1), ["consent", "revoke"], "other open tab revoked immediately");
    assert.equal(consentPosts.at(-1)?.action, "withdraw", "withdrawal recorded as a new record");
    results.push("IT accept: 1 pixel load, 1 PageView, autoConfig off; cross-tab withdrawal → fbq('consent','revoke')");
    await context.close();
  }

  // 5. US: no banner, pixel may run; explicit refusal honoured.
  {
    const { context, meta } = await newContext(browser, "US");
    const page = await context.newPage();
    await page.goto(PAGE, { waitUntil: "load", timeout: 100000 });
    await settle(page);
    assert.equal(await banner(page).count(), 0, "US: no banner");
    assert.equal(meta.filter((u) => u.includes("fbevents.js")).length, 1, "US: pixel loads without banner");
    await context.close();

    const refused = await newContext(browser, "US");
    await refused.context.addInitScript(() => localStorage.setItem("lavorai-consent", JSON.stringify({ v: "old", analytics: "denied", advertising: "denied", at: "2026-01-01" })));
    const p2 = await refused.context.newPage();
    await p2.goto(PAGE, { waitUntil: "load", timeout: 100000 });
    await settle(p2);
    assert.deepEqual(refused.meta, [], "US with explicit refusal: zero Meta requests");
    results.push("US: no banner, pixel allowed; explicit refusal → 0 Meta requests");
    await refused.context.close();
  }
} finally {
  await browser.close();
}
for (const r of results) console.log("PASS", r);
