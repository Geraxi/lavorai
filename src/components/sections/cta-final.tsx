"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/reveal";

export function SectionCtaFinal() {
  const t = useTranslations("ctaFinal");
  return (
    <section className="relative overflow-hidden border-t border-border/60 py-24 md:py-32">
      {/* Gradient dramatico */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
      >
        <div className="absolute left-1/2 top-1/2 h-[600px] w-[900px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-br from-primary/40 via-primary/10 to-transparent blur-3xl" />
      </div>
      <div className="grid-bg pointer-events-none absolute inset-0 opacity-20 [mask-image:radial-gradient(ellipse_at_center,black,transparent_70%)]" />

      <div className="container relative">
        <Reveal className="mx-auto max-w-3xl text-center">
          <h2 className="text-balance text-5xl font-bold tracking-tight sm:text-6xl md:text-7xl">
            {t("title1")}{" "}
            <span className="text-gradient-accent">{t("title2")}</span>
          </h2>
          <p className="mt-6 text-lg text-muted-foreground md:text-xl">
            {t("subtitle")}
          </p>
          <p
            style={{
              marginTop: 18,
              fontSize: 13,
              color: "var(--fg-subtle)",
            }}
          >
            {t("caption")}
          </p>
          <motion.div
            whileHover={{ scale: 1.02 }}
            transition={{ duration: 0.25 }}
            className="mt-10 inline-block"
          >
            <Button
              asChild
              size="lg"
              className="group relative h-14 overflow-hidden px-8 text-base"
            >
              <Link href="/signup">
                <span className="relative z-10">{t("cta")}</span>
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 group-hover:translate-x-full"
                />
              </Link>
            </Button>
          </motion.div>

          {/* Compact trust line direttamente sotto il CTA. Riduce
              ansia all'ultimo momento: consenso esplicito, cancella in
              1 click, dati EU. Stesso wording di /privacy ma compatto. */}
          <div
            className="mt-8 flex flex-wrap items-center justify-center gap-x-5 gap-y-2"
            style={{ fontSize: 12.5, color: "var(--fg-muted)" }}
          >
            {[
              { icon: "✓", text: t("trust1") },
              { icon: "✓", text: t("trust2") },
              { icon: "✓", text: t("trust3") },
              { icon: "✓", text: t("trust4") },
            ].map((c, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1.5"
              >
                <span style={{ color: "hsl(var(--primary))", fontWeight: 600 }}>
                  {c.icon}
                </span>
                {c.text}
              </span>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
