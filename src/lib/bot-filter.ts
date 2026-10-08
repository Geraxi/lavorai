import type { Prisma } from "@prisma/client";

/**
 * Filtro bot/crawler per le metriche di traffico first-party (PageView).
 *
 * Due facce della stessa lista di token, così scrittura e lettura restano coerenti:
 *   - `isBotUserAgent(ua)`: usato dal beacon /api/track/view per NON salvare le visite bot;
 *   - `HUMAN_PAGEVIEW_WHERE`: frammento Prisma da mettere in ogni query admin su PageView,
 *     così anche le righe STORICHE (salvate prima di questo filtro) vengono escluse.
 *
 * Regole: UA mancante/vuoto = bot; UA senza "mozilla/" = bot (tutti i browser reali e le
 * webview in-app — Instagram, Facebook, TikTok — iniziano con "Mozilla/5.0"); UA che contiene
 * uno dei token sotto = bot. Il match è case-insensitive su sottostringa.
 */
export const BOT_UA_TOKENS: readonly string[] = [
  // generici
  "bot",
  "crawl",
  "spider",
  "slurp",
  "headless",
  "phantom",
  "puppeteer",
  "playwright",
  "selenium",
  "webdriver",
  "lighthouse",
  "pagespeed",
  "gtmetrix",
  "python",
  "curl",
  "wget",
  "axios",
  "node-fetch",
  "undici",
  "go-http",
  "java/",
  "okhttp",
  "httpclient",
  "scrapy",
  "facebookexternalhit",
  "preview",
  "monitor",
  "uptime",
  "pingdom",
  "vercel",
  "fetcher",
  "scanner",
  "archiver",
  // bot con nome (molti già coperti da "bot", elencati per chiarezza/robustezza)
  "googlebot",
  "google-inspectiontool",
  "googleother",
  "google-extended",
  "adsbot",
  "mediapartners-google",
  "bingbot",
  "bingpreview",
  "ahrefsbot",
  "semrushbot",
  "mj12bot",
  "dotbot",
  "petalbot",
  "gptbot",
  "chatgpt-user",
  "oai-searchbot",
  "claudebot",
  "claude-web",
  "anthropic-ai",
  "perplexitybot",
  "perplexity-user",
  "bytespider",
  "amazonbot",
  "applebot",
  "yandex",
  "duckduckbot",
  "baiduspider",
  "sogou",
  "exabot",
  "seznambot",
  "ccbot",
  "dataforseo",
  "barkrowler",
  "screaming frog",
  "meta-externalagent",
  "facebookcatalog",
  "twitterbot",
  "linkedinbot",
  "slackbot",
  "telegrambot",
  "whatsapp",
  "discordbot",
  "skypeuripreview",
  "embedly",
  "iframely",
  "censys",
  "zgrab",
  "masscan",
  "nmap",
  "nuclei",
  "httpx",
];

const MIN_UA_LENGTH = 20;

/** true se lo user-agent è (molto probabilmente) un bot/crawler/automazione. */
export function isBotUserAgent(ua: string | null | undefined): boolean {
  const s = (ua ?? "").trim().toLowerCase();
  if (s.length < MIN_UA_LENGTH) return true;
  if (!s.includes("mozilla/")) return true;
  return BOT_UA_TOKENS.some((t) => s.includes(t));
}

/**
 * Frammento `where` Prisma equivalente a `!isBotUserAgent(userAgent)` (eccetto la soglia di
 * lunghezza minima, non esprimibile in Prisma: qualunque UA reale la supera comunque).
 * Da combinare con gli altri filtri: `{ ...HUMAN_PAGEVIEW_WHERE, ts: { gte } }` va bene perché
 * usa solo la chiave `AND`; se la query ha già un `AND`, unire gli array.
 */
const INSENSITIVE = "insensitive" as const;
export const HUMAN_PAGEVIEW_WHERE: { AND: Prisma.PageViewWhereInput[] } = {
  AND: [
    { userAgent: { not: null } },
    { userAgent: { not: "" } },
    { userAgent: { contains: "mozilla/", mode: INSENSITIVE } },
    ...BOT_UA_TOKENS.map((t): Prisma.PageViewWhereInput => ({ NOT: { userAgent: { contains: t, mode: INSENSITIVE } } })),
  ],
};

/**
 * Prefisso degli id visitatore generati dal client (localStorage `lv_vid`).
 * Un id `v_…` dimostra che il JS è girato e che l'id è persistente tra le visite.
 * Gli id senza prefisso sono quelli coniati dal server quando il cookie mancava
 * (comportamento storico): un client senza cookie ne riceveva uno nuovo a OGNI hit.
 */
export const CLIENT_VISITOR_PREFIX = "v_";
const CLIENT_VISITOR_RE = /^v_[A-Za-z0-9_-]{16,40}$/;

export function isValidClientVisitorId(id: unknown): id is string {
  return typeof id === "string" && CLIENT_VISITOR_RE.test(id);
}

/**
 * Visitatori unici "reali" in un insieme di page view (già filtrate da bot/interni).
 * Un sessionId conta se:
 *   - è un id client `v_…` (persistito in localStorage), oppure
 *   - compare in ≥2 righe nella finestra (il cookie è tornato indietro → persistito), oppure
 *   - almeno una sua riga ha userId (utente loggato).
 * Così gli id coniati dal server per client senza cookie (1 hit = 1 "visitatore") non gonfiano
 * più i visitatori unici, anche sulle righe storiche. Le righe senza sessionId non contano.
 */
export function realVisitorIds(rows: ReadonlyArray<{ sessionId: string | null; userId?: string | null }>): Set<string> {
  const hits = new Map<string, number>();
  const withUser = new Set<string>();
  for (const r of rows) {
    if (!r.sessionId) continue;
    hits.set(r.sessionId, (hits.get(r.sessionId) ?? 0) + 1);
    if (r.userId) withUser.add(r.sessionId);
  }
  const out = new Set<string>();
  for (const [sid, n] of hits) {
    if (sid.startsWith(CLIENT_VISITOR_PREFIX) || n >= 2 || withUser.has(sid)) out.add(sid);
  }
  return out;
}

/** Origin ammessi per il beacon (produzione, www, localhost, preview Vercel). */
export function isAllowedBeaconOrigin(origin: string): boolean {
  try {
    const u = new URL(origin);
    const h = u.hostname.toLowerCase();
    if (h === "lavorai.it" || h === "www.lavorai.it") return u.protocol === "https:";
    if (h === "localhost" || h === "127.0.0.1") return true;
    if (h.endsWith(".vercel.app")) return u.protocol === "https:";
    return false;
  } catch {
    return false;
  }
}
