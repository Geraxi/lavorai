import { SiteFooter } from "@/components/site-footer";
import { SiteNav } from "@/components/site-nav";
import { Hero } from "@/components/hero";
import { SectionComeFunziona } from "@/components/sections/come-funziona";
import { SectionStats } from "@/components/sections/stats";
import { SectionPricing } from "@/components/sections/pricing";
import { SectionFaq } from "@/components/sections/faq";
import { SectionCtaFinal } from "@/components/sections/cta-final";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteNav />
      <main className="flex-1">
        <Hero />
        <SectionComeFunziona />
        <SectionStats />
        <SectionPricing />
        <SectionFaq />
        <SectionCtaFinal />
      </main>
      <SiteFooter />
    </div>
  );
}
