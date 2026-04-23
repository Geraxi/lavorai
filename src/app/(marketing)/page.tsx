import { SiteFooter } from "@/components/site-footer";
import { SiteNav } from "@/components/site-nav";
import { Hero } from "@/components/hero";
import { SectionProblema } from "@/components/sections/problema";
import { SectionFeatures } from "@/components/sections/features";
import { SectionComeFunziona } from "@/components/sections/come-funziona";
import { SectionPricing } from "@/components/sections/pricing";
import { SectionFaq } from "@/components/sections/faq";
import { SectionCtaFinal } from "@/components/sections/cta-final";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteNav />
      <main className="flex-1">
        <Hero />
        <SectionProblema />
        <SectionComeFunziona />
        <SectionFeatures />
        <SectionPricing />
        <SectionFaq />
        <SectionCtaFinal />
      </main>
      <SiteFooter />
    </div>
  );
}
