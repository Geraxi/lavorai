import assert from "node:assert/strict";
import vm from "node:vm";
import { GOOGLE_ADS_ID, GOOGLE_SIGNUP_DESTINATION, GOOGLE_CONSENT_DEFAULT, googlePageLocation, syncGoogleConsent, trackGoogleRegistration, type GoogleWindow } from "../src/lib/consent/google-tag";
import { claimAndSendRegistration } from "../src/lib/consent/registration-claim";
import { loadMetaPixel, trackCompleteRegistration, type PixelWindow } from "../src/lib/consent/meta-pixel";

const eventId = "12345678-1234-4234-8234-123456789abc";
function fixture() {
  const win: GoogleWindow & PixelWindow = { location: { href: "https://lavorai.it/signup?gclid=test123&email=private%40example.test&code=secret#private" } };
  const scripts: string[] = [], cookies: string[] = [];
  const doc = { createElement: () => ({ async: false, src: "" }), head: { appendChild: (s: { src: string }) => scripts.push(s.src) }, getElementsByTagName: () => [], location: { hostname: "lavorai.it" }, get cookie() { return ""; }, set cookie(v: string) { cookies.push(v); } };
  const queue = () => (win.dataLayer ?? []).map((x) => Array.from(x as ArrayLike<unknown>));
  return { win, scripts, cookies, doc, queue };
}
async function main() {
  const f = fixture();
  vm.runInNewContext(GOOGLE_CONSENT_DEFAULT, { window: f.win });
  assert.equal(f.queue()[0][1], "default");
  assert.deepEqual(f.scripts, []);
  syncGoogleConsent(f.win, f.doc, false, false);
  assert.deepEqual(f.scripts, [], "no consent: no request");
  assert.equal(trackGoogleRegistration(f.win, eventId, () => false), false);
  syncGoogleConsent(f.win, f.doc, false, true);
  syncGoogleConsent(f.win, f.doc, false, true);
  assert.equal(f.scripts.length, 1, "only one loader");
  assert.ok(f.scripts[0].endsWith(GOOGLE_ADS_ID));
  assert.equal(f.queue().filter((q) => q[0] === "config").length, 1);
  assert.ok(!JSON.stringify(f.queue()).includes("private"));
  assert.ok(!JSON.stringify(f.queue()).includes("secret"));
  assert.ok(JSON.stringify(f.queue()).includes("gclid=test123"));
  assert.equal(googlePageLocation(f.win.location!.href, false), "https://lavorai.it/signup");
  assert.equal(googlePageLocation("https://lavorai.it/api/auth/callback/google?code=secret", true), "https://lavorai.it/account");
  for (const bad of ["email@example.test", "short", "name phone"])
    assert.equal(trackGoogleRegistration(f.win, bad, () => true), false);
  loadMetaPixel(f.win, f.doc, "2179944702960121");
  const send = (id: string) => {
    const g = trackGoogleRegistration(f.win, id, () => true);
    trackCompleteRegistration(f.win, id, () => true);
    return g;
  };
  let available = true;
  const post = async (_: string, body: unknown) => {
    assert.deepEqual(body, { advertising: true });
    const id = available ? eventId : null; available = false;
    return { ok: true, json: async () => ({ eventId: id }) };
  };
  const deps = { userId: "fixture", advertisingAllowed: () => true, post, local: null, session: null, send };
  await Promise.all([claimAndSendRegistration(deps), claimAndSendRegistration(deps)]);
  await claimAndSendRegistration(deps);
  const conversions = JSON.parse(JSON.stringify(f.queue().filter((q) => q[0] === "event")));
  assert.deepEqual(conversions, [["event", "conversion", { send_to: GOOGLE_SIGNUP_DESTINATION, transaction_id: eventId }]]);
  assert.equal((f.win.fbq?.queue?.find((q) => q[1] === "CompleteRegistration")?.[3] as { eventID: string }).eventID, eventId);
  syncGoogleConsent(f.win, f.doc, false, false);
  assert.equal(f.win[`ga-disable-${GOOGLE_ADS_ID}`], true);
  assert.ok(f.cookies.some((c) => c.startsWith("_gcl_aw=")));
  assert.ok(f.cookies.some((c) => c.startsWith("_gcl_au=")));
  assert.equal(f.queue().filter((q) => q[0] === "event").length, 0, "withdrawal removes queued conversion");
  assert.equal(f.queue().filter((q) => q[0] === "config" && q[1] === GOOGLE_ADS_ID).length, 0, "slow loader: no stale Ads config after withdrawal");
  assert.equal(f.queue().filter((q) => q[0] === "consent" && (q[2] as any).ad_storage === "granted").length, 0, "slow loader: earlier grants scrubbed");
  assert.ok(!JSON.stringify(f.queue()).includes("gclid"), "slow loader: click ID removed from pending commands");
  assert.equal(trackGoogleRegistration(f.win, eventId, () => true), false);
  syncGoogleConsent(f.win, f.doc, false, true);
  assert.equal(f.queue().filter((q) => q[0] === "event").length, 0, "no replay after reaccept");
  const a = fixture();
  syncGoogleConsent(a.win, a.doc, true, false, "G-FIXTURE");
  assert.ok(a.scripts[0].endsWith("G-FIXTURE"));
  assert.equal(a.queue().filter((q) => q[0] === "config" && q[1] === GOOGLE_ADS_ID).length, 0, "analytics alone never configures Ads");
  syncGoogleConsent(a.win, a.doc, true, true, "G-FIXTURE");
  assert.equal(a.scripts.length, 1, "GA and Ads share one loader");
  assert.equal(trackGoogleRegistration(a.win, eventId, () => true), true);
  console.log("PASS Google Ads: consent defaults, zero preconsent requests, single loader, GA-only separation, gclid allowlist, no PII, exact destination, shared Meta event ID, race/refresh dedup, withdrawal/cookie expiry/reaccept without replay. All fixtures, no network.");
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
