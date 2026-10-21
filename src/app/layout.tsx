import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { Toaster } from "@/components/ui/sonner";
import { CookieBanner } from "@/components/cookie-banner";
import { Providers } from "@/app/providers";
import { StructuredData } from "@/components/structured-data";
import { TrackPageView } from "@/components/track-page-view";
import { TrackReferral } from "@/components/track-referral";
import { TrackAttribution } from "@/components/track-attribution";
import { GOOGLE_CONSENT_DEFAULT } from "@/lib/consent/google-tag";
import { TrackingPixels } from "@/components/tracking-pixels";
import { RegistrationConversion } from "@/components/registration-conversion";
import { Analytics } from "@vercel/analytics/next";
import { assertEnvOrCrash } from "@/lib/env";
import "./globals.css";

// Fail-fast al PRIMO runtime request in prod se mancano env vars critiche.
// Skippato durante `next build` (phase-production-build) — altrimenti il build
// fallisce su Vercel dove le env vars non sono ancora completamente iniettate
// durante il page-data collection.
if (
  process.env.NEXT_PHASE !== "phase-production-build" &&
  process.env.VERCEL_ENV === "production"
) {
  assertEnvOrCrash();
}

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://lavorai.it";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  // URL stabile (public/, senza hash per deploy): Chrome tiene in cache la
  // favicon per URL, e con l'hash che cambia a ogni deploy la tab restava
  // vuota finché non ricaricava. Il file generato /icon resta come fallback.
  icons: {
    icon: [
      { url: "/icon-192.png", type: "image/png", sizes: "192x192" },
      { url: "/favicon.ico", sizes: "32x32" },
    ],
    shortcut: "/favicon.ico",
    apple: "/icon-192.png",
  },
  // Google Search Console: NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION su Vercel.
  verification: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION ? { google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION } : undefined,
  title: {
    // Title ottimizzato per keyword ad ALTA INTENT commerciale (chi cerca
    // ATTIVAMENTE un tool di auto-apply) invece del generico "ricerca lavoro"
    // (mismatch di intento — attrae anche career advice searcher che rimbalzano).
    default:
      "LavorAI — Candidature su misura, sotto il tuo controllo",
    template: "%s · LavorAI",
  },
  description:
    "LavorAI trova offerte adatte al tuo profilo, prepara CV e lettera su misura per ognuna e traccia ogni candidatura. Tu decidi quando inviare; l'invio automatico è un'opzione che attivi tu.",
  keywords: [
    // KEYWORD AD ALTA INTENT COMMERCIALE (chi cerca soluzione, non info)
    "auto candidatura lavoro",
    "candidarsi automaticamente ai lavori",
    "auto apply lavoro",
    "inviare CV automaticamente",
    "software candidature automatiche",
    "auto apply italiano",
    "candidature automatiche AI",
    // KEYWORD DI MERCATO (product category)
    "auto-apply",
    "CV ATS-friendly",
    "cover letter AI italiano",
    "curriculum ottimizzato ATS",
  ],
  authors: [{ name: "LavorAI" }],
  creator: "LavorAI",
  openGraph: {
    type: "website",
    locale: "it_IT",
    url: siteUrl,
    siteName: "LavorAI",
    title: "LavorAI — Candidature su misura, sotto il tuo controllo",
    description:
      "Offerte pertinenti, CV e lettera su misura per ognuna, ogni candidatura tracciata. Tu decidi quando inviare.",
  },
  twitter: {
    card: "summary_large_image",
    title: "LavorAI — Candidature su misura, sotto il tuo controllo",
    description:
      "Offerte pertinenti, CV e lettera su misura per ognuna, ogni candidatura tracciata. Tu decidi quando inviare.",
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#0a0b0b",
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const messages = await getMessages();
  return (
    <html
      lang={locale}
      className={`${inter.variable} ${jetbrains.variable}`}
      suppressHydrationWarning
    >
      <head><script dangerouslySetInnerHTML={{ __html: GOOGLE_CONSENT_DEFAULT }} /></head>
      <body className="min-h-screen antialiased">
        {/* JSON-LD structured data: Organization + WebSite +
            SoftwareApplication. Renderizzato server-side per essere
            visibile ai crawler senza richiedere JS. */}
        <StructuredData />
        <NextIntlClientProvider locale={locale} messages={messages}>
          <Providers>
            {children}
            {/* Meta + Google signup one-shot; needs SessionProvider. */}
            <RegistrationConversion />
          </Providers>
          <TrackPageView />
          <TrackReferral />
          <TrackAttribution />
          <Toaster richColors position="top-center" />
          <CookieBanner />
          {/* Meta Pixel + Google Ads + GA4 — consenso esplicito per finalità.
              Meta/GA configurabili tramite ENV; Ads usa il tag LavorAI. */}
          <TrackingPixels />
          <Analytics />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
