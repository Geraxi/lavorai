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
import { TrackingPixels } from "@/components/tracking-pixels";
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
      "LavorAI — Candidature automatiche ai lavori | Auto-apply CV in italiano",
    template: "%s · LavorAI",
  },
  description:
    "Invia CV in automatico a 50 lavori al mese. LavorAI adatta CV e lettera a ogni annuncio e compila i form ATS. La prova Pro di 7 giorni parte dalla registrazione, fino a 5 candidature al giorno, senza carta e senza rinnovo automatico.",
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
    title: "LavorAI — Candidature automatiche ai lavori | Auto-apply CV",
    description:
      "50 candidature al mese, con CV e lettera su misura. Prova Pro per 7 giorni dalla registrazione, senza carta e senza rinnovo automatico.",
  },
  twitter: {
    card: "summary_large_image",
    title: "LavorAI — Candidature automatiche ai lavori",
    description:
      "50 candidature/mese automatiche. CV e lettera su misura. Prova di 7 giorni dalla registrazione, fino a 5 candidature al giorno, senza carta.",
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#FAFAF7",
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
      <body className="min-h-screen antialiased">
        {/* JSON-LD structured data: Organization + WebSite +
            SoftwareApplication. Renderizzato server-side per essere
            visibile ai crawler senza richiedere JS. */}
        <StructuredData />
        <NextIntlClientProvider locale={locale} messages={messages}>
          <Providers>{children}</Providers>
          <TrackPageView />
          <TrackReferral />
          <TrackAttribution />
          <Toaster richColors position="top-center" />
          <CookieBanner />
          {/* Meta Pixel + Google Ads + GA4 — solo se ENV NEXT_PUBLIC_*
              impostate + consent GDPR accettato. Vedi tracking-pixels.tsx. */}
          <TrackingPixels />
          <Analytics />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
