"use client";

/**
 * Logo azienda — prova a caricare il logo reale via Clearbit Logo API
 * (domain guess dal company name), fallback automatico a bubble colorato
 * con iniziali se la fetch fallisce. Usato in tabelle/card applicazioni.
 */

import { useState } from "react";

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
 * "Spotify Inc." → "spotify"; "DeepMind AI" → "deepmind"
 * Strips common suffixes (Inc, Ltd, GmbH, S.r.l., etc.).
 */
export function companyDomainGuess(name: string | null | undefined): string | null {
  if (!name) return null;
  const cleaned = name
    .toLowerCase()
    .replace(/\b(inc|ltd|llc|gmbh|s\.?r\.?l\.?|s\.?p\.?a\.?|sa|ag|bv|co|corp|corporation|company|group|holdings?)\b\.?/gi, "")
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
  const [errored, setErrored] = useState(false);
  const showImage = domain && !errored;

  return (
    <div
      className="flex flex-none items-center justify-center font-semibold text-white overflow-hidden"
      style={{
        background: showImage ? "#FFFFFF" : c,
        width: size,
        height: size,
        fontSize: Math.max(10, size * 0.42),
        letterSpacing: "-0.02em",
        borderRadius: rounded,
        boxShadow: showImage ? "0 1px 2px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.04)" : undefined,
      }}
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`https://logo.clearbit.com/${domain}`}
          alt={company}
          width={size}
          height={size}
          onError={() => setErrored(true)}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "contain",
            padding: Math.max(2, size * 0.08),
          }}
        />
      ) : (
        companyInitials(company)
      )}
    </div>
  );
}
