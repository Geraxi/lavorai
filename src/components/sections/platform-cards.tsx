"use client";

import { useTranslations } from "next-intl";
import { Reveal } from "@/components/reveal";
import { Icon } from "@/components/design/icon";

/**
 * Platform cards — sostituisce i text strings "LinkedIn · Indeed · …"
 * con card visivamente distinte, una per piattaforma. Onesta su quale
 * piattaforma fa cosa: discovery (LinkedIn/Indeed/InfoJobs/Subito) vs
 * apply (Greenhouse/Lever/Ashby/SmartRecruiters/Workable).
 *
 * Differenzia da competitor che claim "candidiamo su LinkedIn" quando
 * in realtà LinkedIn non lo permette (TOS + anti-bot).
 */

interface PlatformDef {
  name: string;
  initial: string;
  color: string;
  bgColor: string;
  i18nKey: string;
}

const DISCOVERY: PlatformDef[] = [
  {
    name: "LinkedIn",
    initial: "in",
    color: "#0A66C2",
    bgColor: "rgba(10,102,194,0.15)",
    i18nKey: "linkedin",
  },
  {
    name: "Indeed",
    initial: "I",
    color: "#003A9B",
    bgColor: "rgba(0,58,155,0.15)",
    i18nKey: "indeed",
  },
  {
    name: "InfoJobs",
    initial: "ij",
    color: "#FF7900",
    bgColor: "rgba(255,121,0,0.15)",
    i18nKey: "infojobs",
  },
  {
    name: "Subito",
    initial: "S",
    color: "#FFC700",
    bgColor: "rgba(255,199,0,0.15)",
    i18nKey: "subito",
  },
];

const APPLY: PlatformDef[] = [
  {
    name: "Greenhouse",
    initial: "GH",
    color: "#4CAF50",
    bgColor: "rgba(76,175,80,0.18)",
    i18nKey: "greenhouse",
  },
  {
    name: "Lever",
    initial: "L",
    color: "#8B5CF6",
    bgColor: "rgba(139,92,246,0.18)",
    i18nKey: "lever",
  },
  {
    name: "Ashby",
    initial: "A",
    color: "#06B6D4",
    bgColor: "rgba(6,182,212,0.18)",
    i18nKey: "ashby",
  },
  {
    name: "SmartRecruiters",
    initial: "SR",
    color: "#EC4899",
    bgColor: "rgba(236,72,153,0.18)",
    i18nKey: "smartrecruiters",
  },
  {
    name: "Workable",
    initial: "W",
    color: "#F59E0B",
    bgColor: "rgba(245,158,11,0.18)",
    i18nKey: "workable",
  },
];

export function SectionPlatformCards() {
  const t = useTranslations("platformCards");

  return (
    <section
      id="piattaforme"
      className="relative border-t border-border/60 py-24 md:py-28"
      style={{ background: "var(--bg-sunken)" }}
    >
      <div className="container">
        {/* Discovery row */}
        <Reveal className="mx-auto max-w-6xl">
          <PlatformRow
            eyebrow={t("discoveryEyebrow")}
            tone="discovery"
            platforms={DISCOVERY}
            t={t}
          />
        </Reveal>

        {/* Connector arrow */}
        <Reveal delay={0.15} className="my-6 flex justify-center">
          <div
            style={{
              width: 2,
              height: 40,
              background:
                "linear-gradient(180deg, var(--border-ds), hsl(var(--primary)))",
            }}
          />
        </Reveal>

        {/* Apply row */}
        <Reveal delay={0.2} className="mx-auto max-w-6xl">
          <PlatformRow
            eyebrow={t("applyEyebrow")}
            tone="apply"
            platforms={APPLY}
            t={t}
          />
        </Reveal>
      </div>
    </section>
  );
}

function PlatformRow({
  eyebrow,
  tone,
  platforms,
  t,
}: {
  eyebrow: string;
  tone: "discovery" | "apply";
  platforms: PlatformDef[];
  t: (k: string) => string;
}) {
  const accentColor =
    tone === "apply" ? "hsl(var(--primary))" : "var(--fg-subtle)";
  return (
    <div>
      <div
        className="mono"
        style={{
          fontSize: 11,
          textTransform: "uppercase",
          letterSpacing: "0.16em",
          color: accentColor,
          fontWeight: 600,
          marginBottom: 16,
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: 999,
            background: accentColor,
            boxShadow:
              tone === "apply"
                ? "0 0 8px hsl(var(--primary)/0.5)"
                : "none",
          }}
        />
        {eyebrow}
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 12,
        }}
      >
        {platforms.map((p) => (
          <PlatformCard key={p.name} platform={p} description={t(p.i18nKey)} tone={tone} />
        ))}
      </div>
    </div>
  );
}

function PlatformCard({
  platform,
  description,
  tone,
}: {
  platform: PlatformDef;
  description: string;
  tone: "discovery" | "apply";
}) {
  return (
    <div
      style={{
        padding: "16px 18px",
        borderRadius: 12,
        background: "var(--bg-elev)",
        border:
          tone === "apply"
            ? "1px solid hsl(var(--primary)/0.25)"
            : "1px solid var(--border-ds)",
        display: "flex",
        gap: 14,
        alignItems: "flex-start",
        transition: "transform 0.2s ease, border-color 0.2s ease",
      }}
      className="hover:border-foreground"
    >
      {/* Logo bubble — colore brand della piattaforma */}
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: 10,
          background: platform.bgColor,
          color: platform.color,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          fontWeight: 700,
          fontSize: platform.initial.length > 1 ? 13 : 17,
          letterSpacing: "-0.02em",
          flexShrink: 0,
        }}
      >
        {platform.initial}
      </div>

      <div style={{ minWidth: 0, flex: 1 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: 15,
            fontWeight: 600,
            letterSpacing: "-0.012em",
            color: "var(--fg)",
          }}
        >
          {platform.name}
          {tone === "apply" && (
            <Icon
              name="check"
              size={11}
              style={{
                color: "hsl(var(--primary))",
                marginLeft: 2,
              }}
            />
          )}
        </div>
        <p
          style={{
            fontSize: 12.5,
            color: "var(--fg-muted)",
            lineHeight: 1.5,
            marginTop: 4,
            marginBottom: 0,
          }}
        >
          {description}
        </p>
      </div>
    </div>
  );
}
