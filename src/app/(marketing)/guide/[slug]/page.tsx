import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteFooter } from "@/components/site-footer";
import { SiteNav } from "@/components/site-nav";
import { GUIDES, getGuide, readingMinutes } from "@/content/guide";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://lavorai.it";

type Params = { slug: string };

export function generateStaticParams(): Params[] {
  return GUIDES.map((g) => ({ slug: g.slug }));
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  const g = getGuide(slug);
  if (!g) return {};
  return {
    title: g.metaTitle,
    description: g.description,
    keywords: g.keywords,
    alternates: { canonical: `/guide/${g.slug}` },
    openGraph: {
      type: "article",
      title: g.title,
      description: g.description,
      url: `/guide/${g.slug}`,
      publishedTime: g.published,
      modifiedTime: g.updated,
      authors: ["LavorAI"],
    },
    twitter: { card: "summary_large_image", title: g.title, description: g.description },
  };
}

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" });

export default async function GuidePage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const g = getGuide(slug);
  if (!g) notFound();

  const url = `${SITE_URL}/guide/${g.slug}`;
  const article = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: g.title,
    description: g.description,
    inLanguage: "it-IT",
    datePublished: g.published,
    dateModified: g.updated,
    author: { "@type": "Organization", name: "LavorAI", url: SITE_URL },
    publisher: { "@type": "Organization", name: "LavorAI", url: SITE_URL, logo: { "@type": "ImageObject", url: `${SITE_URL}/opengraph-image` } },
    mainEntityOfPage: url,
    image: `${SITE_URL}/opengraph-image`,
    keywords: g.keywords.join(", "),
  };
  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "Guide", item: `${SITE_URL}/guide` },
      { "@type": "ListItem", position: 3, name: g.title, item: url },
    ],
  };
  const faq = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: g.faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
  };
  const related = g.related.map(getGuide).filter((x): x is NonNullable<typeof x> => !!x);

  return (
    <div className="flex min-h-screen flex-col">
      <SiteNav />
      {[article, breadcrumb, faq].map((s, i) => (
        <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(s) }} />
      ))}
      <main className="gd-main flex-1">
        <article className="gd-wrap gd-article">
          <nav aria-label="breadcrumb" className="gd-crumbs">
            <Link href="/">Home</Link><span>/</span><Link href="/guide">Guide</Link><span>/</span><span>{g.category}</span>
          </nav>
          <h1>{g.title}</h1>
          <p className="gd-meta">
            Aggiornato il {fmtDate(g.updated)} · {readingMinutes(g)} min di lettura · di LavorAI
          </p>
          {g.intro.map((p, i) => <p key={i} className="gd-lead">{p}</p>)}

          {g.sections.map((s) => (
            <section key={s.h2}>
              <h2>{s.h2}</h2>
              {s.paragraphs?.map((p, i) => <p key={i}>{p}</p>)}
              {s.list && <ul>{s.list.map((li, i) => <li key={i}>{li}</li>)}</ul>}
              {s.example && (
                <figure className="gd-example">
                  <figcaption>{s.example.title}</figcaption>
                  <pre>{s.example.body}</pre>
                </figure>
              )}
            </section>
          ))}

          <aside className="gd-cta">
            <div>
              <strong>{g.cta.title}</strong>
              <p>{g.cta.body}</p>
            </div>
            <Link href={g.cta.href} className="ds-btn">{g.cta.label}</Link>
          </aside>

          <section>
            <h2>Domande frequenti</h2>
            {g.faq.map((f) => (
              <details key={f.q} className="gd-faq">
                <summary>{f.q}</summary>
                <p>{f.a}</p>
              </details>
            ))}
          </section>

          {related.length > 0 && (
            <section>
              <h2>Guide correlate</h2>
              <div className="gd-grid">
                {related.map((r) => (
                  <Link key={r.slug} href={`/guide/${r.slug}`} className="gd-card">
                    <span className="gd-card-meta">{r.category} · {readingMinutes(r)} min</span>
                    <span className="gd-card-title">{r.title}</span>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </article>
      </main>
      <SiteFooter />
    </div>
  );
}
