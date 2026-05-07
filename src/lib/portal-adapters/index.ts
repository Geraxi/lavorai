import type { PortalAdapter } from "./types";
import { greenhouseAdapter } from "./greenhouse";
import { leverAdapter } from "./lever";
import { workableAdapter } from "./workable";
import { ashbyAdapter } from "./ashby";
import { smartrecruitersAdapter } from "./smartrecruiters";

/**
 * Registry di tutti i portali supportati. Aggiungere un nuovo ATS =
 * creare file adapter + appenderlo qui.
 *
 * Esplicitamente ESCLUSI: LinkedIn, Indeed — anti-bot aggressivo e ToS
 * che vieta automazione. Non li aggiungere.
 */

export const PORTAL_ADAPTERS: PortalAdapter[] = [
  greenhouseAdapter,
  leverAdapter,
  workableAdapter,
  ashbyAdapter,
  smartrecruitersAdapter,
];

export function findPortalAdapter(url: string): PortalAdapter | null {
  for (const a of PORTAL_ADAPTERS) {
    if (a.matches(url)) return a;
  }
  return null;
}

export type { PortalAdapter, ApplyInput, ApplyOutcome } from "./types";
