import type { Metadata } from "next";
import { PlaceholderPage } from "@/components/placeholder-page";

export const metadata: Metadata = {
  title: "Contatti",
  description: "Contatta il team di LavorAI.",
  alternates: { canonical: "/contatti" },
};

export default function ContattiPage() {
  return (
    <PlaceholderPage
      title="Contatti"
      description="Pagina in aggiornamento. Per ora scrivici a hello@lavorai.it."
    />
  );
}
