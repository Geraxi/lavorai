"use client";

import { useEffect } from "react";
import {
  ATTRIB_COOKIE,
  ATTRIB_MAX_AGE_SECONDS,
  buildAttribPayload,
} from "@/lib/signup-attribution";

/**
 * First-touch attribution capture (client fallback). Il proxy imposta già
 * `lv_attrib` server-side alla prima richiesta di pagina; questo componente
 * lo scrive solo se manca ancora (es. proxy saltato), con lo stesso formato:
 *   - referrer host (google.com, reddit.com, producthunt.com…) oppure "direct"
 *   - utm_source / utm_medium / utm_campaign se presenti nell'URL
 *   - landing path (es. "/auto-candidatura")
 *
 * Se il cookie esiste già NON viene sovrascritto → first-touch.
 * Il signup (email e Google/magic link) legge questo cookie e popola User.signup*.
 */
function hasAttribCookie(): boolean {
  return document.cookie.split("; ").some((c) => c.startsWith(`${ATTRIB_COOKIE}=`));
}

export function TrackAttribution() {
  useEffect(() => {
    try {
      if (hasAttribCookie()) return; // first-touch: non sovrascrivere
      const payload = buildAttribPayload({
        referrer: document.referrer,
        currentHost: window.location.hostname,
        search: window.location.search,
        pathname: window.location.pathname,
      });
      if (!payload) return;
      document.cookie = `${ATTRIB_COOKIE}=${payload}; Max-Age=${ATTRIB_MAX_AGE_SECONDS}; Path=/; SameSite=Lax`;
    } catch {
      /* ignore */
    }
  }, []);
  return null;
}
