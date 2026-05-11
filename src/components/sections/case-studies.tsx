"use client";

import { useTranslations } from "next-intl";
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
  return (
    <article
      style={{
        height: "100%",
        borderRadius: 16,
        background: "var(--bg-elev)",
        border: "1px solid var(--border-ds)",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Header */}
      <header style={{ padding: 24, display: "flex", gap: 14, alignItems: "center" }}>
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: 12,
            background: "linear-gradient(135deg, hsl(var(--primary)/0.25), hsl(var(--primary)/0.12))",
            color: "hsl(var(--primary))",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: 700,
            fontSize: 15,
            letterSpacing: "-0.01em",
            border: "1px solid hsl(var(--primary)/0.3)",
            flexShrink: 0,
          }}
        >
          {cs.initials}
        </div>
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 15.5,
              fontWeight: 600,
              letterSpacing: "-0.012em",
              lineHeight: 1.3,
            }}
          >
            {cs.role}
          </div>
          <div
            style={{
              fontSize: 13,
              color: "var(--fg-muted)",
              marginTop: 3,
              lineHeight: 1.5,
            }}
          >
            {cs.context}
          </div>
        </div>
      </header>

      {/* Before / After */}
      <div
        style={{
          padding: "0 24px",
          display: "grid",
          gridTemplateColumns: "1fr",
          gap: 14,
        }}
      >
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
        style={{
          marginTop: 22,
          padding: "18px 24px",
          background: "var(--bg-sunken)",
          borderTop: "1px solid var(--border-ds)",
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 12,
        }}
      >
        {cs.metrics.map((m) => (
          <div key={m.label} style={{ textAlign: "center" }}>
            <div
              className="mono"
              style={{
                fontSize: 24,
                fontWeight: 700,
                color: "hsl(var(--primary))",
                letterSpacing: "-0.02em",
                fontFeatureSettings: '"tnum"',
                lineHeight: 1,
              }}
            >
              {m.value}
            </div>
            <div
              style={{
                fontSize: 11.5,
                color: "var(--fg-muted)",
                marginTop: 6,
                lineHeight: 1.35,
              }}
            >
              {m.label}
            </div>
          </div>
        ))}
      </div>
    </article>
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
  const accent = tone === "before" ? "#94A3B8" : "hsl(var(--primary))";
  const bg = tone === "before" ? "var(--bg-sunken)" : "hsl(var(--primary)/0.08)";
  const border =
    tone === "before"
      ? "1px solid var(--border-ds)"
      : "1px solid hsl(var(--primary)/0.25)";
  const iconName: "x" | "check" = tone === "before" ? "x" : "check";
  return (
    <div
      style={{
        padding: 14,
        borderRadius: 10,
        background: bg,
        border,
      }}
    >
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          fontSize: 12,
          fontWeight: 600,
          color: accent,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          marginBottom: 6,
        }}
      >
        <Icon name={iconName} size={11} />
        {title}
      </div>
      <p
        style={{
          fontSize: 13.5,
          lineHeight: 1.55,
          color: "var(--fg-muted)",
          margin: 0,
        }}
      >
        {body}
      </p>
    </div>
  );
}
