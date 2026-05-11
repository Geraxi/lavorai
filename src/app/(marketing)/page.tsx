import { SiteFooter } from "@/components/site-footer";
import { SiteNav } from "@/components/site-nav";
import { Hero } from "@/components/hero";
import { SectionComeFunziona } from "@/components/sections/come-funziona";
import { SectionLeadMagnet } from "@/components/sections/lead-magnet-banner";
import { SectionPlatformCards } from "@/components/sections/platform-cards";
import { SectionAutomationBoundaries } from "@/components/sections/automation-boundaries";
import { SectionTrustBlock } from "@/components/sections/trust-block";
import { SectionProblema } from "@/components/sections/problema";
import { SectionStats } from "@/components/sections/stats";
import { SectionTestimonialsV2 } from "@/components/sections/testimonials-v2";
import { SectionCaseStudies } from "@/components/sections/case-studies";
import { SectionPricing } from "@/components/sections/pricing";
import {
  SectionPersonas,
  SectionWhyNotChatGpt,
  SectionAfterSignup,
  SectionReferral,
} from "@/components/sections/content-blocks";
import { SectionFaq } from "@/components/sections/faq";
import { SectionCtaFinal } from "@/components/sections/cta-final";
import { StickyCta } from "@/components/sticky-cta";

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
export default function Home() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteNav />
      <main className="flex-1">
        <Hero />
        <SectionPlatformCards />
        <SectionComeFunziona />
        <SectionLeadMagnet />
        <SectionAutomationBoundaries />
        <SectionPersonas />
        <SectionProblema />
        <SectionStats />
        <SectionTestimonialsV2 />
        <SectionCaseStudies />
        <SectionWhyNotChatGpt />
        <SectionTrustBlock />
        <SectionPricing />
        <SectionAfterSignup />
        <SectionFaq />
        <SectionReferral />
        <SectionCtaFinal />
      </main>
      <SiteFooter />
      <StickyCta />
    </div>
  );
}
