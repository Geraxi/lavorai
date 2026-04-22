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
  if (BLACKLIST_LOCAL.has(local)) return -100;

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
    if (bestScore < 0) return null;
    return best;
  } catch (err) {
    console.warn("[recruiter-scrape]", jobUrl, err);
    return null;
  }
}
