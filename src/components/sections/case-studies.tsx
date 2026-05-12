"use client";

import { useTranslations } from "next-intl";
import * as motionReact from "motion/react";
import { Reveal } from "@/components/reveal";
import { Icon } from "@/components/design/icon";
import { CASE_STUDIES, type CaseStudy } from "@/lib/marketing-content";

/**
 * Case studies anonimizzati — 2 narrative before/after con metriche.
 * Più "social proof" delle quote brevi: per visitor high-intent che
 * vogliono capire SE funziona per profili come il loro.
 *
 * Layout: 2-col su desktop, stacked su mobile. Ogni card ha:
 *   - Initials + role + context (chi è)
 *   - Before block (problema concreto)
 *   - After block (cosa è cambiato)
 *   - 3 metriche bottom (proof numerico)
 */
export function SectionCaseStudies() {
  const t = useTranslations("caseStudies");
  return (
    <section
      id="case-studies"
      className="relative border-t border-border/60 py-24 md:py-28"
    >
      <div className="container">
        <Reveal className="mx-auto max-w-3xl text-center">
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
          <p className="mt-5 text-lg text-muted-foreground">{t("subtitle")}</p>
        </Reveal>

        <div className="mx-auto mt-14 grid max-w-6xl gap-5 lg:grid-cols-2">
          {CASE_STUDIES.map((cs, i) => (
            <Reveal key={cs.initials} delay={i * 0.06}>
              <CaseCard cs={cs} />
            </Reveal>
          ))}
        </div>

        <Reveal delay={0.25} className="mx-auto mt-8 max-w-2xl text-center">
          <p
            style={{
              fontSize: 12.5,
              color: "var(--fg-subtle)",
              lineHeight: 1.5,
            }}
          >
            {t("anonymousNote")}
          </p>
        </Reveal>
      </div>
    </section>
  );
}

function CaseCard({ cs }: { cs: CaseStudy }) {
  // Framer Motion 3D tilt & mouse glow effect
  const x = motionReact.useMotionValue(0);
  const y = motionReact.useMotionValue(0);

  const mouseXSpring = motionReact.useSpring(x, { stiffness: 300, damping: 20 });
  const mouseYSpring = motionReact.useSpring(y, { stiffness: 300, damping: 20 });

  const rotateX = motionReact.useTransform(mouseYSpring, [-0.5, 0.5], ["3deg", "-3deg"]);
  const rotateY = motionReact.useTransform(mouseXSpring, [-0.5, 0.5], ["-3deg", "3deg"]);
  
  // Calculate percentage for the radial gradient glow
  const glowX = motionReact.useTransform(mouseXSpring, [-0.5, 0.5], ["0%", "100%"]);
  const glowY = motionReact.useTransform(mouseYSpring, [-0.5, 0.5], ["0%", "100%"]);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    x.set(mouseX / width - 0.5);
    y.set(mouseY / height - 0.5);
  };

  const handleMouseLeave = () => {
    x.set(0);
    y.set(0);
  };

  return (
    <div style={{ perspective: 1200, height: "100%" }}>
      <motionReact.motion.article
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        style={{
          rotateX,
          rotateY,
          transformStyle: "preserve-3d",
          borderRadius: 24,
        }}
        className="ds-glass flex flex-col h-full overflow-hidden relative group"
      >
        {/* Mouse follow glow */}
        <motionReact.motion.div
          className="pointer-events-none absolute inset-0 z-0 opacity-0 group-hover:opacity-100 transition-opacity duration-700"
          style={{
            background: motionReact.useMotionTemplate`radial-gradient(600px circle at ${glowX} ${glowY}, rgba(255,255,255,0.06), transparent 80%)`,
          }}
        />

        {/* Content wrapper with translateZ for parallax */}
        <div style={{ transform: "translateZ(20px)", display: "flex", flexDirection: "column", height: "100%" }} className="relative z-10">
          {/* Header */}
          <header className="p-6 flex items-center gap-4">
            <div
              className="flex-shrink-0 flex items-center justify-center font-bold text-base relative"
              style={{
                width: 52,
                height: 52,
                borderRadius: 16,
                background: "rgba(255,255,255,0.03)",
                color: "hsl(var(--primary))",
                border: "1px solid rgba(255,255,255,0.08)",
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.1), 0 4px 12px rgba(0,0,0,0.2)",
              }}
            >
              {cs.initials}
            </div>
            <div className="min-w-0">
              <div className="text-[16px] font-semibold tracking-tight leading-snug text-white group-hover:text-primary transition-colors duration-300">
                {cs.role}
              </div>
              <div className="text-[13px] mt-1 leading-relaxed text-white/60">
                {cs.context}
              </div>
            </div>
          </header>

          {/* Before / After */}
          <div className="px-6 grid grid-cols-1 gap-3.5 flex-1">
            <BeforeAfterBlock
              tone="before"
              title={cs.beforeTitle}
              body={cs.beforeBody}
            />
            <BeforeAfterBlock
              tone="after"
              title={cs.afterTitle}
              body={cs.afterBody}
            />
          </div>

          {/* Metrics */}
          <div
            className="mt-6 p-5 grid grid-cols-3 gap-3 transition-colors duration-500 group-hover:bg-white/[0.04]"
            style={{
              background: "rgba(255,255,255,0.02)",
              borderTop: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            {cs.metrics.map((m) => (
              <div key={m.label} className="text-center group/metric">
                <div
                  className="mono text-[26px] font-bold leading-none tracking-tight transition-transform duration-300 group-hover/metric:scale-110"
                  style={{
                    color: "hsl(var(--primary))",
                    textShadow: "0 0 20px hsl(var(--primary)/0.4)",
                  }}
                >
                  {m.value}
                </div>
                <div className="text-[11.5px] mt-1.5 leading-snug text-white/50">
                  {m.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </motionReact.motion.article>
    </div>
  );
}

function BeforeAfterBlock({
  tone,
  title,
  body,
}: {
  tone: "before" | "after";
  title: string;
  body: string;
}) {
  const isBefore = tone === "before";
  
  const accent = isBefore ? "rgba(255,255,255,0.5)" : "hsl(var(--primary))";
  const bg = isBefore ? "rgba(255,255,255,0.02)" : "hsl(var(--primary)/0.06)";
  const border = isBefore
    ? "1px solid rgba(255,255,255,0.06)"
    : "1px solid hsl(var(--primary)/0.3)";
  const iconName: "x" | "check" = isBefore ? "x" : "check";

  return (
    <div
      style={{
        padding: 16,
        borderRadius: 12,
        background: bg,
        border,
        boxShadow: isBefore ? "none" : "inset 0 0 20px hsl(var(--primary)/0.03)",
      }}
    >
      <div
        className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider mb-2"
        style={{ color: accent }}
      >
        <Icon name={iconName} size={11} />
        {title}
      </div>
      <p className="text-[13.5px] leading-relaxed text-white/70 m-0">
        {body}
      </p>
    </div>
  );
}
