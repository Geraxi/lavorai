/**
 * Config portali supportati — Sprint 4 MVP.
 * Ogni portale dichiara:
 *  - loginUrl: pagina dove mandare il browser headed
 *  - loggedInUrlPattern: regex che matcha URL "autenticato" (post-login)
 *  - applyEntrypoint: come rilevare il job apply button (tbd per portale)
 */

export type PortalId = "infojobs" | "linkedin" | "indeed" | "subito";

export interface PortalConfig {
  id: PortalId;
  label: string;
  loginUrl: string;
  /** URL pattern che indica login avvenuto con successo */
  loggedInUrlPattern: RegExp;
  /** User-agent desktop realistico da usare per tutte le sessioni */
  defaultUserAgent: string;
}

const REALISTIC_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

export const PORTALS: Record<PortalId, PortalConfig> = {
  infojobs: {
    id: "infojobs",
    label: "InfoJobs",
    loginUrl: "https://www.infojobs.it/candidate/login/",
    loggedInUrlPattern: /infojobs\.it\/(candidate\/home|panel|dashboard)/i,
    defaultUserAgent: REALISTIC_UA,
  },
  linkedin: {
    id: "linkedin",
    label: "LinkedIn",
    loginUrl: "https://www.linkedin.com/login",
    loggedInUrlPattern: /linkedin\.com\/(feed|in|jobs|mynetwork)/i,
    defaultUserAgent: REALISTIC_UA,
  },
  indeed: {
    id: "indeed",
    label: "Indeed",
    loginUrl: "https://secure.indeed.com/auth",
    loggedInUrlPattern: /indeed\.com\/(account|mycv|myjobs)/i,
    defaultUserAgent: REALISTIC_UA,
  },
  subito: {
    id: "subito",
    label: "Subito Lavoro",
    loginUrl: "https://www.subito.it/login",
    loggedInUrlPattern: /subito\.it\/(my|area-riservata)/i,
    defaultUserAgent: REALISTIC_UA,
  },
};

export function isPortalId(v: string): v is PortalId {
  return v in PORTALS;
}
