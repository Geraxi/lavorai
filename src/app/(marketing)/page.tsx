import type { Metadata } from "next";
import { SiteFooter } from "@/components/site-footer";
import { SiteNav } from "@/components/site-nav";

export const metadata: Metadata = {
  // Canonical homepage. Risolto contro metadataBase nel root layout
  // (lavorai.it in prod). Senza questo, Google rischia di indicizzare
  // varianti con query string (?utm, ?ref) come pagine distinte.
  alternates: { canonical: "/" },
};
import { Hero } from "@/components/hero";
import { SectionComeFunziona } from "@/components/sections/come-funziona";
import { SectionLeadMagnet } from "@/components/sections/lead-magnet-banner";
import { SectionAutomationBoundaries } from "@/components/sections/automation-boundaries";
import { SectionTrustBlock } from "@/components/sections/trust-block";
import { SectionStats } from "@/components/sections/stats";
import { prisma } from "@/lib/db";
import type { SuccessMetric } from "@/lib/marketing-content";
import { SectionPricing } from "@/components/sections/pricing";
import {
  SectionReferral,
} from "@/components/sections/content-blocks";
import { SectionFaq } from "@/components/sections/faq";
import { SectionCtaFinal } from "@/components/sections/cta-final";
import { StickyCta } from "@/components/sticky-cta";
import { getLocale } from "next-intl/server";

/**
 * Homepage funnel — ordine ottimizzato per conversion:
 *  1. Hero (outcome promise + CTA primario/secondario + trust strip)
 *  2. Come funziona (5 step)
 *  3. Lead magnet (free CV audit via /optimize, low-friction CTA)
 *  4. Automation Boundaries (cosa è auto vs consenso vs controllo)
 *  5. Per chi è (qualifica visitor)
 *  6. Problema (pain → soluzione)
 *  7. Stats (proof point numerici)
 *  8. Testimonials (proof sociale)
 *  9. Why-not-ChatGPT (differenziazione vs alternativa più comune)
 * 10. Trust block (privacy + sicurezza)
 * 11. Pricing
 * 12. After signup (cosa succede dopo registrazione)
 * 13. FAQ (objection handling, 7 domande)
 * 14. Referral placeholder (lifecycle hook futuro)
 * 15. CTA finale
 */
// Numeri live dal DB, rigenerati ogni ora: consegne confermate (prova
// HTTP/DOM), offerte attive nel pool, aziende monitorate. Stesse query di /proof.
export const revalidate = 3600;

async function liveMetrics(locale: string): Promise<SuccessMetric[]> {
  const fresh = new Date(Date.now() - 30 * 24 * 3600 * 1000);
  const [delivered, jobs, companies, users] = await Promise.all([
    prisma.application.count({ where: { submitConfirmation: { startsWith: "DETECTED" } } }),
    prisma.job.count({ where: { closedAt: null, cachedAt: { gte: fresh } } }),
    prisma.job.findMany({ where: { closedAt: null, cachedAt: { gte: fresh }, company: { not: null } }, distinct: ["company"], select: { company: true } }).then((r) => r.length),
    prisma.user.count({ where: { emailVerified: { not: null } } }),
  ]).catch(() => [0, 0, 0, 0] as const);
  const n = (v: number) => v.toLocaleString(locale === "en" ? "en-GB" : "it-IT");
  return locale === "en"
    ? [
        { value: n(users), label: "registered users", caveat: "verified accounts actively using the platform" },
        { value: n(delivered), label: "applications delivered", caveat: "with delivery proof, listed on /proof" },
        { value: `${n(jobs)}+`, label: "active jobs in the pool", caveat: "refreshed every 2 hours" },
        { value: "24h", label: "first application", caveat: "delivered within 24 hours or refunded" },
      ]
    : [
        { value: n(users), label: "utenti registrati", caveat: "account verificati che usano la piattaforma" },
        { value: n(delivered), label: "candidature consegnate", caveat: "con prova di consegna, elenco su /proof" },
        { value: `${n(jobs)}+`, label: "offerte attive nel pool", caveat: "aggiornate ogni 2 ore" },
        { value: "24h", label: "prima candidatura", caveat: "consegnata entro 24 ore o rimborso" },
      ];
}

export default async function Home() {
  const metrics = await liveMetrics(await getLocale());
  return (
    <div className="flex min-h-screen flex-col">
      <SiteNav />
      <main className="flex-1">
        <Hero />
        <SectionStats metrics={metrics} />
        <SectionComeFunziona />
        <SectionAutomationBoundaries />
        <SectionLeadMagnet />
        <SectionPricing />
        <SectionTrustBlock />
        <SectionFaq />
        <SectionReferral />
        <SectionCtaFinal />
      </main>
      <SiteFooter />
      <StickyCta />
    </div>
  );
}
