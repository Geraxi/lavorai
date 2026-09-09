import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/components/site-footer";
import { SiteNav } from "@/components/site-nav";
import { CompanyLogo } from "@/components/design/company-logo";
import { prisma } from "@/lib/db";
import { isRemoteJob } from "@/lib/job-seo";

/**
 * Hub pubblico delle offerte: ultime offerte nel pool + accessi per
 * categoria/città. Serve a Google per scoprire le pagine /lavoro/[id]
 * (oltre alla sitemap) e agli utenti anonimi come vetrina.
 */

export const revalidate = 1800;

export const metadata: Metadata = {
  title: "Offerte di lavoro aggiornate ogni giorno: candidati in un clic",
  description:
    "Migliaia di offerte di lavoro in Italia e da remoto, raccolte dai portali delle aziende. Con LavorAI ti candidi in un clic: CV ottimizzato e lettera inclusi.",
  alternates: { canonical: "/lavoro" },
};

const CITIES = ["Milano", "Roma", "Torino", "Bologna", "Firenze", "Napoli", "Padova", "Verona", "Genova", "Bari"];

export default async function LavoroHub({ searchParams }: { searchParams: Promise<{ citta?: string; q?: string; remoto?: string; protette?: string }> }) {
  const sp = await searchParams;
  const citta = sp.citta?.trim();
  const q = sp.q?.trim();
  const remoto = sp.remoto === "1";
  const protette = sp.protette === "1";

  const jobs = await prisma.job.findMany({
    where: {
      closedAt: null,
      cachedAt: { gte: new Date(Date.now() - 30 * 24 * 3600 * 1000) },
      ...(citta ? { location: { contains: citta, mode: "insensitive" } } : {}),
      ...(q ? { title: { contains: q, mode: "insensitive" } } : {}),
      ...(remoto ? { remote: true } : {}),
      ...(protette ? { protectedCategory: true } : {}),
    },
    orderBy: { cachedAt: "desc" },
    take: 120,
    select: { id: true, title: true, company: true, location: true, remote: true, url: true, cachedAt: true, protectedCategory: true },
  });
  const total = await prisma.job.count({ where: { closedAt: null, cachedAt: { gte: new Date(Date.now() - 30 * 24 * 3600 * 1000) } } });

  const heading = protette
    ? "Offerte di lavoro per categorie protette (L. 68/99)"
    : remoto
      ? "Offerte di lavoro da remoto"
      : citta
        ? `Offerte di lavoro a ${citta}`
        : q
          ? `Offerte di lavoro: ${q}`
          : "Offerte di lavoro aggiornate ogni giorno";

  return (
    <div className="flex min-h-screen flex-col">
      <SiteNav />
      <main className="gd-main flex-1">
        <div className="gd-wrap gd-article">
          <nav aria-label="breadcrumb" className="gd-crumbs">
            <Link href="/">LavorAI</Link> <span>/</span> <span>Offerte di lavoro</span>
          </nav>
          <h1>{heading}</h1>
          <p className="gd-lead">
            {total.toLocaleString("it-IT")} offerte attive raccolte direttamente dai portali delle aziende (Greenhouse, Lever, Ashby, Workable, Personio, Recruitee, EURES e altri). Con LavorAI ti candidi in un clic, oppure lasci che si candidi lui ogni giorno al posto tuo.
          </p>

          <form action="/lavoro" method="get" style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "10px 0 16px" }}>
            <input name="q" defaultValue={q ?? ""} placeholder="Ruolo, es. product designer" className="gd-input" style={{ flex: "1 1 220px" }} />
            <input name="citta" defaultValue={citta ?? ""} placeholder="Città" className="gd-input" style={{ flex: "0 1 160px" }} />
            <button type="submit" className="gd-cta-btn">Cerca</button>
          </form>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 18 }}>
            <Link href="/lavoro?remoto=1" className="gd-chip">Remoto</Link>
            <Link href="/lavoro?protette=1" className="gd-chip">Categorie protette</Link>
            {CITIES.map((c) => <Link key={c} href={`/lavoro?citta=${encodeURIComponent(c)}`} className="gd-chip">{c}</Link>)}
          </div>

          {jobs.length === 0 ? (
            <p>Nessuna offerta trovata con questi filtri. <Link href="/lavoro">Vedi tutte le offerte</Link>.</p>
          ) : (
            <div className="gd-grid">
              {jobs.map((j) => (
                <Link key={j.id} href={`/lavoro/${j.id}`} className="gd-card">
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <CompanyLogo company={j.company ?? "?"} url={j.url} size={30} rounded={8} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{j.title}</div>
                      <div className="gd-meta" style={{ margin: 0 }}>
                        {j.company ?? "Azienda"} · {isRemoteJob({ remote: j.remote, location: j.location, title: j.title }) ? "Remoto" : j.location ?? "Italia"}
                        {j.protectedCategory ? " · L. 68/99" : ""}
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}

          <aside className="gd-cta">
            <h2 style={{ marginTop: 0 }}>Stanco di compilare form?</h2>
            <p>LavorAI trova le offerte compatibili con il tuo profilo e si candida al posto tuo, ogni giorno, con CV e lettera su misura.</p>
            <Link href="/signup" className="gd-cta-btn">Inizia gratis →</Link>
          </aside>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
