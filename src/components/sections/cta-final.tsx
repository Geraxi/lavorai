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
        <Reveal className="mx-auto max-w-4xl">
          {/* Solid green block — il momento finale di branding alto */}
          <div
            className="ds-glass-green-solid"
            style={{
              padding: "60px 40px",
              textAlign: "center",
              color: "#FFFFFF",
            }}
          >
            <h2
              className="text-balance"
              style={{
                fontSize: "clamp(2rem, 4.5vw, 4rem)",
                fontWeight: 700,
                letterSpacing: "-0.035em",
                lineHeight: 1.05,
                margin: 0,
                color: "#FFFFFF",
              }}
            >
              {t("title1")}{" "}
              <span style={{ opacity: 0.85 }}>{t("title2")}</span>
            </h2>
            <p
              style={{
                marginTop: 22,
                fontSize: "clamp(1rem, 1.3vw, 1.25rem)",
                lineHeight: 1.5,
                color: "rgba(255,255,255,0.85)",
                maxWidth: 640,
                marginLeft: "auto",
                marginRight: "auto",
              }}
            >
              {t("subtitle")}
            </p>
            <motion.div
              whileHover={{ scale: 1.02 }}
              transition={{ duration: 0.25 }}
              className="mt-9 inline-block"
            >
              <Button
                asChild
                size="lg"
                className="group relative h-14 overflow-hidden px-8 text-base"
                style={{
                  background: "#FFFFFF",
                  color: "hsl(var(--primary))",
                  fontWeight: 600,
                  border: "1px solid rgba(255,255,255,0.6)",
                  boxShadow:
                    "inset 0 1px 0 rgba(255,255,255,1), 0 8px 24px -6px rgba(15,40,30,0.30)",
                }}
              >
                <Link href="/signup">
                  <span className="relative z-10">{t("cta")}</span>
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/40 to-transparent transition-transform duration-700 group-hover:translate-x-full"
                  />
                </Link>
              </Button>
            </motion.div>

            {/* Trust line dentro al blocco verde, colori white-on-green */}
            <div
              className="mt-7 flex flex-wrap items-center justify-center gap-x-5 gap-y-2"
              style={{ fontSize: 12.5, color: "rgba(255,255,255,0.85)" }}
            >
              {[
                { text: t("trust1") },
                { text: t("trust2") },
                { text: t("trust3") },
                { text: t("trust4") },
              ].map((c, i) => (
                <span key={i} className="inline-flex items-center gap-1.5">
                  <span
                    style={{ color: "#FFFFFF", fontWeight: 700, fontSize: 13 }}
                  >
                    ✓
                  </span>
                  {c.text}
                </span>
              ))}
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
