"use client";
import posthog from "posthog-js";
import { CONSENT_COOKIE, CONSENT_EVENT, CONSENT_KEY, safeProperties, type FunnelEvent, type FunnelProperties } from "./shared";

let initialized = false;
export function hasAnalyticsConsent(): boolean {
  try { return typeof window !== "undefined" && localStorage.getItem(CONSENT_KEY) === "accepted"; }
  catch { return false; }
}

export function syncPostHogConsent(): boolean {
  if (typeof window === "undefined" || !process.env.NEXT_PUBLIC_POSTHOG_KEY) return false;
  const accepted = hasAnalyticsConsent();
  document.cookie = `${CONSENT_COOKIE}=${accepted ? "accepted" : "essential"}; Path=/; SameSite=Lax; Max-Age=31536000${location.protocol === "https:" ? "; Secure" : ""}`;
  if (!accepted) {
    if (initialized) { posthog.stopSessionRecording(); posthog.opt_out_capturing(); posthog.reset(); }
    return false;
  }
  if (!initialized) {
    posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY, {
      api_host: "/ingest",
      ui_host: "https://eu.posthog.com",
      persistence: "localStorage+cookie",
      autocapture: false,
      capture_pageview: false,
      capture_pageleave: false,
      capture_exceptions: false,
      disable_session_recording: false,
      session_recording: {
        maskAllInputs: true,
        maskTextSelector: "[data-ph-mask], .ph-mask, .ph-no-capture",
        blockSelector: ".ph-no-capture",
      },
      // Strip URLs (which may contain tokens/search text) and referrer metadata.
      before_send: (event) => {
        if (!hasAnalyticsConsent()) return null;
        if (event?.properties) {
          const strip = (properties: Record<string, unknown>) => {
            for (const key of Object.keys(properties)) {
              if (/url|pathname|referrer|referring|search|email|user_agent/i.test(key)) delete properties[key];
              else if ((key === "$set" || key === "$set_once") && properties[key] && typeof properties[key] === "object") {
                strip(properties[key] as Record<string, unknown>);
              }
            }
          };
          strip(event.properties);
        }
        return event;
      },
    });
    initialized = true;
  }
  posthog.opt_in_capturing({ captureEventName: false });
  posthog.startSessionRecording();
  return true;
}

export function captureFunnel(event: FunnelEvent, properties?: FunnelProperties): void {
  try { if (syncPostHogConsent()) posthog.capture(event, safeProperties(properties)); } catch { /* best effort */ }
}
export function identifyAnalyticsUser(id: string, plan: string): void {
  try { if (syncPostHogConsent()) posthog.identify(id, safeProperties({ plan })); } catch { /* best effort */ }
}
export function resetAnalyticsUser(onlyIdentified = false): void {
  try { if (initialized && (!onlyIdentified || posthog.get_property("$user_id"))) posthog.reset(); } catch { /* best effort */ }
}
export function captureClientException(error: unknown): void {
  try {
    if (syncPostHogConsent()) {
      // Error messages/stacks may contain CV text, addresses or API payloads.
      const safe = new Error("Unexpected application error");
      safe.name = "ApplicationError";
      safe.stack = undefined;
      posthog.captureException(safe);
    }
  } catch { /* best effort */ }
}
export { CONSENT_EVENT, CONSENT_KEY };
