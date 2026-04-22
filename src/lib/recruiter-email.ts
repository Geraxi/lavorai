/**
 * Scraping opportunistico dell'email del recruiter dall'HTML del job posting.
 *
 * Non è garantito che l'email sia presente — dipende dal portale e
 * dall'annuncio. Quando la troviamo, la cachiamo su Job.recruiterEmail
 * così non scrape-iamo due volte lo stesso annuncio.
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

function score(email: string, companySlug: string | null): number {
  const [local, domain] = email.split("@");
  if (!local || !domain) return -1;
  if (BLACKLIST_FULL.has(email)) return -1000;
  if (BLACKLIST_DOMAIN.has(domain)) return -1000;
  if (BLACKLIST_LOCAL.has(local)) return -100;
  // Regex-level filters su local part palesemente finti
  if (/^(tu|you)(a|r)?[._-]?e?mail$/i.test(local)) return -1000;
  if (/^nome[._-]?cognome$/i.test(local)) return -1000;
  if (/^first[._-]?last$/i.test(local)) return -1000;

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
 * Prende un URL di job posting e prova a estrarre l'email del recruiter.
 * Ritorna null se niente di utile trovato.
 */
export async function scrapeRecruiterEmail(
  jobUrl: string,
  company: string | null,
): Promise<string | null> {
  try {
    const res = await fetch(jobUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0 Safari/537.36",
        "Accept-Language": "it-IT,it;q=0.9,en;q=0.8",
      },
      signal: AbortSignal.timeout(10_000),
      redirect: "follow",
    });
    if (!res.ok) return null;
    const html = await res.text();

    // Estrai tutti gli indirizzi email nel body
    // (regex permissiva ma ragionevole)
    const matches = Array.from(
      html.matchAll(
        /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g,
      ),
    ).map((m) => m[0].toLowerCase());

    if (matches.length === 0) return null;
    const unique = Array.from(new Set(matches));

    const s = slug(company);
    let best: string | null = null;
    let bestScore = -Infinity;
    for (const e of unique) {
      const sc = score(e, s);
      if (sc > bestScore) {
        bestScore = sc;
        best = e;
      }
    }
    // Se tutti sono negativi → non abbiamo niente di sensato
    if (bestScore < 0 || !best) return null;

    // Sanity DNS: il dominio deve avere MX record reale (evita placeholder
    // e domini sintetici che passerebbero comunque il blacklist).
    const hasMx = await hasMxRecord(best.split("@")[1] ?? "");
    if (!hasMx) {
      console.warn(`[recruiter-scrape] domain senza MX: ${best} → scarto`);
      return null;
    }
    return best;
  } catch (err) {
    console.warn("[recruiter-scrape]", jobUrl, err);
    return null;
  }
}
