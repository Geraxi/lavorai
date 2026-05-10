"use client";

import Link from "next/link";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useTranslations } from "next-intl";
import { Reveal } from "@/components/reveal";

export function SectionFaq() {
  const t = useTranslations("faq");
  const faq = [
    { q: t("q1Question"), a: t("q1Answer") },
    { q: t("q2Question"), a: t("q2Answer") },
    { q: t("q3Question"), a: t("q3Answer") },
    { q: t("q4Question"), a: t("q4Answer") },
    { q: t("q5Question"), a: t("q5Answer") },
    { q: t("q6Question"), a: t("q6Answer") },
    { q: t("q7Question"), a: t("q7Answer") },
  ];
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
