import { SiteFooter } from "@/components/site-footer";
import { SiteNav } from "@/components/site-nav";
import { Hero } from "@/components/hero";
import { SectionComeFunziona } from "@/components/sections/come-funziona";
import { SectionProblema } from "@/components/sections/problema";
import { SectionStats } from "@/components/sections/stats";
import { SectionTestimonialsV2 } from "@/components/sections/testimonials-v2";
import { SectionPricing } from "@/components/sections/pricing";
import { SectionFaq } from "@/components/sections/faq";
import { SectionCtaFinal } from "@/components/sections/cta-final";
import { StickyCta } from "@/components/sticky-cta";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteNav />
      <main className="flex-1">
        <Hero />
        <SectionComeFunziona />
        <SectionProblema />
        <SectionStats />
        <SectionTestimonialsV2 />
        <SectionPricing />
        <SectionFaq />
        <SectionCtaFinal />
      </main>
      <SiteFooter />
      <StickyCta />
    </div>
  );
}
