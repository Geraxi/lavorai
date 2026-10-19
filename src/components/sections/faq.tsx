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

// EN FAQ — mirrors the 7 Italian items in marketing-content.ts.
// Mantenuto qui inline per evitare un'altra struttura locale-aware.
const FAQ_OBJECTIONS_EN = [
  {
    q: "What does LavorAI actually do?",
    a: "It finds opportunities that fit your profile, prepares a tailored application for each one (adapted CV and cover letter) and tracks every step. You decide when an application goes out.",
  },
  {
    q: "Do I stay in control of what's sent?",
    a: "Yes. In confirmation mode you review the CV and letter and approve each submission. If you want, you can turn on automatic sending in preferences above a match threshold you choose, and turn it off at any time.",
  },
  {
    q: "Does the tailored CV change my experience?",
    a: "No. LavorAI reorders and rewords your own material for the posting, but employers, job titles, dates and qualifications stay as they are in your CV. Before approving you see the differences from the original.",
  },
  {
    q: "Which portals does it work with?",
    a: "Public forms on supported ATS platforms such as Greenhouse, Lever, Ashby and Workable. A listing found on LinkedIn or Indeed can only be applied to if the Apply button leads to a supported ATS. We never log into your LinkedIn or Indeed accounts and never ask for your credentials for these portals.",
  },
  {
    q: "Is my data safe?",
    a: "The primary database runs in Neon's European Frankfurt region. Your CV is processed only by the providers listed in the privacy policy. We do not sell your data; you can export it or delete your account, CV and applications from settings.",
  },
  {
    q: "Does a submitted application mean an interview?",
    a: "No. An ATS receipt or delivery to the email server documents the submission, not a read or a reply. Recruiter replies are tracked separately. LavorAI does not guarantee interviews or offers.",
  },
  {
    q: "What happens after signup?",
    a: "You upload your CV, confirm your profile, roles and locations, then see your first opportunities with documents already prepared. You review, approve the submission and follow each application's status from the dashboard.",
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
          <h2 className=" text-balance text-4xl font-bold tracking-tight sm:text-5xl">
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
          <div className="p-2 ds-glass">
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
