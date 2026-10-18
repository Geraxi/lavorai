import { TIER_LIST } from "@/lib/billing";

/**
 * JSON-LD structured data injection.
 *
 * Tre schemi pensati per Google rich results + Bing + LinkedIn previews:
 *   - Organization: chi è LavorAI (nome, logo, contatti, social)
 *   - WebSite: dominio + search action
 *   - SoftwareApplication: il prodotto LavorAI con offers (free/pro/pro_plus)
 *
 * Renderizzato nel root layout così appare su tutte le pagine. Per
 * pagine specifiche (es. FAQ homepage, pricing) si possono aggiungere
 * schemi extra inline.
 *
 * Validatore: https://search.google.com/test/rich-results
 */

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://lavorai.it";

export function StructuredData() {
  const organization = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "LavorAI",
    legalName: "LavorAI",
    url: SITE_URL,
    logo: `${SITE_URL}/Lavoraiherosection.png`,
    description:
      "LavorAI trova offerte pertinenti, prepara CV e lettera su misura per ognuna e traccia ogni candidatura. L'utente decide quando inviare.",
    foundingDate: "2025",
    sameAs: [
      // Aggiungere quando attivi: LinkedIn, X, Instagram, ecc.
    ],
    contactPoint: {
      "@type": "ContactPoint",
      contactType: "customer support",
      email: "support@lavorai.it",
      availableLanguage: ["Italian", "English"],
    },
  };

  const website = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "LavorAI",
    url: SITE_URL,
    inLanguage: "it-IT",
    potentialAction: {
      "@type": "SearchAction",
      // La ricerca pubblica vive su /lavoro. /jobs è la job board
      // autenticata: indicarla qui portava crawler e risultati Google a
      // una pagina non accessibile ai visitatori anonimi.
      target: `${SITE_URL}/lavoro?q={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  };

  // Offers derivate da billing.ts (single source of truth dei tier).
  // Free tier escluso da AggregateOffer (Google preferisce solo paid).
  const paidTiers = TIER_LIST.filter((t) => t.price > 0);
  const softwareApp = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "LavorAI",
    operatingSystem: "Web",
    applicationCategory: "BusinessApplication",
    description:
      "Piattaforma AI per candidature di lavoro: trova offerte pertinenti, prepara CV e lettera su misura per ogni annuncio e traccia lo stato di ogni candidatura sui portali ATS supportati (Greenhouse, Lever, Ashby, Workable). L'utente approva ogni invio; l'invio automatico è opzionale.",
    url: SITE_URL,
    offers: paidTiers.map((t) => ({
      "@type": "Offer",
      name: t.name,
      price: t.price.toFixed(2),
      priceCurrency: "EUR",
      priceSpecification: {
        "@type": "UnitPriceSpecification",
        price: t.price.toFixed(2),
        priceCurrency: "EUR",
        unitText: "MONTH",
        billingDuration: "P1M",
      },
      category: "subscription",
      availability: "https://schema.org/InStock",
      url: `${SITE_URL}/pricing`,
    })),
    // Niente aggregateRating finché non ci sono recensioni reali raccolte
    // sul sito: un rating inventato viola le linee guida Google e può
    // costare un'azione manuale sui rich result.
  };

  const schemas = [organization, website, softwareApp];

  return (
    <>
      {schemas.map((schema, i) => (
        <script
          key={i}
          type="application/ld+json"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
        />
      ))}
    </>
  );
}
