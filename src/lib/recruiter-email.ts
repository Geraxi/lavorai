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
 * plausibilmente in grado di ricevere una candidatura.
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

    const s = slug(company);
    let best: string | null = null;
    let bestScore = -Infinity;

    if (matches.length > 0) {
      const unique = Array.from(new Set(matches));
      for (const e of unique) {
        const sc = score(e, s);
        if (sc > bestScore) {
          bestScore = sc;
          best = e;
        }
      }
    }

    // ── Claude AI fallback ─────────────────────────────────────────────
    // Se regex + score non danno un buon candidato (nessun match, o tutti
    // negativi per blacklist/generic), chiediamo a Claude di estrarre
    // un'email di recruiting dal testo pulito. Copre annunci italiani SMB
    // dove l'email è dentro un blob "Come candidarsi:" o nel footer non
    // strutturato che sfugge alla regex.
    if (!best || bestScore < 0) {
      const claudeEmail = await extractEmailWithClaude(html, company).catch(
        (err) => {
          console.warn("[recruiter-scrape] Claude fallback failed:", err);
          return null;
        },
      );
      if (claudeEmail) {
        const sc = score(claudeEmail, s);
        // Accettiamo anche score 0 (email neutra) — Claude ha filtrato
        // manualmente rispetto ai fake, ci fidiamo un po' di più.
        if (sc > -1000 && !BLACKLIST_FULL.has(claudeEmail)) {
          best = claudeEmail;
        }
      }
    }

    if (!best) return null;

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

/**
 * Fallback AI: chiede a Claude Sonnet di estrarre l'email di recruiting
 * dal testo della pagina. Prompt strict: solo email VERE di contatto per
 * candidatura, mai placeholder o generic (info@, noreply@, ecc). Ritorna
 * null se Claude non ne trova una legittima.
 *
 * Costo: ~1 chiamata Claude per RTA — vale la pena solo per il fallback
 * (regex NON trova o trova solo email pessime).
 */
async function extractEmailWithClaude(
  html: string,
  company: string | null,
): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  // Pulizia HTML → testo, cap 15k char per non esplodere sui token
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 15000);
  if (text.length < 50) return null;

  const prompt = `Sei un extractor. Cerca UNA email di recruiting/candidature nel testo di questo annuncio di lavoro${company ? ` di ${company}` : ""}.

Rispondi ESCLUSIVAMENTE con:
- una email valida (es. "hr@company.com") se ne trovi UNA legittima usata per ricevere candidature
- la parola "NONE" (senza virgolette) se nessuna email è chiaramente di recruiting

Regole rigide (RIFIUTA e rispondi "NONE" se):
- Email non riconducibile chiaramente al recruiting (no info@, no noreply@, no privacy@, no gdpr@, no accessibility@, no legal@, no ufficio-stampa@)
- Email placeholder (name@company.com, your.email@...)
- Email di dipendenti citate solo di sfuggita
- Se l'annuncio dice "candidati sul sito" o "clicca qui" senza email

Testo:
"""
${text}
"""

Solo l'email o "NONE". Nient'altro.`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 60,
        messages: [{ role: "user", content: prompt }],
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      content?: Array<{ type: string; text?: string }>;
    };
    const raw = (data.content ?? [])
      .map((b) => (b.type === "text" ? (b.text ?? "") : ""))
      .join("")
      .trim()
      .toLowerCase();
    if (!raw || raw === "none") return null;
    // Estrai la prima email dalla risposta (Claude potrebbe aggiungere
    // rumore nonostante l'istruzione)
    const emailMatch = raw.match(
      /\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/,
    );
    if (!emailMatch) return null;
    console.log(`[recruiter-scrape] Claude found: ${emailMatch[0]}`);
    return emailMatch[0];
  } catch (err) {
    console.warn("[recruiter-scrape] Claude call errored:", err);
    return null;
  }
}
