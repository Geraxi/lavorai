"use client";

import Script from "next/script";
import { useEffect, useState } from "react";

const CONSENT_KEY = "lavorai-cookie-consent";

/**
 * Meta Pixel + Google Ads + GA4 loader.
 * Ognuno si attiva solo se l'ENV corrispondente è impostata → nessun
 * script inutile su dev locale o se il founder non ha ancora creato
 * l'ad account.
 *
 * ENV richieste (tutte NEXT_PUBLIC_ così arrivano al client):
 *   NEXT_PUBLIC_META_PIXEL_ID       — es. "1234567890"
 *   NEXT_PUBLIC_GOOGLE_ADS_ID       — es. "AW-1234567890"
 *   NEXT_PUBLIC_GA_MEASUREMENT_ID   — es. "G-XXXXXXXXXX" (opzionale, per GA4)
 *
 * Cookie consent: rispettato — carica solo dopo `analyticsConsent` accepted.
 * Il consent viene gestito dal <CookieBanner />. Prima del consenso, i pixel
 * non si caricano affatto (server-side gate + client re-check via storage).
 *
 * Eventi standard emessi (per creare audiences retargeting):
 *   - PageView (automatico su ogni pagina, Meta+GA+GAds)
 *   - trackConversion(name, value?) helper esportato per signup/checkout/purchase
 */
export function TrackingPixels() {
  const metaPixelId = process.env.NEXT_PUBLIC_META_PIXEL_ID;
  const gadsId = process.env.NEXT_PUBLIC_GOOGLE_ADS_ID;
  const gaId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
  const [consent, setConsent] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    // Legge la scelta cookie dal localStorage (impostata dal CookieBanner).
    // Se l'utente ha accettato → carichiamo. Se ha rifiutato o non ha
    // ancora scelto → niente pixel (rispetto GDPR strict).
    const v = window.localStorage.getItem(CONSENT_KEY);
    if (v === "accepted") setConsent(true);
    // Ascolta cambi: se l'utente accetta dopo, ricarica in memoria.
    const onStorage = (e: StorageEvent) => {
      if (e.key === CONSENT_KEY && e.newValue === "accepted") setConsent(true);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // Niente pixel senza consent OR senza ID configurato.
  if (!consent) return null;
  if (!metaPixelId && !gadsId && !gaId) return null;

  return (
    <>
      {/* ============ Meta Pixel (Facebook/Instagram Ads) ============ */}
      {metaPixelId && (
        <>
          <Script id="meta-pixel" strategy="afterInteractive">
            {`
              !function(f,b,e,v,n,t,s)
              {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
              n.callMethod.apply(n,arguments):n.queue.push(arguments)};
              if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
              n.queue=[];t=b.createElement(e);t.async=!0;
              t.src=v;s=b.getElementsByTagName(e)[0];
              s.parentNode.insertBefore(t,s)}(window, document,'script',
              'https://connect.facebook.net/en_US/fbevents.js');
              fbq('init', '${metaPixelId}');
              fbq('track', 'PageView');
            `}
          </Script>
          {/* noscript fallback */}
          <noscript>
            <img
              height="1"
              width="1"
              style={{ display: "none" }}
              src={`https://www.facebook.com/tr?id=${metaPixelId}&ev=PageView&noscript=1`}
              alt=""
            />
          </noscript>
        </>
      )}

      {/* ============ Google Ads Tag ============ */}
      {gadsId && (
        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${gadsId}`}
            strategy="afterInteractive"
          />
          <Script id="google-ads" strategy="afterInteractive">
            {`
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', '${gadsId}');
              ${gaId && gaId !== gadsId ? `gtag('config', '${gaId}');` : ""}
            `}
          </Script>
        </>
      )}

      {/* GA4 standalone (se non condivide gtag con GAds) */}
      {gaId && !gadsId && (
        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`}
            strategy="afterInteractive"
          />
          <Script id="ga4" strategy="afterInteractive">
            {`
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', '${gaId}');
            `}
          </Script>
        </>
      )}
    </>
  );
}

/**
 * Helper per tracciare conversioni chiave (signup / checkout / purchase).
 * Chiamalo dai bottoni/pagine di conversion. Emette event a Meta + Google
 * senza dover conoscere l'implementazione di ognuno.
 *
 * Esempi:
 *   trackConversion("Lead")         // signup started/completed
 *   trackConversion("InitiateCheckout", { value: 19.99, currency: "EUR" })
 *   trackConversion("Purchase", { value: 39.99, currency: "EUR" })
 */
export function trackConversion(
  eventName: "Lead" | "CompleteRegistration" | "InitiateCheckout" | "Purchase" | "Contact",
  params?: { value?: number; currency?: string; content_name?: string },
) {
  if (typeof window === "undefined") return;
  try {
    // Meta Pixel
    const fbq = (window as unknown as { fbq?: (...a: unknown[]) => void }).fbq;
    if (typeof fbq === "function") {
      fbq("track", eventName, params ?? {});
    }
    // Google (Ads + GA4 via gtag)
    const gtag = (window as unknown as { gtag?: (...a: unknown[]) => void }).gtag;
    if (typeof gtag === "function") {
      const gtagEvent =
        eventName === "Lead"
          ? "generate_lead"
          : eventName === "CompleteRegistration"
            ? "sign_up"
            : eventName === "InitiateCheckout"
              ? "begin_checkout"
              : eventName === "Purchase"
                ? "purchase"
                : "contact";
      gtag("event", gtagEvent, {
        value: params?.value,
        currency: params?.currency ?? "EUR",
        content_name: params?.content_name,
      });
    }
  } catch (err) {
    console.warn("[tracking-pixels] emit failed", err);
  }
}
