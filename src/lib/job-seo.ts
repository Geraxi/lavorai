import type { Job } from "@prisma/client";

/**
 * Helper SEO per le pagine pubbliche /lavoro/[id] (Google for Jobs).
 * Costruisce il JSON-LD JobPosting secondo le linee guida Google:
 * title, description, datePosted, validThrough, hiringOrganization,
 * jobLocation (o jobLocationType TELECOMMUTE + applicantLocationRequirements),
 * identifier, employmentType, baseSalary quando nota.
 */

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://lavorai.it";

/** Finestra di validità: 30 giorni dalla pubblicazione (o dal caching). */
export const JOB_VALID_DAYS = 30;

const COUNTRY_HINTS: Array<[RegExp, string]> = [
  [/\b(ital(y|ia)|milan[oa]?|rom[ae]|torino|turin|napoli|naples|bologna|firenze|florence|genova|palermo|bari|verona|padova|trieste|brescia|bergamo|catania|cagliari|trento|bolzano)\b/i, "IT"],
  [/\b(germany|deutschland|germania|berlin|münchen|munich|hamburg|frankfurt|köln|cologne)\b/i, "DE"],
  [/\b(france|francia|paris|lyon|marseille)\b/i, "FR"],
  [/\b(spain|españa|spagna|madrid|barcelona|valencia)\b/i, "ES"],
  [/\b(united kingdom|uk|england|london|manchester|edinburgh)\b/i, "GB"],
  [/\b(netherlands|nederland|amsterdam|rotterdam|olanda)\b/i, "NL"],
  [/\b(portugal|portogallo|lisbon|lisboa|porto)\b/i, "PT"],
  [/\b(ireland|irlanda|dublin)\b/i, "IE"],
  [/\b(switzerland|svizzera|zurich|zürich|geneva|lugano)\b/i, "CH"],
  [/\b(austria|wien|vienna)\b/i, "AT"],
  [/\b(belgium|belgio|brussels|bruxelles)\b/i, "BE"],
  [/\b(poland|polonia|warsaw|kraków)\b/i, "PL"],
  [/\b(sweden|svezia|stockholm)\b/i, "SE"],
  [/\b(denmark|danimarca|copenhagen)\b/i, "DK"],
  [/\b(usa|united states|new york|san francisco|remote - us)\b/i, "US"],
];

export function guessCountry(job: Pick<Job, "location" | "source" | "description">): string | null {
  const loc = job.location ?? "";
  for (const [re, code] of COUNTRY_HINTS) if (re.test(loc)) return code;
  if (job.source === "adzuna" || job.source === "eures") return "IT";
  return null;
}

export function isRemoteJob(job: Pick<Job, "remote" | "location" | "title">): boolean {
  return job.remote || /\b(remote|remoto|da remoto|smart working|full remote)\b/i.test(`${job.location ?? ""} ${job.title}`);
}

export function employmentType(job: Pick<Job, "contractType" | "title" | "description">): string[] {
  const t = `${job.contractType ?? ""} ${job.title}`.toLowerCase();
  const out: string[] = [];
  if (/\b(intern|stage|tirocin|apprendist)/.test(t)) out.push("INTERN");
  if (/\b(part[- ]?time)\b/.test(t)) out.push("PART_TIME");
  if (/\b(contract|freelance|consulen|p\.?iva|temporary|determinato|interim)\b/.test(t)) out.push("CONTRACTOR");
  if (out.length === 0) out.push("FULL_TIME");
  return out;
}

export function jobSlug(job: Pick<Job, "title" | "company">): string {
  return `${job.title} ${job.company ?? ""}`
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function publicJobPath(job: Pick<Job, "id" | "title" | "company">): string {
  return `/lavoro/${job.id}`;
}

export function publicJobUrl(job: Pick<Job, "id" | "title" | "company">): string {
  return `${SITE_URL}${publicJobPath(job)}`;
}

export function jobDatePosted(job: Pick<Job, "postedAt" | "cachedAt">): Date {
  return job.postedAt ?? job.cachedAt;
}

export function jobValidThrough(job: Pick<Job, "postedAt" | "cachedAt" | "closedAt">): Date {
  if (job.closedAt) return job.closedAt;
  // La validità decorre dall'ultimo aggiornamento nel pool: un annuncio
  // ancora presente nei feed è ancora aperto anche se pubblicato mesi fa.
  return new Date(job.cachedAt.getTime() + JOB_VALID_DAYS * 24 * 3600 * 1000);
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Descrizione in HTML semplice (paragrafi) partendo dal testo pulito. */
export function descriptionHtml(text: string): string {
  const paras = text
    .split(/\n{2,}|\r\n\r\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (paras.length === 0) return `<p>${esc(text)}</p>`;
  return paras.map((p) => `<p>${esc(p).replace(/\n/g, "<br/>")}</p>`).join("");
}

export function jobPostingJsonLd(job: Job): Record<string, unknown> {
  const remote = isRemoteJob(job);
  const country = guessCountry(job);
  const locality = (job.location ?? "").split(/[,·|/]/)[0]?.trim() || null;
  const base: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "JobPosting",
    title: job.title,
    description: descriptionHtml(job.description || job.title),
    datePosted: jobDatePosted(job).toISOString().slice(0, 10),
    validThrough: jobValidThrough(job).toISOString(),
    employmentType: employmentType(job),
    identifier: { "@type": "PropertyValue", name: job.source, value: job.externalId },
    hiringOrganization: { "@type": "Organization", name: job.company ?? "Azienda", sameAs: safeOrigin(job.url) },
    directApply: false,
    url: publicJobUrl(job),
  };
  if (remote) {
    base.jobLocationType = "TELECOMMUTE";
    base.applicantLocationRequirements = { "@type": "Country", name: country === "IT" || !country ? "Italy" : country };
    if (locality && locality.toLowerCase() !== "remote") {
      base.jobLocation = { "@type": "Place", address: { "@type": "PostalAddress", addressLocality: locality, ...(country ? { addressCountry: country } : {}) } };
    }
  } else {
    base.jobLocation = {
      "@type": "Place",
      address: { "@type": "PostalAddress", ...(locality ? { addressLocality: locality } : {}), ...(country ? { addressCountry: country } : {}) },
    };
  }
  if (job.salaryMin || job.salaryMax) {
    const min = job.salaryMin ?? job.salaryMax ?? 0;
    const max = job.salaryMax ?? job.salaryMin ?? 0;
    base.baseSalary = {
      "@type": "MonetaryAmount",
      currency: "EUR",
      value: { "@type": "QuantitativeValue", minValue: min, maxValue: max, unitText: "YEAR" },
    };
  }
  return base;
}

function safeOrigin(url: string): string | undefined {
  try {
    const u = new URL(url);
    if (/greenhouse|lever\.co|ashbyhq|workable|smartrecruiters|recruitee|personio|teamtailor|bamboohr|adzuna|eures|europa\.eu/i.test(u.hostname)) return undefined;
    return u.origin;
  } catch {
    return undefined;
  }
}
