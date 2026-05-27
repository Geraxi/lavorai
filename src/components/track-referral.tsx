"use client";

import { useEffect } from "react";

/**
 * Se l'URL ha ?ref=<code> salva il codice in un cookie 'lv_ref' (90 giorni).
 * Il signup route legge questo cookie per attribuire il referredById.
 * Eseguito una sola volta per pageload — silenzioso, no UI.
 */
export function TrackReferral() {
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const ref = params.get("ref");
      if (!ref) return;
      const safe = ref.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 16);
      if (!safe) return;
      const maxAge = 90 * 24 * 3600;
      document.cookie = `lv_ref=${safe}; Max-Age=${maxAge}; Path=/; SameSite=Lax`;
    } catch {
      // ignore
    }
  }, []);
  return null;
}
