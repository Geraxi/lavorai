import type { Metadata } from "next";
import { LandingHomepage } from "@/components/landing/landing-homepage";

const description = "LavorAI trova offerte adatte al tuo profilo, prepara CV e lettera su misura per ognuna e traccia ogni candidatura. Tu decidi quando inviare. Pro da €19,99 al mese.";

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
