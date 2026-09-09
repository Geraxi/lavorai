/**
 * Logo azienda — render-agnostic (server o client). Helpers puri
 * `companyColor` / `companyDomainGuess` sono usati anche da server
 * components, quindi questo file NON ha "use client" in cima. La
 * parte interattiva (image fallback con useState) vive in
 * ./company-logo-image.tsx ed è importata solo quando serve.
 */

import { CompanyLogoImage } from "./company-logo-image";

const PALETTE = [
  "#EF3E42", "#FE5FA3", "#1B3C89", "#0A0A0A", "#7E3FF2",
  "#1F6BFF", "#F7235C", "#FFB400", "#FF2954", "#DD0000",
  "#FF3A9E", "#0E4C92", "#FF5A00", "#00D084", "#5D2EFA",
];

export function companyColor(name: string): string {
  if (!name) return PALETTE[0];
  let sum = 0;
  for (let i = 0; i < Math.min(name.length, 6); i++) {
    sum = (sum + name.charCodeAt(i)) % PALETTE.length;
  }
  return PALETTE[sum];
}

function companyInitials(name: string): string {
  if (!name) return "—";
  const trimmed = name.trim();
  return trimmed.length > 2 ? trimmed.slice(0, 2) : trimmed.slice(0, 1);
}

/**
 * Slugify company name → domain guess for logo lookup.
 * "Spotify Inc." → "spotify.com"; "DeepMind AI" → "deepmindai.com".
 * Strips common suffixes (Inc, Ltd, GmbH, S.r.l., etc.).
 */
export function companyDomainGuess(name: string | null | undefined): string | null {
  if (!name) return null;
  const cleaned = name
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .replace(/\b(inc|ltd|llc|gmbh|s\.?r\.?l\.?|s\.?p\.?a\.?|s\.?a\.?s\.?|sa|ag|bv|nv|plc|co|corp|corporation|company|group|holdings?|italia|italy|international)\b\.?/gi, "")
    .replace(/[^a-z0-9]+/g, "")
    .trim();
  if (!cleaned) return null;
  return `${cleaned}.com`;
}

/** Host di ATS/aggregatori: NON sono il dominio dell'azienda. */
const NOT_COMPANY_HOST =
  /greenhouse\.io|lever\.co|workable\.com|ashbyhq\.com|smartrecruiters\.com|recruitee\.com|personio\.|teamtailor\.com|bamboohr\.com|adzuna\.|linkedin\.com|indeed\.|eures\.europa\.eu|europa\.eu|infojobs\.|glassdoor\.|jooble\.|randstad\.|adecco\.|gigroup\.|manpower\.|example\.com/i;

/**
 * Domini candidati per il logo, in ordine: dominio reale dell'annuncio
 * (se è il sito dell'azienda e non un ATS), poi le ipotesi <nome>.com e <nome>.it.
 */
export function companyLogoDomains(name: string, url?: string | null): string[] {
  const out: string[] = [];
  if (url) {
    try {
      const host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
      if (host && !NOT_COMPANY_HOST.test(host)) {
        // careers.acme.com → acme.com (il favicon vive sul dominio principale)
        const parts = host.split(".");
        const root = parts.length > 2 && !/\.(co|com|org)\.[a-z]{2}$/.test(host) ? parts.slice(-2).join(".") : host;
        out.push(root);
        if (root !== host) out.push(host);
      }
    } catch { /* url non valida */ }
  }
  const guess = companyDomainGuess(name);
  if (guess) {
    out.push(guess);
    out.push(guess.replace(/\.com$/, ".it"));
  }
  return [...new Set(out)];
}

export function CompanyLogo({
  company,
  color,
  size = 28,
  rounded = 6,
  url,
}: {
  company: string;
  color?: string;
  size?: number;
  rounded?: number;
  /** URL dell'annuncio o sito azienda: se non è un ATS, il suo dominio è il primo candidato. */
  url?: string | null;
}) {
  const c = color ?? companyColor(company);
  const domains = companyLogoDomains(company, url);
  const initials = companyInitials(company);

  if (domains.length > 0) {
    return <CompanyLogoImage domains={domains} initials={initials} color={c} size={size} rounded={rounded} />;
  }

  // Fallback puro: bubble colorato con iniziali (RSC-compatible).
  return (
    <div
      className="flex flex-none items-center justify-center font-semibold text-white"
      style={{
        background: c,
        width: size,
        height: size,
        fontSize: Math.max(10, size * 0.42),
        letterSpacing: "-0.02em",
        borderRadius: rounded,
      }}
    >
      {initials}
    </div>
  );
}
