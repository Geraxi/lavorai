import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/components/site-footer";
import { SiteNav } from "@/components/site-nav";
import { GUIDES, readingMinutes } from "@/content/guide";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://lavorai.it";

export const metadata: Metadata = {
  title: "Guide: CV, candidature e colloquio",
  description:
    "Guide pratiche in italiano per trovare lavoro: CV ATS friendly, lettera di presentazione, candidatura spontanea, LinkedIn, domande del colloquio, software di auto-apply.",
  alternates: { canonical: "/guide" },
  openGraph: {
    title: "Guide LavorAI: CV, candidature e colloquio",
    description: "Guide pratiche per trovare lavoro, scritte da chi automatizza le candidature ogni giorno.",
    url: "/guide",
  },
};

const CATEGORIES = ["CV", "Candidature", "Colloquio", "Strumenti"] as const;

export default function GuideIndexPage() {
  const collection = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "Guide LavorAI",
    url: `${SITE_URL}/guide`,
    inLanguage: "it-IT",
    hasPart: GUIDES.map((g) => ({ "@type": "Article", headline: g.title, url: `${SITE_URL}/guide/${g.slug}` })),
  };
  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "Guide", item: `${SITE_URL}/guide` },
    ],
  };

  return (
    <div className="flex min-h-screen flex-col">
      <SiteNav />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(collection) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }} />
      <main className="gd-main flex-1">
        <header className="gd-wrap gd-head">
          <p className="gd-eyebrow">Guide</p>
          <h1>Trovare lavoro, senza perdere le serate</h1>
          <p className="gd-lead">
            Guide pratiche su CV, candidature e colloqui, scritte da chi automatizza le candidature ogni giorno.
            Niente teoria: struttura, esempi da copiare, numeri reali.
          </p>
        </header>

        {CATEGORIES.map((cat) => {
          const items = GUIDES.filter((g) => g.category === cat);
          if (items.length === 0) return null;
          return (
            <section key={cat} className="gd-wrap gd-cat">
              <h2>{cat}</h2>
              <div className="gd-grid">
                {items.map((g) => (
                  <Link key={g.slug} href={`/guide/${g.slug}`} className="gd-card">
                    <span className="gd-card-meta">{readingMinutes(g)} min di lettura</span>
                    <span className="gd-card-title">{g.title}</span>
                    <span className="gd-card-desc">{g.description}</span>
                  </Link>
                ))}
              </div>
            </section>
          );
        })}

        <section className="gd-wrap">
          <div className="gd-cta">
            <div>
              <strong>Vuoi che le candidature le faccia LavorAI?</strong>
              <p>CV riscritto per ogni annuncio, form compilati su Greenhouse, Lever, Ashby e Workable, prova di consegna. 3 candidature gratis.</p>
            </div>
            <Link href="/signup" className="ds-btn">Prova gratis</Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
