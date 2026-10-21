"use client";

import { useEffect, useRef } from "react";
import { useConsent } from "@/components/consent/use-consent";
import { hasConsent } from "@/lib/consent/client-store";
import { isMetaPixelLoaded, loadMetaPixel, revokeMetaPixel, type PixelDocument, type PixelWindow } from "@/lib/consent/meta-pixel";

import { syncGoogleConsent, type GoogleWindow } from "@/lib/consent/google-tag";

/**
 * Meta Pixel + Google Ads + GA4 loader, gated per purpose:
 *   - GA4 (NEXT_PUBLIC_GA_MEASUREMENT_ID)  → "analytics" consent
 *   - Meta Pixel (NEXT_PUBLIC_META_PIXEL_ID), Google Ads (AW-18528829051)
 *                                           → "advertising" consent
 *
 * Nothing loads until the region is resolved and the purpose is effective
 * (see src/lib/consent/state.ts). Withdrawal applies immediately in every
 * open tab: Meta gets fbq('consent','revoke') and its cookies are expired;
 * Google gets a consent update to denied and the per-id disable flag.
 *
 * The Meta Pixel is loaded at most once per page with one PageView, automatic
 * advanced matching disabled and no user data in init. There is no Google Tag
 * Manager / second pixel in the codebase.
 */
export function TrackingPixels() {
  const metaPixelId = process.env.NEXT_PUBLIC_META_PIXEL_ID?.trim();
  const gaId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim();
  const { effective } = useConsent();
  const prev = useRef({ analytics: false, advertising: false });

  useEffect(() => {
    if (!effective.ready) return;
    const win = window as unknown as PixelWindow & GoogleWindow;
    const doc = document as unknown as PixelDocument;
    const was = prev.current;
    const advertising = hasConsent("advertising");
    const analytics = hasConsent("analytics");

    // ── Meta Pixel (advertising) ──
    if (metaPixelId) {
      if (advertising) loadMetaPixel(win, doc, metaPixelId);
      else if (was.advertising || isMetaPixelLoaded(win)) revokeMetaPixel(win, doc);
    }

    syncGoogleConsent(win, doc, analytics, advertising, gaId);

    prev.current = { analytics, advertising };
  }, [effective.ready, effective.analytics, effective.advertising, metaPixelId, gaId]);

  return null;
}

/**
 * Helper for non-registration conversions (e.g. InitiateCheckout). Re-checks
 * consent before every call. CompleteRegistration is intentionally NOT here:
 * it is sent only through the one-shot server-issued event ID
 * (src/components/registration-conversion.tsx).
 */
export function trackConversion(
  eventName: "Lead" | "InitiateCheckout" | "Purchase" | "Contact",
  params?: { value?: number; currency?: string; content_name?: string },
) {
  if (typeof window === "undefined") return;
  try {
    const win = window as unknown as PixelWindow & GoogleWindow;
    if (hasConsent("advertising") && isMetaPixelLoaded(win) && typeof win.fbq === "function") {
      win.fbq("track", eventName, params ?? {});
    }
    const gaId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim();
    if (gaId && hasConsent("analytics") && typeof win.gtag === "function") {
      const gtagEvent =
        eventName === "Lead" ? "generate_lead"
          : eventName === "InitiateCheckout" ? "begin_checkout"
            : eventName === "Purchase" ? "purchase"
              : "contact";
      win.gtag("event", gtagEvent, {
        send_to: gaId,
        value: params?.value,
        currency: params?.currency ?? "EUR",
        content_name: params?.content_name,
      });
    }
  } catch (err) {
    console.warn("[tracking-pixels] emit failed", err);
  }
}
