import type { Metadata } from "next";
import { SiteNav } from "@/components/site-nav";
import { SiteFooter } from "@/components/site-footer";
import { SectionPricing } from "@/components/sections/pricing";
import { SectionFaq } from "@/components/sections/faq";

export const metadata: Metadata = {
  title: "Prezzi · LavorAI",
  description:
    "Piani LavorAI: Free (3 candidature), Pro (€19.99/mese, 50 candidature), Pro+ (€39.99/mese, illimitate + Founder Coach).",
  alternates: { canonical: "/pricing" },
};

/**
 * Pagina dedicata /pricing.
 *
 * Esisteva solo come sezione #prezzi della homepage, ma il PremiumGate
 * (paywall Pro+) e altri CTA linkavano a /pricing → 404. Una pagina
 * focalizzata è anche UX migliore come landing post-paywall: zero hero
 * marketing, dritti ai piani.
 *
 * Riusa gli stessi componenti della homepage (SectionPricing +
 * SectionFaq) per un'unica source of truth dei prezzi/tier.
 */
export default function PricingPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteNav />
      <main className="flex-1">
        <SectionPricing />
        <SectionFaq />
      </main>
      <SiteFooter />
    </div>
  );
}
