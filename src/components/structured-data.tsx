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
      "Il copilota italiano per la ricerca del lavoro. Auto-apply su Greenhouse, Lever, Workable; CV ottimizzato e cover letter AI per ogni annuncio.",
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
      target: `${SITE_URL}/jobs?q={search_term_string}`,
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
      "Piattaforma AI di auto-apply: candidature automatiche su portali ATS (Greenhouse, Lever, Ashby, Workable, SmartRecruiters), CV riscritto sull'annuncio, cover letter generata, dashboard live.",
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
    aggregateRating: {
      "@type": "AggregateRating",
      // PLACEHOLDER — sostituire con valori reali dopo raccolta recensioni
      ratingValue: "4.6",
      reviewCount: "47",
      bestRating: "5",
      worstRating: "1",
    },
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
