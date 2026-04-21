import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { CookieBanner } from "@/components/cookie-banner";
import { Providers } from "@/app/providers";
import { assertEnvOrCrash } from "@/lib/env";
import "./globals.css";

// Fail-fast all'avvio se mancano env vars critiche in prod.
// Ignorato durante build (NODE_ENV=production ma env non ancora wired).
if (process.env.VERCEL_ENV === "production" || (process.env.NODE_ENV === "production" && process.env.RENDER_ENV === "runtime")) {
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
    default: "LavorAI — Il copilota italiano per la ricerca del lavoro",
    template: "%s · LavorAI",
  },
  description:
    "Candidati in automatico su LinkedIn, InfoJobs, Indeed e Subito. CV ATS-friendly e lettera motivazionale AI, in italiano nativo. Da €19.99/mese.",
  keywords: [
    "CV ottimizzato",
    "ATS",
    "ricerca lavoro",
    "auto-apply",
    "lettera motivazionale",
    "LinkedIn",
    "InfoJobs",
    "AI lavoro",
    "curriculum italiano",
  ],
  authors: [{ name: "LavorAI" }],
  creator: "LavorAI",
  openGraph: {
    type: "website",
    locale: "it_IT",
    url: siteUrl,
    siteName: "LavorAI",
    title: "LavorAI — Il copilota italiano per la ricerca del lavoro",
    description:
      "Carica il CV, imposta le preferenze, LavorAI si candida in automatico per te sui portali italiani e internazionali.",
  },
  twitter: {
    card: "summary_large_image",
    title: "LavorAI — Il copilota italiano per la ricerca del lavoro",
    description:
      "Carica il CV, imposta le preferenze, LavorAI si candida in automatico per te.",
  },
  robots: { index: true, follow: true },
  icons: { icon: "/favicon.ico" },
};

export const viewport: Viewport = {
  themeColor: "#FAFAF7",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="it"
      className={`${inter.variable} ${jetbrains.variable}`}
      suppressHydrationWarning
    >
      <body className="min-h-screen antialiased">
        <Providers>{children}</Providers>
        <Toaster richColors position="top-center" />
        <CookieBanner />
      </body>
    </html>
  );
}
