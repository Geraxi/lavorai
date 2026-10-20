import { findPortalAdapter, type PortalAdapter } from "@/lib/portal-adapters";

/**
 * Risoluzione adapter ATS basata SOLO sull'host dell'URL.
 * `Application.portal` è un'etichetta storica (spesso "other"/"linkedin"/
 * fonte aggregatore) e NON deve decidere se un ATS è supportato: un URL
 * boards.greenhouse.io raggiunge sempre l'adapter Greenhouse.
 */

/** Normalizza l'URL per il match host: https, host minuscolo, niente "www." né punto finale. */
export function normalizeAtsUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    if (u.username || u.password) return null;
    u.hostname = u.hostname.toLowerCase().replace(/\.$/, "").replace(/^www\./, "");
    return u.toString();
  } catch {
    return null;
  }
}

export function atsHost(raw: string | null | undefined): string | null {
  const n = normalizeAtsUrl(raw);
  return n ? new URL(n).hostname : null;
}

export interface ResolvedAtsAdapter {
  adapter: PortalAdapter;
  /** URL (canonico o risolto) che ha prodotto il match. */
  url: string;
}

/** Primo URL (in ordine di priorità) il cui host corrisponde a un adapter. */
export function resolveAdapterByUrl(urls: Array<string | null | undefined>): ResolvedAtsAdapter | null {
  for (const raw of urls) {
    if (!raw) continue;
    const direct = findPortalAdapter(raw);
    if (direct) return { adapter: direct, url: raw };
    const normalized = normalizeAtsUrl(raw);
    if (normalized && normalized !== raw) {
      const viaNorm = findPortalAdapter(normalized);
      if (viaNorm) return { adapter: viaNorm, url: normalized };
    }
  }
  return null;
}

/** Messaggi utente: distinguono ATS supportato (adapter non riuscito/disattivato) da portale davvero non supportato. */
export const UNSUPPORTED_PORTAL_MESSAGE =
  "Questo portale non è supportato per invio automatico. Apri l'annuncio e candidati manualmente — CV e lettera sono pronti nella sezione Materiali.";

export function supportedAtsNotSubmittedMessage(label: string, reason: "adapter_failed" | "portal_submit_disabled"): string {
  return reason === "portal_submit_disabled"
    ? `Portale ${label} supportato, ma l'invio automatico via ATS è disattivato. Nessun invio effettuato — CV e lettera sono pronti nella sezione Materiali.`
    : `Portale ${label} supportato, ma l'invio automatico non è stato completato (adapter ATS non riuscito). Nessun invio effettuato — CV e lettera sono pronti nella sezione Materiali.`;
}

export function noAdapterMessageFor(jobUrl: string, opts: { portalSubmitEnabled: boolean }): string {
  const hit = resolveAdapterByUrl([jobUrl]);
  if (!hit) return UNSUPPORTED_PORTAL_MESSAGE;
  return supportedAtsNotSubmittedMessage(hit.adapter.label, opts.portalSubmitEnabled ? "adapter_failed" : "portal_submit_disabled");
}
