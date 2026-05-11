"use client";

import Link from "next/link";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useTranslations, useLocale } from "next-intl";
import { Reveal } from "@/components/reveal";
import { trackEvent, AnalyticsEvent } from "@/lib/analytics";
import { FAQ_OBJECTIONS } from "@/lib/marketing-content";

// EN FAQ — speculare alle 7 italiane di marketing-content.ts.
// Mantenuto qui inline per evitare un'altra struttura locale-aware.
const FAQ_OBJECTIONS_EN = [
  {
    q: "Is my data safe?",
    a: "Yes. Your CV is encrypted at rest on EU servers (Neon · Frankfurt), GDPR-first. Never sold, never shared. You can export everything to JSON or delete account+CV+applications in 1 click from settings.",
  },
  {
    q: "Do I stay in control of what's sent?",
    a: "Yes, 3 modes you choose from preferences: Off (no sends), Hybrid (asks for ok before each application), Auto (runs on its own above a match threshold you set). One-click toggle, always reversible.",
  },
  {
    q: "Does it actually work on major portals?",
    a: "Yes on public ATS forms — Greenhouse, Lever, Ashby, SmartRecruiters, Workable — the same ones you'd fill clicking Apply. For LinkedIn/Indeed we scrape openings then redirect to the underlying ATS form. We never ask for or store your LinkedIn/Indeed credentials.",
  },
  {
    q: "Will applications look generic or templated?",
    a: "Every application has CV and cover letter rewritten by Claude for that specific posting: the system reads the job description, identifies ATS keywords, reformulates your existing experience. Nothing made up — only your real material, reordered per listing.",
  },
  {
    q: "Can I review before sending?",
    a: "Yes — in Hybrid mode you get a summary for each application before sending and click 'Send' or 'Skip'. In Auto mode you can still see full history in dashboard and flag any issues on individual sends.",
  },
  {
    q: "Who is LavorAI for?",
    a: "Professionals looking for tech, design, marketing, product or sales roles — in Italy, EU or remote. Works best if you have 1+ years experience and a CV in English or Italian. Doesn't replace networking, but takes the repetitive work off your evenings.",
  },
  {
    q: "What happens after signup?",
    a: "1) Verify your email (60 seconds). 2) Upload your CV — Claude extracts profile, experience, roles. 3) Confirm 1-2 target roles and locations. 4) LavorAI starts applying 3 times a day (morning, lunch, afternoon) on matching jobs. You only get emails for recruiter replies.",
  },
];

export function SectionFaq() {
  const t = useTranslations("faq");
  const locale = useLocale();
  const faq = locale === "en" ? FAQ_OBJECTIONS_EN : FAQ_OBJECTIONS;
  return (
    <section id="faq" className="relative border-t border-border/60 py-24 md:py-32">
      <div className="container">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="text-xs uppercase tracking-[0.2em] text-primary">FAQ</p>
          <h2 className="mt-3 text-balance text-4xl font-bold tracking-tight sm:text-5xl">
            {t("heading")}
          </h2>
          <p className="mt-5 text-lg text-muted-foreground">
            {t("notFound")}{" "}
            <Link
              href="/contatti"
              className="text-foreground underline-offset-4 hover:underline"
            >
              {t("contactUs")}
            </Link>
            .
          </p>
        </Reveal>

        <Reveal delay={0.1} className="mx-auto mt-14 max-w-3xl">
          <div className="rounded-2xl border border-border/60 bg-card/40 p-2 backdrop-blur">
            <Accordion
              type="multiple"
              defaultValue={["item-0", "item-1"]}
              className="w-full"
              onValueChange={(open: string[]) => {
                // Traccia ogni FAQ aperta (UNA volta per item)
                for (const v of open) {
                  const idx = parseInt(v.replace("item-", ""), 10);
                  if (Number.isFinite(idx) && faq[idx]) {
                    trackEvent(AnalyticsEvent.FAQ_EXPAND, {
                      index: idx,
                      question: faq[idx].q,
                    });
                  }
                }
              }}
            >
              {faq.map(({ q, a }, i) => (
                <AccordionItem
                  key={q}
                  value={`item-${i}`}
                  className="border-border/60 px-4"
                >
                  <AccordionTrigger className="text-left text-base font-medium hover:no-underline [&[data-state=open]]:text-primary">
                    {q}
                  </AccordionTrigger>
                  <AccordionContent className="text-base leading-relaxed text-muted-foreground">
                    {a}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
