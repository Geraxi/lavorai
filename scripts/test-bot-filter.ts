import assert from "node:assert/strict";
import {
  BOT_UA_TOKENS,
  HUMAN_PAGEVIEW_WHERE,
  isAllowedBeaconOrigin,
  isBotUserAgent,
  isValidClientVisitorId,
  realVisitorIds,
} from "../src/lib/bot-filter";

const HUMANS: Record<string, string> = {
  chromeMac:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
  chromeWindows:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
  safariMac:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15",
  firefox: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0",
  mobileSafari:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
  androidChrome:
    "Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.6668.81 Mobile Safari/537.36",
  instagramInApp:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 349.0.0.21.110 (iPhone15,2; iOS 17_6; it_IT; it; scale=3.00; 1179x2556; 640021339)",
  facebookInApp:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/482.0.0.38.109;FBBV/650005678;FBDV/iPhone15,2;FBMD/iPhone;FBSN/iOS;FBSV/17.6;FBSS/3;FBID/phone;FBLC/it_IT;FBOP/5]",
  edge:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 Edg/129.0.0.0",
};

const BOTS: Record<string, string | null | undefined> = {
  googlebot: "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
  googlebotSmartphone:
    "Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.6668.70 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
  headlessChrome:
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/129.0.0.0 Safari/537.36",
  pythonRequests: "python-requests/2.32.3",
  curl: "curl/8.7.1",
  gptbot: "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.2; +https://openai.com/gptbot)",
  claudebot: "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ClaudeBot/1.0; +claudebot@anthropic.com)",
  vercelScreenshot:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 vercel-screenshot/1.0",
  bingbot: "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)",
  ahrefs: "Mozilla/5.0 (compatible; AhrefsBot/7.0; +http://ahrefs.com/robot/)",
  bytespider: "Mozilla/5.0 (Linux; Android 5.0) AppleWebKit/537.36 (KHTML, like Gecko) Mobile Safari/537.36 (compatible; Bytespider; spider-feedback@bytedance.com)",
  facebookPreview: "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
  lighthouse:
    "Mozilla/5.0 (Linux; Android 11; moto g power (2022)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36 Chrome-Lighthouse",
  nodeFetch: "node-fetch/1.0 (+https://github.com/bitinn/node-fetch)",
  empty: "",
  whitespace: "   ",
  nullUa: null,
  undefinedUa: undefined,
  noMozilla: "SomeRandomClient/1.0 (Linux x86_64)",
};

for (const [name, ua] of Object.entries(HUMANS)) {
  assert.equal(isBotUserAgent(ua), false, `human UA flagged as bot: ${name}`);
}
for (const [name, ua] of Object.entries(BOTS)) {
  assert.equal(isBotUserAgent(ua), true, `bot UA not flagged: ${name}`);
}

// Il frammento Prisma deve escludere esattamente gli stessi token (case-insensitive) + null/vuoto + no "mozilla/".
const and = HUMAN_PAGEVIEW_WHERE.AND as ReadonlyArray<Record<string, unknown>>;
const notTokens = and
  .filter((c) => "NOT" in c)
  .map((c) => (c.NOT as { userAgent: { contains: string; mode: string } }).userAgent);
assert.deepEqual(notTokens.map((t) => t.contains), [...BOT_UA_TOKENS]);
assert.ok(notTokens.every((t) => t.mode === "insensitive"));
assert.ok(BOT_UA_TOKENS.every((t) => t === t.toLowerCase()), "tokens must be lowercase");
assert.ok(and.some((c) => JSON.stringify(c) === JSON.stringify({ userAgent: { not: null } })));
assert.ok(and.some((c) => JSON.stringify(c) === JSON.stringify({ userAgent: { not: "" } })));
assert.ok(and.some((c) => JSON.stringify(c) === JSON.stringify({ userAgent: { contains: "mozilla/", mode: "insensitive" } })));

// Simula il filtro Prisma in JS: deve concordare con isBotUserAgent su tutti i casi.
const prismaSaysHuman = (ua: string | null | undefined) => {
  if (ua == null || ua === "") return false;
  const s = ua.toLowerCase();
  return s.includes("mozilla/") && !BOT_UA_TOKENS.some((t) => s.includes(t));
};
for (const ua of [...Object.values(HUMANS), ...Object.values(BOTS)]) {
  if (typeof ua === "string" && ua.trim() !== "" && ua.trim().length < 20) continue; // soglia lunghezza solo lato JS
  assert.equal(prismaSaysHuman(ua), !isBotUserAgent(ua), `prisma/js mismatch for ${ua}`);
}

// Origin del beacon
assert.equal(isAllowedBeaconOrigin("https://lavorai.it"), true);
assert.equal(isAllowedBeaconOrigin("https://www.lavorai.it"), true);
assert.equal(isAllowedBeaconOrigin("http://localhost:3000"), true);
assert.equal(isAllowedBeaconOrigin("https://lavorai-git-fix-geraxi.vercel.app"), true);
assert.equal(isAllowedBeaconOrigin("https://evil.example.com"), false);
assert.equal(isAllowedBeaconOrigin("https://lavorai.it.evil.com"), false);
assert.equal(isAllowedBeaconOrigin("null"), false);

// Id visitatore client
assert.equal(isValidClientVisitorId("v_AbCdEfGhIjKlMnOp"), true);
assert.equal(isValidClientVisitorId("v_short"), false);
assert.equal(isValidClientVisitorId("AbCdEfGhIjKlMnOp"), false);
assert.equal(isValidClientVisitorId("v_AbCdEfGh<script>KlMnOp"), false);
assert.equal(isValidClientVisitorId(42), false);

// Visitatori reali: id client sempre; id server solo se ≥2 hit o loggato; null mai.
const visitors = realVisitorIds([
  { sessionId: "v_AbCdEfGhIjKlMnOp", userId: null }, // client id, 1 hit → conta
  { sessionId: "srvOnce1", userId: null }, // id server, 1 hit senza cookie → NON conta
  { sessionId: "srvOnce2", userId: null },
  { sessionId: "srvTwice", userId: null }, // cookie tornato → conta
  { sessionId: "srvTwice", userId: null },
  { sessionId: "srvUser", userId: "u1" }, // loggato → conta
  { sessionId: null, userId: null }, // niente id → non conta
]);
assert.deepEqual([...visitors].sort(), ["srvTwice", "srvUser", "v_AbCdEfGhIjKlMnOp"]);

console.log("bot-filter: all tests passed");
