import type { Metadata } from "next";
import { LandingHomepage } from "@/components/landing/landing-homepage";

const description = "Il tuo prossimo passo parte da qui. Analizza il CV, adattalo alle offerte e controlla ogni candidatura con LavorAI. Pro da €19.99 al mese.";

export const metadata: Metadata = {
  title: { absolute: "LavorAI — Il tuo prossimo passo" },
  description,
  alternates: { canonical: "/" },
  openGraph: { title: "LavorAI — Il tuo prossimo passo", description, url: "/" },
  twitter: { title: "LavorAI — Il tuo prossimo passo", description },
};

export default function Home() {
  return <LandingHomepage />;
}
