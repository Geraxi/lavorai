"use client";

/**
 * Client-only sub-componente di CompanyLogo: prova a caricare il logo
 * via Clearbit, fallback automatico a bubble colorato con iniziali
 * se la fetch fallisce. Estratto in file separato per non forzare
 * "use client" su tutto company-logo.tsx (che esporta anche helper
 * puri usati da server components).
 */

import { useState } from "react";

export function CompanyLogoImage({
  domain,
  initials,
  color,
  size,
  rounded,
}: {
  domain: string;
  initials: string;
  color: string;
  size: number;
  rounded: number;
}) {
  const [errored, setErrored] = useState(false);
  const showImage = !errored;

  return (
    <div
      className="flex flex-none items-center justify-center font-semibold text-white overflow-hidden"
      style={{
        background: showImage ? "#FFFFFF" : color,
        width: size,
        height: size,
        fontSize: Math.max(10, size * 0.42),
        letterSpacing: "-0.02em",
        borderRadius: rounded,
        boxShadow: showImage
          ? "0 1px 2px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.04)"
          : undefined,
      }}
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`https://logo.clearbit.com/${domain}`}
          alt=""
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
        initials
      )}
    </div>
  );
}
