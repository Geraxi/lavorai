"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { Reveal } from "@/components/reveal";
import { Icon } from "@/components/design/icon";
import {
  trackEvent,
  observeOnce,
  AnalyticsEvent,
} from "@/lib/analytics";

/**
 * "Automation Boundaries" — il blocco più importante per la conversion.
 *
 * Risponde alla domanda critica: "cosa è automatico e cosa decido io?"
 * Tre colonne con divisione netta:
 *   • Automatico   → LavorAI fa da solo, niente click
 *   • Tu confermi  → modalità Hybrid: ti chiede ok prima
 *   • Tu controlli → preferenze, pause, esclusioni
 *
 * Questo trasforma "automation = perdo controllo" in "automation =
 * smetto di fare il lavoro ripetitivo, mantenendo le scelte chiave".
 */
export function SectionAutomationBoundaries() {
  const t = useTranslations("boundaries");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    return observeOnce(ref.current, () =>
      trackEvent(AnalyticsEvent.BOUNDARIES_VIEW),
    );
  }, []);

  const columns: Array<{
    tone: "auto" | "consent" | "control";
    title: string;
    eyebrow: string;
    items: string[];
  }> = [
    {
      tone: "auto",
      eyebrow: t("autoEyebrow"),
      title: t("autoTitle"),
      items: [
        t("autoItem1"),
        t("autoItem2"),
        t("autoItem3"),
        t("autoItem4"),
      ],
    },
    {
      tone: "consent",
      eyebrow: t("consentEyebrow"),
      title: t("consentTitle"),
      items: [
        t("consentItem1"),
        t("consentItem2"),
        t("consentItem3"),
      ],
    },
    {
      tone: "control",
      eyebrow: t("controlEyebrow"),
      title: t("controlTitle"),
      items: [
        t("controlItem1"),
        t("controlItem2"),
        t("controlItem3"),
        t("controlItem4"),
      ],
    },
  ];

  return (
    <section
      ref={ref}
      id="boundaries"
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

        <div className="mx-auto mt-14 grid max-w-6xl gap-5 md:grid-cols-3">
          {columns.map((col) => (
            <Reveal key={col.tone} delay={0.05}>
              <BoundaryColumn col={col} />
            </Reveal>
          ))}
        </div>

        <Reveal delay={0.2} className="mx-auto mt-10 max-w-2xl text-center">
          <p
            style={{
              fontSize: 13,
              color: "var(--fg-muted)",
              lineHeight: 1.6,
            }}
          >
            {t("footnote")}
          </p>
        </Reveal>
      </div>
    </section>
  );
}

function BoundaryColumn({
  col,
}: {
  col: {
    tone: "auto" | "consent" | "control";
    title: string;
    eyebrow: string;
    items: string[];
  };
}) {
  const accent =
    col.tone === "auto"
      ? "hsl(var(--primary))"
      : col.tone === "consent"
        ? "#F59E0B"
        : "#A78BFA";
  const iconName = col.tone === "auto" ? "zap" : col.tone === "consent" ? "check" : "settings";

  return (
    <div
      style={{
        position: "relative",
        height: "100%",
        padding: 24,
        borderRadius: 14,
        background: "var(--bg-elev)",
        border: "1px solid var(--border-ds)",
        display: "flex",
        flexDirection: "column",
        gap: 14,
      }}
    >
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          padding: "5px 11px",
          borderRadius: 999,
          background: `${accent}1A`,
          color: accent,
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          alignSelf: "flex-start",
        }}
      >
        <Icon name={iconName as "zap" | "check" | "settings"} size={11} />
        {col.eyebrow}
      </div>
      <h3
        style={{
          fontSize: 19,
          fontWeight: 600,
          letterSpacing: "-0.018em",
          lineHeight: 1.25,
          marginTop: 2,
        }}
      >
        {col.title}
      </h3>
      <ul
        style={{
          fontSize: 13.5,
          lineHeight: 1.6,
          color: "var(--fg-muted)",
          paddingLeft: 0,
          margin: 0,
          listStyle: "none",
          display: "flex",
          flexDirection: "column",
          gap: 9,
        }}
      >
        {col.items.map((it, i) => (
          <li key={i} style={{ display: "flex", gap: 8 }}>
            <span
              aria-hidden
              style={{
                color: accent,
                fontWeight: 700,
                flexShrink: 0,
                fontSize: 14,
                lineHeight: 1.55,
              }}
            >
              ›
            </span>
            <span>{it}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
