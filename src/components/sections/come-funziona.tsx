"use client";

import Link from "next/link";
import { Upload, Target, Zap } from "lucide-react";
import { useTranslations } from "next-intl";
import { Reveal, RevealItem, RevealStagger } from "@/components/reveal";

export function SectionComeFunziona() {
  const t = useTranslations("howItWorks");
  const steps = [
    { n: "01", icon: Upload, title: t("step1Title"), text: t("step1Text") },
    { n: "02", icon: Target, title: t("step2Title"), text: t("step2Text") },
    { n: "03", icon: Zap, title: t("step3Title"), text: t("step3Text") },
  ];
  return (
    <section
      id="come-funziona"
      className="relative border-t border-border/60 py-16 md:py-20"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,hsl(var(--primary)/0.05),transparent_60%)]"
      />

      <div className="container relative">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p
            className="mono text-[10.5px] uppercase tracking-[0.32em] text-primary/80"
            style={{ fontWeight: 500 }}
          >
            {t("eyebrow")}
          </p>
          <h2
            className="mt-4 text-balance text-4xl font-semibold tracking-tight sm:text-5xl"
            style={{ letterSpacing: "-0.03em" }}
          >
            {t("title1")}{" "}
            <span className="text-gradient-accent">{t("title2")}</span>
          </h2>
        </Reveal>

        <RevealStagger
          staggerDelay={0.1}
          className="mx-auto mt-16 grid max-w-5xl gap-5 md:grid-cols-3"
        >
          {steps.map(({ n, icon: Icon, title, text }) => (
            <RevealItem key={n}>
              <div
                style={{
                  position: "relative",
                  height: "100%",
                  padding: 24,
                  borderRadius: 14,
                  background: "var(--bg-elev)",
                  border: "1px solid var(--border-ds)",
                }}
              >
                <div
                  className="mono"
                  style={{
                    position: "absolute",
                    top: 18,
                    right: 20,
                    fontSize: 11,
                    color: "var(--fg-subtle)",
                    letterSpacing: "0.06em",
                  }}
                >
                  {n}
                </div>
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 10,
                    background: "hsl(var(--primary)/0.12)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Icon
                    className="text-primary"
                    size={18}
                    strokeWidth={2.2}
                  />
                </div>
                <h3
                  style={{
                    marginTop: 18,
                    fontSize: 18,
                    fontWeight: 600,
                    letterSpacing: "-0.01em",
                  }}
                >
                  {title}
                </h3>
                <p
                  style={{
                    marginTop: 6,
                    fontSize: 14,
                    lineHeight: 1.55,
                    color: "var(--fg-muted)",
                  }}
                >
                  {text}
                </p>
              </div>
            </RevealItem>
          ))}
        </RevealStagger>

        <Reveal delay={0.3} className="mt-12 flex justify-center">
          <Link
            href="/optimize"
            className="ds-btn ds-btn-primary"
            style={{
              minHeight: 48,
              padding: "0 24px",
              fontSize: 15,
              fontWeight: 600,
            }}
          >
            {t("cta")}
          </Link>
        </Reveal>
      </div>
    </section>
  );
}
