import { createHash } from "node:crypto";
import { domainToASCII, domainToUnicode } from "node:url";
import { parse as parseDomain } from "tldts";
/**
 * Scraping opportunistico dell'email del recruiter dall'HTML del job posting.
 *
 * Non è garantito che l'email sia presente — dipende dal portale e
 * dall'annuncio. Quando la troviamo, la cachiamo su Job.recruiterEmail
 * La cache non autorizza invii: la pagina viene verificata nuovamente al momento dell’invio.
 */

// Email consideriamo "non utili per candidatura"
const BLACKLIST_LOCAL = new Set([
  "no-reply",
  "noreply",
  "donotreply",
  "do-not-reply",
  "info",
  "support",
  "help",
  "privacy",
  "dpo",
  "legal",
  "abuse",
  "postmaster",
  "webmaster",
  "admin",
  "mailer-daemon",
  "notifications",
  "notification",
  "marketing",
  "news",
  "newsletter",
  "unsubscribe",
  "automation",
  "builds",
  "ci",
  // Placeholder comuni — sono template visibili in form e footer
  "tua.email",
  "tuaemail",
  "your.email",
  "yourmail",
  "youremail",
  "name",
  "nome",
  "nome.cognome",
  "name.surname",
  "firstname.lastname",
  "first.last",
  "email",
  "user",
  "test",
  "example",
  "esempio",
  "john.doe",
  "mario.rossi",
  "jane.doe",
  "demo",
  "sample",
]);

// Interi indirizzi notoriamente placeholder
const BLACKLIST_FULL = new Set([
  "tua.email@email.com",
  "tuaemail@email.com",
  "nome.cognome@azienda.it",
  "nome.cognome@email.com",
  "your.email@example.com",
  "name@example.com",
  "name@domain.com",
  "user@example.com",
  "email@example.com",
  "info@example.com",
  "test@test.com",
  "test@example.com",
  "email@email.com",
]);

// Domini placeholder/sentinella — se compaiono, scartiamo a prescindere
const BLACKLIST_DOMAIN = new Set([
  "email.com",        // placeholder italiano "tua.email@email.com"
  "example.com",
  "example.org",
  "example.net",
  "example.it",
  "domain.com",
  "test.com",
  "email.it",
  "sample.com",
  "foo.com",
  "bar.com",
  "tld.com",
  "yourdomain.com",
  "yourcompany.com",
  "azienda.it",
  "company.com",
  "mail.com",        // troppo generico come inbox recruiter
  // Provider scraped by accident
  "adzuna.it",
  "adzuna.com",
  "adzuna.co.uk",
  "sentry.io",
  "sentry.wixpress.com",
  "ingest.sentry.io",
  "o153781.ingest.sentry.io",
  "ingest.de.sentry.io",
  "ingest.us.sentry.io",
  "google-analytics.com",
  "googleapis.com",
  "schema.org",
  "w3.org",
  "wordpress.com",
  "gravatar.com",
  "cloudflare.com",
]);

// Email "preferred" per candidature
const PREFERRED_LOCAL = new Set([
  "hr",
  "jobs",
  "jobs-apply",
  "job",
  "recruiting",
  "recruiter",
  "recruitment",
  "talent",
  "talents",
  "hiring",
  "careers",
  "work",
  "lavoro",
  "candidature",
  "candidati",
  "selezione",
  "personale",
  "applications",
  "apply",
  "cv",
]);

// Sottostringhe nel local-part che indicano caselle NON adatte a ricevere
// candidature (accessibilità, accomodamenti, diversità, stampa, investitori,
// compliance, sicurezza, reclami, ecc.). Match per `includes`, non esatto.
const BLACKLIST_SUBSTRING = [
  "accessib", // accessiblerecruitment, accessibility
  "accommodation",
  "accomodation",
  "adjustment", // reasonableadjustments
  "diversity",
  "inclusion",
  "press",
  "media",
  "investor",
  "compliance",
  "security",
  "gdpr",
  "complaint",
  "reclami",
  "whistleblow",
  "fraud",
  "spam",
];

function score(email: string, companySlug: string | null): number {
  const [local, domain] = email.split("@");
  if (!local || !domain) return -1;
  if (BLACKLIST_FULL.has(email)) return -1000;
  if (BLACKLIST_DOMAIN.has(domain)) return -1000;
  // Blocca qualsiasi sottodominio sentry (*.ingest.sentry.io, *.ingest.de.sentry.io, ecc.)
  if (/(^|\.)ingest(\.[a-z]+)?\.sentry\.io$/i.test(domain)) return -1000;
  if (/(^|\.)sentry\.io$/i.test(domain)) return -1000;
  if (BLACKLIST_LOCAL.has(local)) return -100;
  // Blocklist per SOTTOSTRINGA: caselle che NON processano candidature
  // anche se contengono "recruitment"/"recruiting". Es. The Fork usa
  // accessiblerecruitment@thefork.com SOLO per richieste di accessibilità
  // — mandarci una candidatura la perde silenziosamente.
  if (BLACKLIST_SUBSTRING.some((sub) => local.includes(sub))) return -1000;
  // Regex-level filters su local part palesemente finti
  if (/^(tu|you)(a|r)?[._-]?e?mail$/i.test(local)) return -1000;
  if (/^nome[._-]?cognome$/i.test(local)) return -1000;
  if (/^first[._-]?last$/i.test(local)) return -1000;
  // DSN Sentry: hash hex di 24-40 caratteri come local part
  if (/^[0-9a-f]{24,}$/i.test(local)) return -1000;
  // Artefatti di unicode-escape non deconvertiti (\u003e, \u0027, ecc.)
  if (/u[0-9a-f]{4}/i.test(local)) return -1000;
  // Local part che sembra pezzo di codice/JSON: apici, backslash, parentesi
  if (/[\\"'<>(){}[\]]/.test(local)) return -1000;

  let s = 0;
  if (PREFERRED_LOCAL.has(local)) s += 50;
  if (local.startsWith("hr") || local.startsWith("jobs")) s += 20;
  // penalizza domini "email throwaway" / pubblici
  if (/gmail\.com|yahoo\.|hotmail|outlook\.com|libero\.it|live\.com/.test(domain)) {
    s -= 10; // non sempre male, ma priorità a domini aziendali
  }
  if (companySlug) {
    const domainSlug = domain.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (domainSlug.includes(companySlug) || companySlug.includes(domainSlug.split(".")[0] ?? "")) {
      s += 100; // match forte
    }
  }
  return s;
}

function slug(company: string | null | undefined): string | null {
  if (!company) return null;
  const s = company.toLowerCase().replace(/[^a-z0-9]/g, "");
  return s.length >= 3 ? s : null;
}

async function hasMxRecord(domain: string): Promise<boolean> {
  if (!domain) return false;
  try {
    const dns = await import("node:dns/promises");
    const mx = await dns.resolveMx(domain).catch(() => []);
    if (mx.length > 0) return true;
    // Fallback: se il dominio ha almeno un A record, può comunque ricevere
    // email (MX assente → fallback all'A record è RFC standard)
    const a = await dns.resolve4(domain).catch(() => []);
    return a.length > 0;
  } catch {
    return false;
  }
}

/**
 * Valida un'email recruiter GIÀ NOTA (es. arrivata dall'ingestion del job,
 * non scrapata da noi) con le stesse regole dello scraping: blacklist
 * (privacy/no-reply/info/generic), placeholder, artefatti, + MX record reale.
 *
 * Serve perché Job.recruiterEmail può contenere caselle inadatte salvate a
 * monte: senza questa guardia il worker mandava la candidatura lì e la
 * marcava "success" (falsa conferma). Ritorna true solo se l'indirizzo è
 * plausibilmente in grado di ricevere posta. Non dimostra ownership né consenso
 * a ricevere candidature: usare findVerifiedRecruiterEmail per la consegna.
 */
export async function isUsableRecruiterEmail(
  email: string | null | undefined,
  company: string | null,
): Promise<boolean> {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(normalized)) return false;
  // score < 0 = blacklist/placeholder/artefatto (incl. privacy, no-reply, dpo…)
  if (score(normalized, slug(company)) < 0) return false;
  return hasMxRecord(normalized.split("@")[1] ?? "");
}

export type VerifiedRecruiterEmail = {
  email: string;
  provenance: {
    version: 1;
    sourceType: "employer_job_page";
    requestedUrl: string;
    sourceUrl: string;
    observedAt: string;
    pageSha256: string;
    evidence: string;
    company: string;
    extraction: "visible_application_instruction";
  };
};

// Do not truncate unsupported Unicode mailboxes/domains into a different ASCII
// recipient (e.g. jobs@acme.com.évil.com must never become jobs@acme.com).
const EMAIL_RE = /(?<![\p{L}\p{N}\p{M}._%+@-])[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}(?![\p{L}\p{N}\p{M}@_-]|\.[\p{L}\p{N}\p{M}.-])/gu;
const ATS_HOSTS = ["greenhouse.io", "ashbyhq.com", "lever.co", "workable.com", "smartrecruiters.com", "recruitee.com", "teamtailor.com", "bamboohr.com", "breezy.hr", "pinpointhq.com", "personio.de", "personio.com"];
const AGGREGATOR_HOSTS = ["indeed.com", "linkedin.com", "adzuna.com", "adzuna.it", "glassdoor.com", "jooble.org", "ziprecruiter.com"];
const domainIs = (host: string, domain: string) => host === domain || host.endsWith(`.${domain}`);
// Preserve Unicode letters: dropping non-ASCII characters can turn a different
// IDN brand into an apparent ASCII match. Do not fold visual confusables.
const compactIdentity = (value: string) => value.normalize("NFC").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
const identity = (value: string) => compactIdentity(value.replace(/\b(incorporated|limited|inc|ltd|llc|srl|s\.r\.l|spa|gmbh)\.?$/i, ""));

function registrableIdentity(host: string): { domain: string; key: string } | null {
  const ascii = domainToASCII(host).toLowerCase();
  if (!ascii || ascii.endsWith(".")) return null;
  // Include PRIVATE suffixes: acme.github.io and other.github.io are different
  // tenants. Unlisted, special-use, IP and malformed hosts require review.
  const parsed = parseDomain(ascii, { allowPrivateDomains: true, detectSpecialUse: true });
  if ((!parsed.isIcann && !parsed.isPrivate) || parsed.isSpecialUse || parsed.isIp
    || !parsed.domain || !parsed.domainWithoutSuffix) return null;
  return { domain: parsed.domain, key: compactIdentity(domainToUnicode(parsed.domainWithoutSuffix)) };
}

/** Match only provider-defined tenant positions on approved posting layouts.
 * A company word elsewhere in an ATS URL is never tenant attribution. These
 * layouts mirror the existing portal adapters; unknown layouts require review.
 */
function approvedAtsTenant(url: URL): string | null {
  const host = url.hostname;
  const path = url.pathname;
  const pathTenants: Array<{ hosts: string[]; posting: RegExp }> = [
    { hosts: ["boards.greenhouse.io", "job-boards.greenhouse.io"], posting: /^\/([a-z0-9-]+)\/jobs\/[^/]+(?:\/apply)?\/?$/i },
    { hosts: ["jobs.ashbyhq.com", "jobs.lever.co", "jobs.eu.lever.co"], posting: /^\/([a-z0-9-]+)\/[^/]+(?:\/application|\/apply)?\/?$/i },
    { hosts: ["apply.workable.com"], posting: /^\/([a-z0-9-]+)\/j\/[^/]+(?:\/apply)?\/?$/i },
    { hosts: ["jobs.smartrecruiters.com", "careers.smartrecruiters.com"], posting: /^\/([a-z0-9-]+)\/[^/]+\/?$/i },
  ];
  for (const entry of pathTenants) {
    if (entry.hosts.includes(host)) return entry.posting.exec(path)?.[1] ?? null;
  }
  const hostTenants: Array<{ host: RegExp; posting: RegExp }> = [
    { host: /^([a-z0-9-]+)\.recruitee\.com$/i, posting: /^\/o\/[^/]+(?:\/c\/new)?\/?$/i },
    { host: /^([a-z0-9-]+)\.teamtailor\.com$/i, posting: /^\/jobs\/[^/]+(?:\/applications\/new)?\/?$/i },
    { host: /^([a-z0-9-]+)\.bamboohr\.com$/i, posting: /^\/careers\/[^/]+\/?$/i },
    { host: /^([a-z0-9-]+)\.breezy\.hr$/i, posting: /^\/p\/[^/]+(?:\/apply)?\/?$/i },
    { host: /^([a-z0-9-]+)\.pinpointhq\.com$/i, posting: /^\/(?:[a-z]{2}\/)?postings\/[^/]+(?:\/applications\/new)?\/?$/i },
    { host: /^([a-z0-9-]+)\.jobs\.personio\.(?:de|com)$/i, posting: /^\/job\/[^/]+(?:\/apply|\/application)?\/?$/i },
  ];
  for (const entry of hostTenants) {
    const tenant = entry.host.exec(host)?.[1];
    if (tenant && entry.posting.test(path)) return tenant;
  }
  return null;
}

function attributedSource(url: URL, companyKey: string): { domain: string; ats: boolean } | null {
  // Plain HTTP, credentials and nonstandard ports cannot establish a safe
  // destination for a CV. They need a separately reviewed canonical HTTPS URL.
  if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
  if (AGGREGATOR_HOSTS.some((host) => domainIs(url.hostname, host))) return null;
  const source = registrableIdentity(url.hostname);
  if (!source) return null;
  const ats = ATS_HOSTS.some((host) => domainIs(url.hostname, host));
  if (ats) {
    const tenant = approvedAtsTenant(url);
    if (!tenant || compactIdentity(domainToUnicode(tenant)) !== companyKey) return null;
  } else if (source.key !== companyKey) return null;
  return { domain: source.domain, ats };
}
function decodeHtml(value: string): string {
  return value.replace(/&#(?:x([0-9a-f]+)|(\d+));?/gi, (_match, hex, decimal) => {
    const code = Number.parseInt(hex ?? decimal, hex ? 16 : 10);
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : " ";
  }).replace(/&commat;/gi, "@").replace(/&period;/gi, ".").replace(/&amp;/gi, "&").replace(/&(?:nbsp|quot|apos|lt|gt);/gi, " ");
}

/** Freshly fetch the selected employer posting every time. An old cache or DNS
 * record is never evidence that an employer invited this application. We use no
 * model-generated candidates: only literal addresses in visible application
 * instructions can pass, with a source excerpt and page digest for the attempt.
 */
export async function findVerifiedRecruiterEmail(
  jobUrl: string, company: string | null, cachedEmail?: string | null,
): Promise<VerifiedRecruiterEmail | null> {
  void cachedEmail; // deliberately not authority, nor a selection preference
  if (!company?.trim()) return null;
  try {
    const requested = new URL(jobUrl);
    const companyKey = identity(company);
    if (companyKey.length < 3 || !attributedSource(requested, companyKey)) return null;
    const response = await fetch(jobUrl, { headers: { "User-Agent": "Mozilla/5.0", accept: "text/html" }, signal: AbortSignal.timeout(10_000), redirect: "follow" });
    if (!response.ok) return null;
    const final = new URL(response.url || jobUrl);
    // A redirect to another organization or a generic listing is not provenance
    // for this posting. Resolve changed employer URLs separately, then recheck.
    if (requested.origin !== final.origin || /^[\/]?$/.test(final.pathname)) return null;
    const source = attributedSource(final, companyKey);
    if (!source) return null;
    if (/[?&]error=true(?:&|$)/i.test(final.search)) return null;
    const contentType = response.headers.get("content-type") ?? "";
    if (!/text\/html|application\/xhtml\+xml/i.test(contentType)) return null;
    const html = (await response.text()).slice(0, 300_000);
    // Registrable-domain/ATS attribution is source evidence, not cryptographic
    // ownership. Unknown employer-brand mappings remain a manual-review case.
    // Do not mine script bundles, analytics, placeholder inputs, footer contacts,
    // privacy/accommodation text or navigation for application destinations.
    const visibleHtml = html.replace(/<(script|style|nav|footer|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi, " ");
    const visible = decodeHtml(visibleHtml.replace(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi, (_all, attrs: string, body: string) => {
      const mailto = attrs.match(/href\s*=\s*["']mailto:([^?"']+)/i)?.[1];
      return `${body}${mailto ? ` ${decodeHtml(mailto)}` : ""}`;
    }).replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
    if (/job (?:was )?not found|this (?:job|position) is no longer|no longer accepting applications|annuncio scaduto|captcha|access denied/i.test(visible)) return null;
    if (!identity(visible).includes(companyKey)) return null;
    const candidates: Array<{ email: string; evidence: string; score: number }> = [];
    for (const match of visible.matchAll(EMAIL_RE)) {
      const email = match[0].toLowerCase();
      const start = match.index ?? 0;
      const context = visible.slice(Math.max(0, start - 180), start + email.length + 100);
      const preceding = visible.slice(Math.max(0, start - 180), start).replace(EMAIL_RE, "[email]");
      // An explicit application action before the address, or a dedicated
      // recruiting-contact label, is required. Merely "we are hiring" elsewhere
      // on the page cannot make a footer employee address an application inbox.
      const invited = /(?:(?:send|submit|invia(?:re)?|manda(?:re)?)[^.!?]{0,60}(?:cv|resume|application|candidat(?:ura|ure))|(?:apply|candidati)\s+(?:by email|via email|to|at|scrivendo)|(?:applications?|recruit(?:ing|ment)|hiring|talent acquisition)(?:\s+(?:contact|email|inbox|team))?\s*[:–-])[^.!?]{0,100}$/i.test(preceding);
      const excluded = /(?:do not|don't|non)[^.!?]{0,70}(?:send|submit|apply|invia|manda)|(?:accessibility|accommodation|privacy|disabilit|technical support)[^.!?]{0,100}$/i.test(preceding);
      if (!invited || excluded) continue;
      const candidateScore = score(email, slug(company));
      if (candidateScore < 0) continue;
      // Cross-employer addresses cannot piggyback on a real job page. An external
      // recruiter with a different domain needs explicit review/verified mapping.
      const emailDomain = email.split("@")[1];
      const recipient = registrableIdentity(emailDomain);
      if (!recipient || recipient.key !== companyKey) continue;
      // For direct employer-page attribution, a same-brand domain on another TLD
      // is an unverified affiliate. ATS pages use the checked tenant above and
      // the literal employer-domain address in the application instruction.
      if (!source.ats && recipient.domain !== source.domain) continue;
      candidates.push({ email, evidence: context, score: candidateScore });
    }
    candidates.sort((a, b) => b.score - a.score);
    for (const candidate of candidates) {
      if (!await isUsableRecruiterEmail(candidate.email, company)) continue;
      return { email: candidate.email, provenance: { version: 1, sourceType: "employer_job_page",
        requestedUrl: jobUrl, sourceUrl: final.toString(), observedAt: new Date().toISOString(),
        pageSha256: createHash("sha256").update(html).digest("hex"), evidence: candidate.evidence,
        company, extraction: "visible_application_instruction" } };
    }
    return null;
  } catch { return null; }
}

/** Compatibility for callers that need only the address. The worker must use
 * findVerifiedRecruiterEmail and persist its provenance on the send attempt.
 */
export async function scrapeRecruiterEmail(jobUrl: string, company: string | null): Promise<string | null> {
  return (await findVerifiedRecruiterEmail(jobUrl, company))?.email ?? null;
}
