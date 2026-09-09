"use client";

/**
 * Client-only sub-componente di CompanyLogo: prova a caricare il logo
 * reale dell'azienda, provando più domini candidati in sequenza, e
 * ripiega sulle iniziali colorate se nessuno risponde.
 *
 * Sorgente: servizio icone DuckDuckGo (favicon ad alta risoluzione quando
 * disponibile). Risponde 404 per i domini sconosciuti, quindi onError è
 * un segnale affidabile per passare al candidato successivo (a differenza
 * del servizio Google, che restituisce sempre un'icona generica).
 */

import { useEffect, useState } from "react";

const iconUrl = (domain: string) => `https://icons.duckduckgo.com/ip3/${domain}.ico`;

/** Cache di modulo: domini che hanno già fallito (evita 404 ripetuti nella stessa sessione). */
const failed = new Set<string>();

export function CompanyLogoImage({
  domains,
  initials,
  color,
  size,
  rounded,
}: {
  domains: string[];
  initials: string;
  color: string;
  size: number;
  rounded: number;
}) {
  const candidates = domains.filter((d) => !failed.has(d));
  const [i, setI] = useState(0);
  useEffect(() => setI(0), [domains.join("|")]); // eslint-disable-line react-hooks/exhaustive-deps
  const domain = candidates[i];
  const showImage = !!domain;

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
        boxShadow: showImage ? "0 1px 2px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.06)" : undefined,
      }}
      title={domain}
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={domain}
          src={iconUrl(domain)}
          alt=""
          width={size}
          height={size}
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => {
            failed.add(domain);
            setI((x) => x + 1);
          }}
          style={{ width: "100%", height: "100%", objectFit: "contain", padding: Math.max(2, size * 0.1) }}
        />
      ) : (
        initials
      )}
    </div>
  );
}
