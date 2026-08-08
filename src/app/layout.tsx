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
import { TrackingPixels } from "@/components/tracking-pixels";
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

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    // Title ottimizzato per keyword ad ALTA INTENT commerciale (chi cerca
    // ATTIVAMENTE un tool di auto-apply) invece del generico "ricerca lavoro"
    // (mismatch di intento — attrae anche career advice searcher che rimbalzano).
    default:
      "LavorAI — Candidature automatiche ai lavori | Auto-apply CV in italiano",
    template: "%s · LavorAI",
  },
  description:
    "Invia CV in automatico a 50 lavori al mese. LavorAI riscrive il CV per ogni annuncio, compila i form al posto tuo su Greenhouse, Lever, LinkedIn. 3 candidature gratis, no carta. Da €19.99/mese.",
  keywords: [
    // KEYWORD AD ALTA INTENT COMMERCIALE (chi cerca soluzione, non info)
    "auto candidatura lavoro",
    "candidarsi automaticamente ai lavori",
    "auto apply lavoro",
    "inviare CV automaticamente",
    "software candidature automatiche",
    "auto apply italiano",
    "bot candidature LinkedIn",
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
      "Invia CV in automatico a 50 lavori al mese. LavorAI riscrive il CV per ogni annuncio e invia le candidature al posto tuo. 3 gratis, no carta.",
  },
  twitter: {
    card: "summary_large_image",
    title: "LavorAI — Candidature automatiche ai lavori",
    description:
      "50 candidature/mese automatiche. CV riscritto per ogni annuncio. 3 gratis.",
  },
  robots: { index: true, follow: true },
  icons: { icon: "/favicon.ico" },
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
          <Toaster richColors position="top-center" />
          <CookieBanner />
          {/* Meta Pixel + Google Ads + GA4 — solo se ENV NEXT_PUBLIC_*
              impostate + consent GDPR accettato. Vedi tracking-pixels.tsx. */}
          <TrackingPixels />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
