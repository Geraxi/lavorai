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
    .replace(
      /\b(inc|ltd|llc|gmbh|s\.?r\.?l\.?|s\.?p\.?a\.?|sa|ag|bv|co|corp|corporation|company|group|holdings?)\b\.?/gi,
      "",
    )
    .replace(/[^a-z0-9]+/g, "")
    .trim();
  if (!cleaned) return null;
  return `${cleaned}.com`;
}

export function CompanyLogo({
  company,
  color,
  size = 28,
  rounded = 6,
}: {
  company: string;
  color?: string;
  size?: number;
  rounded?: number;
}) {
  const c = color ?? companyColor(company);
  const domain = companyDomainGuess(company);
  const initials = companyInitials(company);

  // Se abbiamo un domain plausibile, deleghiamo a un client component
  // che prova l'immagine via Clearbit e fallback'a alle iniziali on-error.
  if (domain) {
    return (
      <CompanyLogoImage
        domain={domain}
        initials={initials}
        color={c}
        size={size}
        rounded={rounded}
      />
    );
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
