import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/components/site-footer";
import { SiteNav } from "@/components/site-nav";
import { CompanyLogo } from "@/components/design/company-logo";
import { prisma } from "@/lib/db";

/**
 * Landing SEO "lavoro categorie protette" (L. 68/99, art. 1 e art. 18).
 * Query ad alta intent con pochissima concorrenza sull'automazione.
 * Mostra offerte riservate reali dal pool + FAQ (JSON-LD) + CTA.
 */

export const revalidate = 1800;

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://lavorai.it";

export const metadata: Metadata = {
  title: "Lavoro categorie protette: offerte L. 68/99 e candidatura automatica",
  description:
    "Offerte di lavoro riservate alle categorie protette (art. 1 e art. 18 L. 68/99) aggiornate ogni giorno. LavorAI trova gli annunci con quota riservata e si candida per te.",
  keywords: ["lavoro categorie protette", "categorie protette offerte di lavoro", "legge 68/99 lavoro", "art. 1 legge 68", "collocamento mirato", "invalidità civile lavoro", "assunzioni categorie protette"],
  alternates: { canonical: "/categorie-protette" },
  openGraph: { type: "website", title: "Lavoro categorie protette: offerte L. 68/99", description: "Offerte riservate aggiornate ogni giorno e candidatura automatica con LavorAI.", url: "/categorie-protette" },
};

const FAQ = [
  {
    q: "Chi rientra nelle categorie protette?",
    a: "L'art. 1 della Legge 68/99 include persone con invalidità civile superiore al 45%, invalidi del lavoro con invalidità superiore al 33%, non vedenti, sordi, invalidi di guerra e di servizio. L'art. 18 include orfani e coniugi superstiti di caduti sul lavoro, profughi e vittime del terrorismo e della criminalità organizzata.",
  },
  {
    q: "Le aziende sono obbligate ad assumere categorie protette?",
    a: "Sì. Le aziende con 15-35 dipendenti devono assumere 1 lavoratore appartenente alle categorie protette, quelle con 36-50 dipendenti 2, e oltre i 50 dipendenti il 7% dell'organico. Per questo molte offerte riportano esplicitamente 'riservato alle categorie protette' o 'L. 68/99'.",
  },
  {
    q: "Come si trovano le offerte riservate?",
    a: "Le aziende pubblicano gli annunci sui propri portali di recruiting e sui job board indicando 'categorie protette', 'L. 68/99' o 'collocamento mirato' nel titolo o nel testo. LavorAI scansiona ogni giorno questi portali e riconosce automaticamente gli annunci con quota riservata.",
  },
  {
    q: "Devo dichiarare l'appartenenza alle categorie protette nella candidatura?",
    a: "Per le offerte riservate sì: è il requisito dell'annuncio. LavorAI risponde alla domanda nel form solo se hai attivato l'opzione 'Categorie protette' nelle preferenze, e non la menziona mai negli annunci ordinari.",
  },
  {
    q: "Serve l'iscrizione al collocamento mirato?",
    a: "Per essere assunti in quota riservata serve l'iscrizione nelle liste del collocamento mirato presso il Centro per l'Impiego, con la certificazione della commissione ASL. Le candidature dirette alle aziende possono partire anche prima, ma l'assunzione richiede l'iscrizione.",
  },
];

export default async function CategorieProtettePage() {
  const jobs = await prisma.job.findMany({
    where: { protectedCategory: true, closedAt: null, cachedAt: { gte: new Date(Date.now() - 45 * 24 * 3600 * 1000) } },
    orderBy: { cachedAt: "desc" },
    take: 30,
    select: { id: true, title: true, company: true, location: true, remote: true, url: true },
  });
  const count = await prisma.job.count({ where: { protectedCategory: true, closedAt: null } });

  const faqLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
  };
  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "LavorAI", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "Lavoro categorie protette", item: `${SITE_URL}/categorie-protette` },
    ],
  };

  return (
    <div className="flex min-h-screen flex-col">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }} />
      <SiteNav />
      <main className="gd-main flex-1">
        <article className="gd-wrap gd-article">
          <nav aria-label="breadcrumb" className="gd-crumbs">
            <Link href="/">LavorAI</Link> <span>/</span> <span>Categorie protette</span>
          </nav>
          <h1>Lavoro per categorie protette: offerte riservate L. 68/99, candidatura automatica</h1>
          <p className="gd-lead">
            Le aziende con più di 15 dipendenti devono riservare una quota di assunzioni alle categorie protette. Gli annunci esistono, ma sono sparsi su decine di portali e spesso nascosti nel testo. LavorAI li riconosce ogni giorno e si candida al posto tuo, con CV e lettera su misura.
          </p>

          <aside className="gd-cta" style={{ marginTop: 0 }}>
            <h2 style={{ marginTop: 0 }}>Attiva la ricerca riservata in 2 minuti</h2>
            <p>Carica il CV, scegli ruoli e città, attiva l&apos;opzione &quot;Categorie protette&quot;. Da quel momento LavorAI dà priorità agli annunci con quota riservata e risponde correttamente alla domanda nel form.</p>
            <Link href="/signup?protected=1" className="gd-cta-btn">Inizia gratis →</Link>
          </aside>

          <section>
            <h2>Offerte riservate alle categorie protette ({count.toLocaleString("it-IT")} attive)</h2>
            {jobs.length === 0 ? (
              <p>Stiamo aggiornando il pool. <Link href="/lavoro?protette=1">Vedi le offerte</Link>.</p>
            ) : (
              <div className="gd-grid">
                {jobs.map((j) => (
                  <Link key={j.id} href={`/lavoro/${j.id}`} className="gd-card">
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <CompanyLogo company={j.company ?? "?"} url={j.url} size={30} rounded={8} />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{j.title}</div>
                        <div className="gd-meta" style={{ margin: 0 }}>{j.company ?? "Azienda"} · {j.remote ? "Remoto" : j.location ?? "Italia"}</div>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
            <p><Link href="/lavoro?protette=1">Tutte le offerte per categorie protette →</Link></p>
          </section>

          <section>
            <h2>Come funziona</h2>
            <ul>
              <li><strong>Riconoscimento automatico.</strong> Ogni annuncio nel pool viene analizzato: &quot;categorie protette&quot;, &quot;L. 68/99&quot;, &quot;art. 1&quot;, &quot;art. 18&quot;, &quot;collocamento mirato&quot;, &quot;quota riservata&quot; e le varianti in inglese vengono etichettate.</li>
              <li><strong>Priorità nel matching.</strong> Se hai attivato l&apos;opzione, gli annunci riservati vengono proposti e inviati per primi, anche quando il ruolo è più generico di quello che cerchi.</li>
              <li><strong>Risposta corretta nel form.</strong> Alla domanda &quot;appartieni alle categorie protette?&quot; LavorAI risponde sì solo negli annunci riservati e con la tua autorizzazione. Negli altri non menziona nulla.</li>
              <li><strong>Inbox delle risposte.</strong> Le risposte dei recruiter arrivano nella tua Inbox e sulla tua email.</li>
            </ul>
          </section>

          <section>
            <h2>Cosa dice la Legge 68/99 in breve</h2>
            <ul>
              <li>Da 15 a 35 dipendenti: 1 assunzione riservata.</li>
              <li>Da 36 a 50 dipendenti: 2 assunzioni riservate.</li>
              <li>Oltre 50 dipendenti: il 7% dell&apos;organico, più l&apos;1% per le categorie dell&apos;art. 18.</li>
              <li>L&apos;assunzione avviene tramite richiesta nominativa o convenzione con il Centro per l&apos;Impiego (collocamento mirato).</li>
            </ul>
          </section>

          <section>
            <h2>Domande frequenti</h2>
            {FAQ.map((f) => (
              <details key={f.q} className="gd-faq">
                <summary>{f.q}</summary>
                <p>{f.a}</p>
              </details>
            ))}
          </section>

          <section>
            <h2>Guide utili</h2>
            <div className="gd-grid">
              <Link href="/guide/lavoro-categorie-protette" className="gd-card">Lavoro categorie protette: la guida completa</Link>
              <Link href="/guide/cv-ats-friendly" className="gd-card">CV ATS friendly</Link>
              <Link href="/guide/software-candidature-automatiche" className="gd-card">Software di candidatura automatica</Link>
            </div>
          </section>
        </article>
      </main>
      <SiteFooter />
    </div>
  );
}
