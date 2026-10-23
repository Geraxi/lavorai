/** Real production React components in an isolated browser fixture.
 * All requests are intercepted. No Next server, database, accounts or remote tags.
 */
import assert from "node:assert/strict";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { build } from "esbuild";
import { chromium } from "playwright";

const out = resolve("output/playwright");
mkdirSync(out, { recursive: true });
const entry = `import React from 'react';
import {createRoot} from 'react-dom/client';
import {TrackingPixels} from './src/components/tracking-pixels';
import {RegistrationConversion} from './src/components/registration-conversion';
import {CookieBanner} from './src/components/cookie-banner';
import {GOOGLE_CONSENT_DEFAULT} from './src/lib/consent/google-tag';
import {OPEN_COOKIE_SETTINGS_EVENT} from './src/lib/consent/state';
window.eval(GOOGLE_CONSENT_DEFAULT);
function App(){return <><h1>LavorAI — verifica locale Google Ads</h1><p>Fixture: sessione e API simulate, rete esterna intercettata.</p><p id="path">{location.pathname}</p><button onClick={()=>window.dispatchEvent(new Event(OPEN_COOKIE_SETTINGS_EVENT))}>Impostazioni cookie</button><TrackingPixels/><RegistrationConversion/><CookieBanner/></>}
createRoot(document.getElementById('root')).render(<React.StrictMode><App/></React.StrictMode>);`;
const result = await build({ stdin: { contents: entry, resolveDir: process.cwd(), loader: "tsx" }, bundle: true, write: false, platform: "browser", jsx: "automatic", define: { "process.env.NODE_ENV": '"test"', "process.env.NEXT_PUBLIC_META_PIXEL_ID": '"2179944702960121"', "process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID": '""' }, plugins: [{ name: "fixture-auth-navigation-i18n", setup(b) {
  b.onResolve({ filter: /^(next-auth\/react|next\/navigation|next\/link|next-intl)$/ }, ({ path }) => ({ path, namespace: "fixture" }));
  b.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path }) => ({ resolveDir: process.cwd(), loader: "jsx", contents: path === "next-auth/react" ? `export const useSession=()=>({status:sessionStorage.getItem('fixture-user')?'authenticated':'unauthenticated',data:{user:{id:sessionStorage.getItem('fixture-user')}}});` : path === "next/navigation" ? `export const usePathname=()=>location.pathname;` : path === "next-intl" ? `export const useLocale=()=> 'it';` : `import React from 'react'; export default function Link(p){return <a {...p}/>}` }));
} }] });
const bundle = result.outputFiles[0].text;
const html = `<!doctype html><html><head><meta charset="utf-8"><style>body{background:#10151b;color:#eee;font:16px system-ui;padding:40px}button{padding:12px;margin:5px;border:1px solid #aaa;border-radius:8px;background:#effff8;color:#10151b;cursor:pointer}.lavorai-cookie-banner{position:fixed;bottom:24px;left:24px;right:24px;background:#202d35;padding:24px;border:1px solid #729587;border-radius:16px}a{color:#9fffd4}label{display:flex;gap:12px;margin:16px 0}</style></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>`;
const browser = await chromium.launch({ channel: "chrome", headless: true });
const log = [];
async function context(holdGoogle = false) {
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 800 }, serviceWorkers: "block" });
  const remote = [], claims = [], conversions = new Set(), pendingTags = [];
  await ctx.route("**/*", async (route) => {
    const req = route.request(), u = new URL(req.url());
    if (u.origin !== "http://lavorai.test") {
      remote.push(req.url());
      if (holdGoogle && u.hostname === "www.googletagmanager.com") {
        await new Promise((release) => pendingTags.push(release));
      }
      return route.fulfill({ status: 200, contentType: "application/javascript", body: "/* inert tag: no Google/Meta code executed */" });
    }
    if (u.pathname === "/fixture.js") return route.fulfill({ contentType: "application/javascript", body: bundle });
    if (u.pathname === "/api/geo") return route.fulfill({ body: "loc=IT\n" });
    if (u.pathname === "/cdn-cgi/trace") return route.fulfill({ body: "loc=IT\n" });
    if (u.pathname === "/api/tracking/registration") {
      const body = req.postDataJSON(); claims.push(body);
      const user = await req.frame().evaluate(() => sessionStorage.getItem('fixture-user'));
      const give = user?.startsWith("new-") && !conversions.has(user) && body.advertising;
      conversions.add(user);
      return route.fulfill({ contentType: "application/json", body: JSON.stringify({ eventId: give ? "12345678-1234-4234-8234-123456789abc" : null }) });
    }
    if (u.pathname === "/api/consent") return route.fulfill({ contentType: "application/json", body: '{"ok":true}' });
    return route.fulfill({ contentType: "text/html", body: html });
  });
  return { ctx, remote, claims, releaseTags: () => pendingTags.splice(0).forEach((release) => release()) };
}
const queue = (p) => p.evaluate(() => (window.dataLayer ?? []).map((x) => Array.from(x)));
const events = async (p) => (await queue(p)).filter((q) => q[0] === "event" && q[1] === "conversion");
const settle = (p) => p.waitForTimeout(350);
try {
  const f = await context(), p = await f.ctx.newPage();
  await p.goto("http://lavorai.test/signup?gclid=test123&email=private%40example.test");
  await p.getByRole("button", { name: "Accetta tutto", exact: true }).waitFor();
  assert.equal(f.remote.length, 0, "no outbound request before consent");
  await p.screenshot({ path: `${out}/google-ads-denied.png` });
  await p.getByRole("button", { name: "Rifiuta tutto", exact: true }).click();
  await settle(p);
  assert.equal(f.remote.length, 0);
  await p.reload(); await settle(p);
  assert.equal(f.remote.length, 0, "denial persists on reload");
  await p.getByRole("button", { name: "Impostazioni cookie", exact: true }).click();
  await p.locator('input[name="consent-advertising"]').check();
  await p.getByRole("button", { name: "Salva scelte", exact: true }).click();
  await settle(p);
  assert.equal(f.remote.filter((u) => u.includes("gtag/js?id=AW-18528829051")).length, 1);
  assert.equal((await events(p)).length, 0, "button click never converts");
  assert.equal(f.claims.length, 0, "signup page does not consume event");
  assert.ok(JSON.stringify(await queue(p)).includes("gclid=test123"));
  assert.ok(!JSON.stringify(await queue(p)).includes("private"));
  await p.screenshot({ path: `${out}/google-ads-accepted.png` });
  // Simulated successful account creation and OAuth/password return: session now exists.
  await p.evaluate(() => sessionStorage.setItem("fixture-user", "new-google"));
  await p.goto("http://lavorai.test/onboarding?code=private-oauth"); await settle(p);
  assert.equal((await events(p)).length, 1);
  const google = (await events(p))[0][2];
  const meta = await p.evaluate(() => window.fbq.queue.find((q) => q[1] === "CompleteRegistration")?.[3]);
  assert.equal(google.transaction_id, meta.eventID);
  assert.deepEqual(Object.keys(google).sort(), ["send_to", "transaction_id"]);
  await p.screenshot({ path: `${out}/google-ads-registration-fixture.png` });
  await p.reload(); await settle(p); assert.equal((await events(p)).length, 0, "refresh no duplicate");
  await p.goBack(); await settle(p); assert.equal((await events(p)).length, 0, "back no duplicate");
  log.push("PASS accepted signup gclid, no PII, successful auth return same Google/Meta event ID, refresh/back dedup");
  // Another tab revokes; live tab receives the same denial and cookies disappear.
  await p.evaluate(() => { document.cookie = "_gcl_aw=fixture; path=/"; document.cookie = "_gcl_au=fixture; path=/"; });
  const b = await f.ctx.newPage(); await b.goto("http://lavorai.test/privacy"); await settle(b);
  await b.getByRole("button", { name: "Impostazioni cookie", exact: true }).click();
  await b.locator('input[name="consent-advertising"]').uncheck();
  await b.getByRole("button", { name: "Salva scelte", exact: true }).click(); await settle(p);
  assert.equal(await p.evaluate(() => window['ga-disable-AW-18528829051']), true);
  assert.equal(await p.evaluate(() => /_gcl_(aw|au)=/.test(document.cookie)), false);
  assert.equal((await queue(p)).filter((q) => q[0] === "consent").at(-1)[2].ad_storage, "denied");
  log.push("PASS cross-tab withdrawal, denied Consent Mode and cookie expiry");
  await f.ctx.close();
  for (const user of [null, "existing-user", "new-password"]) {
    const t = await context(), page = await t.ctx.newPage();
    if (user) await t.ctx.addInitScript((id) => sessionStorage.setItem("fixture-user", id), user);
    await page.goto("http://lavorai.test/onboarding");
    await page.getByRole("button", { name: "Rifiuta tutto", exact: true }).waitFor(); await settle(page);
    assert.equal(t.remote.length, 0); assert.equal((await events(page)).length, 0);
    await page.getByRole("button", { name: "Accetta tutto", exact: true }).click(); await settle(page);
    assert.equal((await events(page)).length, 0, "failed/existing/previously denied must not replay");
    log.push(`PASS ${user ?? "failed signup (no session)"}: no conversion; late acceptance does not replay`);
    await t.ctx.close();
  }
  // Hold the actual script response across a successful signup and cross-tab revocation.
  {
    const slow = await context(true), page = await slow.ctx.newPage();
    await page.goto("http://lavorai.test/signup?gclid=slow-test", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Accetta tutto", exact: true }).click(); await settle(page);
    await page.evaluate(() => sessionStorage.setItem("fixture-user", "new-slow"));
    await page.goto("http://lavorai.test/onboarding", { waitUntil: "domcontentloaded" }); await settle(page);
    assert.equal((await events(page)).length, 1, "conversion waiting for slow tag");
    assert.equal(await page.evaluate(() => Boolean(window.__lavoraiGtagReady)), false);
    const other = await slow.ctx.newPage();
    await other.goto("http://lavorai.test/signup?gclid=slow-test", { waitUntil: "domcontentloaded" }); await settle(other);
    await other.getByRole("button", { name: "Impostazioni cookie", exact: true }).click();
    await other.locator('input[name="consent-advertising"]').uncheck();
    await other.getByRole("button", { name: "Salva scelte", exact: true }).click(); await settle(page);
    for (const tab of [page, other]) {
      const pending = await queue(tab);
      assert.equal(pending.filter((q) => q[0] === "config" && q[1] === "AW-18528829051").length, 0);
      assert.equal(pending.filter((q) => q[0] === "consent" && q[2].ad_storage === "granted").length, 0);
      assert.equal((await events(tab)).length, 0);
      assert.ok(!JSON.stringify(pending).includes("gclid"));
    }
    slow.releaseTags(); await settle(page);
    assert.equal(await page.evaluate(() => window.__lavoraiGtagReady), true);
    assert.equal((await events(page)).length, 0, "late script arrival cannot replay conversion");
    log.push("PASS slow Google download: cross-tab revocation scrubs queued grants, Ads config, gclid and conversion before tag arrival");
    await slow.ctx.close();
  }
  writeFileSync(`${out}/google-ads-browser-results.json`, JSON.stringify({ results: log, transport: "All browser requests intercepted; remote tags inert. Auth session/API fixtures, not live OAuth/accounts." }, null, 2));
  for (const line of log) console.log(line);
} finally { await browser.close(); }
