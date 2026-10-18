/**
 * Consent state: pure decision logic (unit-tested) used by the client store.
 *
 * Storage (localStorage):
 *   lavorai-consent          JSON StoredConsent (current format)
 *   lavorai-cookie-consent   legacy value ("accepted" | "essential"), still
 *                            written for backward compatibility.
 */
import { CONSENT_NOTICE_VERSION, type ConsentPurpose } from "./notice";
import type { ResolvedRegion } from "./region";

export type ConsentChoice = "granted" | "denied";
export type ConsentAnswer = ConsentChoice | null;

export const CONSENT_STORAGE_KEY = "lavorai-consent";
export const LEGACY_CONSENT_KEY = "lavorai-cookie-consent";
export const CONSENT_VISITOR_KEY = "lavorai-consent-visitor";
export const CONSENT_CHANNEL = "lavorai-consent";
export const CONSENT_CHANGED_EVENT = "lavorai-consent-changed";
export const OPEN_COOKIE_SETTINGS_EVENT = "lavorai-open-cookie-settings";

export interface StoredConsent {
  v: string;
  analytics: ConsentChoice;
  advertising: ConsentChoice;
  at: string;
}

export type ConsentAnswers = Record<ConsentPurpose, ConsentAnswer>;

export type RegionState =
  | { status: "pending" }
  | ({ status: "resolved" } & ResolvedRegion);

export interface EffectiveConsent {
  analytics: boolean;
  advertising: boolean;
  showBanner: boolean;
  /** True once the region is known and permissions are final for this view. */
  ready: boolean;
}

function isChoice(v: unknown): v is ConsentChoice {
  return v === "granted" || v === "denied";
}

/**
 * Turns stored values into per-purpose answers.
 * - Refusals are honoured whatever notice version they were given under.
 * - Grants only count for the current notice version (older → unanswered).
 * - Legacy "essential" = explicit refusal of both. Legacy "accepted" was given
 *   under an older notice that bundled purposes → unanswered.
 */
export function answersFromStorage(
  raw: string | null,
  legacy: string | null,
  currentVersion: string = CONSENT_NOTICE_VERSION,
): ConsentAnswers {
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Partial<StoredConsent>;
      if (parsed && isChoice(parsed.analytics) && isChoice(parsed.advertising)) {
        const current = parsed.v === currentVersion;
        const pick = (c: ConsentChoice): ConsentAnswer => (c === "denied" ? "denied" : current ? "granted" : null);
        return { analytics: pick(parsed.analytics), advertising: pick(parsed.advertising) };
      }
    } catch {
      /* fall through to legacy */
    }
  }
  if (legacy === "essential") return { analytics: "denied", advertising: "denied" };
  return { analytics: null, advertising: null };
}

export function effectiveConsent(answers: ConsentAnswers, region: RegionState): EffectiveConsent {
  if (region.status === "pending") {
    return { analytics: false, advertising: false, showBanner: false, ready: false };
  }
  if (region.requiresConsent) {
    return {
      analytics: answers.analytics === "granted",
      advertising: answers.advertising === "granted",
      showBanner: answers.analytics === null || answers.advertising === null,
      ready: true,
    };
  }
  // Consent not legally required here: optional tools may run without a
  // banner, but an explicit refusal is always honoured.
  return {
    analytics: answers.analytics !== "denied",
    advertising: answers.advertising !== "denied",
    showBanner: false,
    ready: true,
  };
}

export type ConsentAction = "accept_all" | "reject_all" | "save_preferences" | "withdraw";

/** A save that turns any previously granted purpose into denied is a withdrawal. */
export function classifyAction(
  previous: ConsentAnswers,
  next: Record<ConsentPurpose, ConsentChoice>,
): ConsentAction {
  const withdrew =
    (previous.analytics === "granted" && next.analytics === "denied") ||
    (previous.advertising === "granted" && next.advertising === "denied");
  if (withdrew) return "withdraw";
  if (next.analytics === "granted" && next.advertising === "granted") return "accept_all";
  if (next.analytics === "denied" && next.advertising === "denied") return "reject_all";
  return "save_preferences";
}

export function serializeConsent(
  next: Record<ConsentPurpose, ConsentChoice>,
  now: Date,
  version: string = CONSENT_NOTICE_VERSION,
): { stored: string; legacy: "accepted" | "essential" } {
  const value: StoredConsent = { v: version, analytics: next.analytics, advertising: next.advertising, at: now.toISOString() };
  return {
    stored: JSON.stringify(value),
    legacy: next.analytics === "granted" && next.advertising === "granted" ? "accepted" : "essential",
  };
}
