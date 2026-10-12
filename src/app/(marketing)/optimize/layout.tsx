import { getResolvedPublicCardTrialCopy } from "@/lib/card-trial-copy-server";
import type { Metadata } from "next";

export async function generateMetadata(): Promise<Metadata> {
  const offer = await getResolvedPublicCardTrialCopy();
  return {
  title: offer.active ? "Ottimizza il tuo CV con AI · Anteprima limitata" : "Ottimizza il tuo CV con AI · Gratis",
  description:
    (offer.active ? offer.disclosure : "Carica il tuo CV. OpenAI lo riscrive sull'annuncio, lo allinea ai keyword ATS, te lo manda via email. 3 audit gratuiti, niente registrazione."),
  alternates: { canonical: "/optimize" },
  };
}

export default function OptimizeLayout({ children }: { children: React.ReactNode }) {
  return children;
}
