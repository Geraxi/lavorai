import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { proxy } from "../src/proxy";
import {
  ATTRIB_COOKIE,
  buildAttribPayload,
  parseAttribCookie,
  planFromCallbackUrl,
} from "../src/lib/signup-attribution";

async function main() {
  // Builder: external referrer + UTM + landing path
  const payload = buildAttribPayload({
    referrer: "https://www.google.com/search?q=lavorai",
    currentHost: "lavorai.it",
    search: "?utm_source=meta&utm_medium=paid&utm_campaign=autunno",
    pathname: "/auto-candidatura",
  });
  assert.deepEqual(parseAttribCookie(payload), {
    signupReferrer: "google.com",
    signupUtmSource: "meta",
    signupUtmMedium: "paid",
    signupUtmCampaign: "autunno",
    signupLandingPath: "/auto-candidatura",
  });

  // Internal referrer counts as direct; landing path always present
  const internal = parseAttribCookie(buildAttribPayload({ referrer: "https://lavorai.it/pricing", currentHost: "www.lavorai.it", search: "", pathname: "/" }));
  assert.equal(internal.signupReferrer, "direct");
  assert.equal(internal.signupLandingPath, "/");
  assert.equal(internal.signupUtmSource, null);

  // Missing / malformed cookie never throws
  assert.equal(parseAttribCookie(undefined).signupLandingPath, null);
  assert.equal(parseAttribCookie("p=%E0%A4%A|r=direct").signupReferrer, "direct");

  // Plan recovery from the NextAuth callback-url cookie
  assert.equal(planFromCallbackUrl("https%3A%2F%2Flavorai.it%2Fsettings%3Fupgrade%3Dpro_plus"), "pro_plus");
  assert.equal(planFromCallbackUrl("/onboarding"), "free");
  assert.equal(planFromCallbackUrl(undefined), "free");

  // Proxy sets the cookie server-side on the first page request…
  const ua = { "user-agent": "Mozilla/5.0 (Macintosh) Chrome/120", referer: "https://www.reddit.com/r/italy" };
  const first = await proxy(new NextRequest("https://lavorai.it/categorie-protette?utm_source=reddit", { headers: ua }));
  const set = first.cookies.get(ATTRIB_COOKIE)?.value;
  assert.ok(set, "first page request sets lv_attrib");
  const roundTrip = new NextRequest("https://lavorai.it/signup", { headers: { ...ua, cookie: `${ATTRIB_COOKIE}=${encodeURIComponent(set!)}` } });
  const parsed = parseAttribCookie(roundTrip.cookies.get(ATTRIB_COOKIE)?.value);
  assert.equal(parsed.signupLandingPath, "/categorie-protette");
  assert.equal(parsed.signupReferrer, "reddit.com");
  assert.equal(parsed.signupUtmSource, "reddit");

  // …but never overwrites (first-touch), and skips API calls and bots
  const second = await proxy(roundTrip);
  assert.equal(second.cookies.get(ATTRIB_COOKIE), undefined, "existing cookie is not overwritten");
  const api = await proxy(new NextRequest("https://lavorai.it/api/public/stats", { headers: ua }));
  assert.equal(api.cookies.get(ATTRIB_COOKIE), undefined, "API requests are not landing pages");
  const bot = await proxy(new NextRequest("https://lavorai.it/", { headers: { "user-agent": "Googlebot/2.1" } }));
  assert.equal(bot.cookies.get(ATTRIB_COOKIE), undefined, "bots are not attributed");

  console.log("signup attribution tests passed");
}

main().then(() => process.exit(0), (err) => { console.error(err); process.exit(1); });
