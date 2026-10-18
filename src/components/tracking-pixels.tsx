"use client";

import { useEffect, useRef } from "react";
import { useConsent } from "@/components/consent/use-consent";
import { hasConsent } from "@/lib/consent/client-store";
import { isMetaPixelLoaded, loadMetaPixel, revokeMetaPixel, type PixelDocument, type PixelWindow } from "@/lib/consent/meta-pixel";

/**
 * Meta Pixel + Google Ads + GA4 loader, gated per purpose:
 *   - GA4 (NEXT_PUBLIC_GA_MEASUREMENT_ID)  → "analytics" consent
 *   - Meta Pixel (NEXT_PUBLIC_META_PIXEL_ID), Google Ads (NEXT_PUBLIC_GOOGLE_ADS_ID)
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
  const gadsId = process.env.NEXT_PUBLIC_GOOGLE_ADS_ID?.trim();
  const gaId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim();
  const { effective } = useConsent();
  const prev = useRef({ analytics: false, advertising: false });

  useEffect(() => {
    if (!effective.ready) return;
    const win = window as unknown as PixelWindow & GtagWindow;
    const doc = document as unknown as PixelDocument;
    const was = prev.current;

    // ── Meta Pixel (advertising) ──
    if (metaPixelId) {
      if (effective.advertising) loadMetaPixel(win, doc, metaPixelId);
      else if (was.advertising || isMetaPixelLoaded(win)) revokeMetaPixel(win, doc);
    }

    // ── Google (GA4 = analytics, Ads = advertising) ──
    const wantGa = Boolean(gaId && effective.analytics);
    const wantAds = Boolean(gadsId && effective.advertising);
    if (wantGa || wantAds) ensureGtag(win, doc, (wantAds ? gadsId : gaId)!);
    if (win.gtag) {
      win.gtag("consent", "update", {
        analytics_storage: effective.analytics ? "granted" : "denied",
        ad_storage: effective.advertising ? "granted" : "denied",
        ad_user_data: effective.advertising ? "granted" : "denied",
        ad_personalization: effective.advertising ? "granted" : "denied",
      });
      if (gaId) setGtagId(win, gaId, wantGa);
      if (gadsId) setGtagId(win, gadsId, wantAds);
    }

    prev.current = { analytics: effective.analytics, advertising: effective.advertising };
  }, [effective.ready, effective.analytics, effective.advertising, metaPixelId, gadsId, gaId]);

  return null;
}

interface GtagWindow {
  dataLayer?: unknown[];
  gtag?: (...args: unknown[]) => void;
  __lavoraiGtagLoaded?: boolean;
  __lavoraiGtagConfigured?: Record<string, boolean>;
  [disableFlag: `ga-disable-${string}`]: boolean | undefined;
}

function ensureGtag(win: GtagWindow, doc: PixelDocument, firstId: string) {
  if (win.__lavoraiGtagLoaded) return;
  win.__lavoraiGtagLoaded = true;
  win.dataLayer = win.dataLayer || [];
  // gtag must push the Arguments object, not an array.
  win.gtag = function gtag() {
    // eslint-disable-next-line prefer-rest-params
    win.dataLayer!.push(arguments);
  };
  win.gtag("consent", "default", {
    analytics_storage: "denied",
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
  });
  win.gtag("js", new Date());
  const s = doc.createElement("script");
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(firstId)}`;
  doc.head?.appendChild(s);
}

function setGtagId(win: GtagWindow, id: string, enabled: boolean) {
  win[`ga-disable-${id}`] = !enabled;
  if (!enabled) return;
  win.__lavoraiGtagConfigured = win.__lavoraiGtagConfigured || {};
  if (win.__lavoraiGtagConfigured[id]) return;
  win.__lavoraiGtagConfigured[id] = true;
  win.gtag?.("config", id);
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
    const win = window as unknown as PixelWindow & GtagWindow;
    if (hasConsent("advertising") && isMetaPixelLoaded(win) && typeof win.fbq === "function") {
      win.fbq("track", eventName, params ?? {});
    }
    if ((hasConsent("advertising") || hasConsent("analytics")) && typeof win.gtag === "function") {
      const gtagEvent =
        eventName === "Lead" ? "generate_lead"
          : eventName === "InitiateCheckout" ? "begin_checkout"
            : eventName === "Purchase" ? "purchase"
              : "contact";
      win.gtag("event", gtagEvent, {
        value: params?.value,
        currency: params?.currency ?? "EUR",
        content_name: params?.content_name,
      });
    }
  } catch (err) {
    console.warn("[tracking-pixels] emit failed", err);
  }
}
