import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Ottimizza il tuo CV con AI · Gratis",
  description:
    "Carica il tuo CV. Claude lo riscrive sull'annuncio, lo allinea ai keyword ATS, te lo manda via email. 3 audit gratuiti, niente registrazione.",
  alternates: { canonical: "/optimize" },
};

export default function OptimizeLayout({ children }: { children: React.ReactNode }) {
  return children;
}
