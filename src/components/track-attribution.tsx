"use client";

import { useEffect } from "react";

/**
 * First-touch attribution capture. Alla PRIMA pageview salva in un
 * cookie `lv_attrib` (30gg) da dove arriva l'utente:
 *   - referrer host (google.com, reddit.com, producthunt.com…) oppure "direct"
 *   - utm_source / utm_medium / utm_campaign se presenti nell'URL
 *   - landing path (es. "/auto-candidatura")
 *
 * Se il cookie esiste già NON viene sovrascritto → first-touch.
 * Il signup route legge questo cookie e popola i campi User.signup*.
 *
 * Silenzioso, no UI, ~1KB. Nessun ping esterno — puro localStorage/cookie.
 */
const COOKIE = "lv_attrib";
const MAX_AGE_DAYS = 30;

function hasAttribCookie(): boolean {
  return document.cookie.split("; ").some((c) => c.startsWith(`${COOKIE}=`));
}

function safeHost(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function TrackAttribution() {
  useEffect(() => {
    try {
      if (hasAttribCookie()) return; // first-touch: non sovrascrivere
      const params = new URLSearchParams(window.location.search);
      const referrerHost = safeHost(document.referrer);
      const currentHost = window.location.hostname.toLowerCase().replace(/^www\./, "");
      // Referrer sul nostro dominio → non è "sorgente esterna"
      const externalReferrer = referrerHost && referrerHost !== currentHost ? referrerHost : "";

      const data: Record<string, string> = {
        r: externalReferrer || "direct",
        s: (params.get("utm_source") || "").slice(0, 60),
        m: (params.get("utm_medium") || "").slice(0, 60),
        c: (params.get("utm_campaign") || "").slice(0, 80),
        p: window.location.pathname.slice(0, 120),
      };
      // Rimuovi chiavi vuote per tenere il cookie piccolo
      const payload = Object.entries(data)
        .filter(([, v]) => v)
        .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
        .join("|");
      if (!payload) return;
      const maxAge = MAX_AGE_DAYS * 24 * 3600;
      document.cookie = `${COOKIE}=${payload}; Max-Age=${maxAge}; Path=/; SameSite=Lax`;
    } catch {
      /* ignore */
    }
  }, []);
  return null;
}
