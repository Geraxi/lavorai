import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteFooter } from "@/components/site-footer";
import { SiteNav } from "@/components/site-nav";
import { CompanyLogo } from "@/components/design/company-logo";
import { prisma } from "@/lib/db";
import { formatSalary } from "@/lib/jobs-repo";
import { employmentType, isRemoteJob, jobDatePosted, jobPostingJsonLd, jobValidThrough, publicJobPath } from "@/lib/job-seo";

/**
 * Pagina pubblica dell'annuncio (indicizzabile, Google for Jobs).
 * L'app interna resta su /jobs/[id] (login). Qui: JSON-LD JobPosting,
 * testo dell'annuncio, CTA "candidati con LavorAI" e annunci simili.
 */

export const revalidate = 3600;

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://lavorai.it";
type Params = { id: string };

const EMPLOYMENT_LABEL: Record<string, string> = { FULL_TIME: "Tempo pieno", PART_TIME: "Part-time", CONTRACTOR: "Contratto / freelance", INTERN: "Stage / tirocinio" };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { id } = await params;
  const job = await prisma.job.findUnique({ where: { id } });
  if (!job) return {};
  const closed = !!job.closedAt || jobValidThrough(job) < new Date();
  const where = isRemoteJob(job) ? "Remoto" : job.location ?? "Italia";
  const title = `${job.title} · ${job.company ?? "Azienda"} · ${where}`;
  const description = `Offerta di lavoro: ${job.title} presso ${job.company ?? "azienda"}, ${where}. Candidati in un clic con LavorAI: CV ottimizzato e lettera personalizzata inclusi.`;
  return {
    title,
    description,
    alternates: { canonical: publicJobPath(job) },
    robots: closed ? { index: false, follow: true } : { index: true, follow: true },
    openGraph: { type: "website", title, description, url: publicJobPath(job) },
  };
}

const fmtDate = (d: Date) => d.toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" });

export default async function PublicJobPage({ params }: { params: Promise<Params> }) {
  const { id } = await params;
  const job = await prisma.job.findUnique({ where: { id } });
  if (!job) notFound();

  const closed = !!job.closedAt || jobValidThrough(job) < new Date();
  const remote = isRemoteJob(job);
  const salary = formatSalary(job.salaryMin, job.salaryMax);
  const types = employmentType(job).map((t) => EMPLOYMENT_LABEL[t] ?? t);
  const paragraphs = (job.description || "").split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);

  const similar = await prisma.job.findMany({
    where: {
      id: { not: job.id },
      closedAt: null,
      cachedAt: { gte: new Date(Date.now() - 30 * 24 * 3600 * 1000) },
      OR: [
        ...(job.company ? [{ company: job.company }] : []),
        ...(job.category && job.category !== "Unknown" ? [{ category: job.category }] : []),
        { title: { contains: job.title.split(/\s+/).slice(0, 2).join(" "), mode: "insensitive" as const } },
      ],
    },
    orderBy: { cachedAt: "desc" },
    take: 6,
    select: { id: true, title: true, company: true, location: true, remote: true, url: true },
  });

  const jsonLd = closed ? null : jobPostingJsonLd(job);
  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "LavorAI", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "Offerte di lavoro", item: `${SITE_URL}/lavoro` },
      { "@type": "ListItem", position: 3, name: job.title, item: `${SITE_URL}${publicJobPath(job)}` },
    ],
  };
  const signupHref = `/signup?next=${encodeURIComponent(`/jobs/${job.id}`)}${job.protectedCategory ? "&protected=1" : ""}`;

  return (
    <div className="flex min-h-screen flex-col">
      {jsonLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }} />
      <SiteNav />
      <main className="gd-main flex-1">
        <article className="gd-wrap gd-article">
          <nav aria-label="breadcrumb" className="gd-crumbs">
            <Link href="/">LavorAI</Link> <span>/</span> <Link href="/lavoro">Offerte di lavoro</Link> <span>/</span> <span>{job.company ?? "Azienda"}</span>
          </nav>

          <div style={{ display: "flex", alignItems: "center", gap: 14, margin: "14px 0 6px" }}>
            <CompanyLogo company={job.company ?? "?"} url={job.url} size={44} rounded={12} />
            <div>
              <h1 style={{ margin: 0 }}>{job.title}</h1>
              <p className="gd-meta" style={{ margin: "4px 0 0" }}>
                {job.company ?? "Azienda"} · {remote ? "Remoto" : job.location ?? "Italia"} · Pubblicato il {fmtDate(jobDatePosted(job))}
              </p>
            </div>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, margin: "12px 0 18px" }}>
            {types.map((t) => <span key={t} className="gd-chip">{t}</span>)}
            {remote && <span className="gd-chip">Remoto</span>}
            {salary && <span className="gd-chip">{salary}</span>}
            {job.protectedCategory && <span className="gd-chip">Categorie protette · L. 68/99</span>}
            {closed && <span className="gd-chip" style={{ opacity: 0.7 }}>Annuncio chiuso</span>}
          </div>

          {closed ? (
            <p className="gd-lead">Questo annuncio non è più attivo. LavorAI trova ogni giorno offerte simili e si candida al posto tuo.</p>
          ) : (
            <aside className="gd-cta" style={{ marginTop: 0 }}>
              <h2 style={{ marginTop: 0 }}>Candidati a questa offerta in un clic</h2>
              <p>LavorAI adatta il tuo CV all&apos;annuncio, scrive la lettera di presentazione e compila il form dell&apos;azienda per te. Prova gratis, senza carta.</p>
              <Link href={signupHref} className="gd-cta-btn">Candidati con LavorAI →</Link>
              <a href={job.url} target="_blank" rel="nofollow noopener" style={{ marginLeft: 12, fontSize: 13, opacity: 0.8 }}>oppure vai al sito dell&apos;azienda ↗</a>
            </aside>
          )}

          <section>
            <h2>Descrizione dell&apos;offerta</h2>
            {paragraphs.length ? paragraphs.map((p, i) => <p key={i}>{p}</p>) : <p>{job.description}</p>}
          </section>

          <section>
            <h2>Dettagli</h2>
            <ul>
              <li><strong>Azienda:</strong> {job.company ?? "n/d"}</li>
              <li><strong>Sede:</strong> {remote ? "Remoto" : job.location ?? "n/d"}</li>
              <li><strong>Tipo di contratto:</strong> {types.join(", ")}</li>
              {salary && <li><strong>Retribuzione indicata:</strong> {salary}</li>}
              <li><strong>Fonte:</strong> {job.source}</li>
              <li><strong>Valido fino al:</strong> {fmtDate(jobValidThrough(job))}</li>
            </ul>
          </section>

          {similar.length > 0 && (
            <section>
              <h2>Offerte simili</h2>
              <div className="gd-grid">
                {similar.map((s) => (
                  <Link key={s.id} href={`/lavoro/${s.id}`} className="gd-card">
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <CompanyLogo company={s.company ?? "?"} url={s.url} size={28} rounded={8} />
                      <div>
                        <div style={{ fontWeight: 600 }}>{s.title}</div>
                        <div className="gd-meta" style={{ margin: 0 }}>{s.company ?? "Azienda"} · {s.remote ? "Remoto" : s.location ?? "Italia"}</div>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}

          <section>
            <h2>Come funziona la candidatura con LavorAI</h2>
            <ul>
              <li>Carichi il CV una volta: LavorAI lo riscrive per ogni annuncio, in formato leggibile dagli ATS.</li>
              <li>Scegli ruoli e città: ogni giorno troviamo le offerte compatibili e prepariamo la candidatura.</li>
              <li>Le risposte dei recruiter arrivano nella tua Inbox e sulla tua email.</li>
            </ul>
            <p><Link href="/guide/software-candidature-automatiche">Scopri come funzionano le candidature automatiche →</Link></p>
          </section>
        </article>
      </main>
      <SiteFooter />
    </div>
  );
}
