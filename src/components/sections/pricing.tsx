"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { Check } from "lucide-react";
import { Icon, type IconName } from "@/components/design/icon";

/**
 * Parser di feature string con marker premium [icon-name].
 * Esempio: "[target] Founder Interview Coach" → { icon: "target", text: "Founder ..." }
 * Senza marker → { icon: null, text: feature }.
 *
 * Restringe il set di icon validi così non possiamo iniettare nomi
 * sconosciuti — fallback a null se non riconosciuto.
 */
const FEATURE_ICONS = new Set<IconName>([
  "target", "sparkles", "zap", "star", "globe", "send", "chart",
]);

function parseFeature(raw: string): {
  icon: IconName | null;
  text: string;
  comingSoon: boolean;
} {
  // Marker {soon} ovunque nella stringa → flag comingSoon + chip dedicato
  let comingSoon = false;
  let s = raw;
  if (s.includes("{soon}")) {
    comingSoon = true;
    s = s.replace(/\s*\{soon\}\s*/g, " ").trim();
  }
  const m = s.match(/^\[([a-z-]+)\]\s+(.*)$/);
  if (m && FEATURE_ICONS.has(m[1] as IconName)) {
    return { icon: m[1] as IconName, text: m[2], comingSoon };
  }
  return { icon: null, text: s, comingSoon };
}
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Reveal } from "@/components/reveal";
import { TIER_LIST, type TierConfig } from "@/lib/billing";
import { cn } from "@/lib/utils";

export function SectionPricing() {
  const t = useTranslations("pricing");
  return (
    <section
      id="prezzi"
      // pb extra per evitare che la sticky CTA (fixed bottom 16+~70px
      // alta) copra i bottoni "Scegli Pro+" / "Inizia gratis" delle
      // card pricing. Margine extra solo nella pricing section,
      // sufficient clearance per la sticky senza alterare il resto.
      className="relative border-t border-border/60 pt-24 md:pt-32 pb-40 md:pb-48"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,hsl(var(--primary)/0.08),transparent_70%)]"
      />
      <div className="container relative">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="text-xs uppercase tracking-[0.2em] text-primary">
            {t("eyebrow")}
          </p>
          <h2 className="mt-3 text-balance text-4xl font-bold tracking-tight sm:text-5xl">
            {t("title1")}{" "}
            <span className="text-gradient-accent">{t("title2")}</span>
          </h2>
          <p className="mt-5 text-lg text-muted-foreground">
            {t("subtitle")}
          </p>

          {/* Risk reducer chips — riducono frizione cliccando "Crea account" */}
          <div
            className="mt-6 flex flex-wrap justify-center gap-2"
            style={{ fontSize: 12, color: "var(--fg-muted)" }}
          >
            {(["riskReducer1", "riskReducer2", "riskReducer3"] as const).map(
              (k) => (
                <span
                  key={k}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "5px 12px",
                    borderRadius: 999,
                    background: "var(--bg-elev)",
                    border: "1px solid var(--border-ds)",
                  }}
                >
                  <span
                    aria-hidden
                    style={{
                      width: 5,
                      height: 5,
                      borderRadius: 999,
                      background: "hsl(var(--primary))",
                    }}
                  />
                  {t(k)}
                </span>
              ),
            )}
          </div>
        </Reveal>

        <div className="mx-auto mt-16 grid max-w-6xl gap-6 md:grid-cols-3">
          {TIER_LIST.map((tier, idx) => (
            <Reveal key={tier.id} delay={idx * 0.05}>
              <TierCard tier={tier} />
            </Reveal>
          ))}
        </div>

        <Reveal className="mx-auto mt-10 max-w-xl text-center">
          <p className="text-xs text-muted-foreground">{t("footnote")}</p>
        </Reveal>
      </div>
    </section>
  );
}

function TierCard({ tier }: { tier: TierConfig }) {
  const isFree = tier.id === "free";
  const href = isFree ? "/onboarding" : `/login?plan=${tier.id}`;

  return (
    <motion.div
      whileHover={tier.highlight ? { y: -3 } : undefined}
      transition={{ duration: 0.25 }}
      className="relative h-full"
    >
      {tier.highlight && (
        <div
          aria-hidden
          className="absolute -inset-px rounded-2xl bg-gradient-to-br from-primary via-primary/60 to-primary/30 opacity-90 blur-sm"
        />
      )}
      <Card
        className={cn(
          "card-hover-glow relative h-full backdrop-blur",
          tier.highlight
            ? "ds-glass ds-glass-green shadow-2xl"
            : "ds-glass",
        )}
        style={
          tier.highlight
            ? {
                borderWidth: 2,
                borderStyle: "solid",
                borderColor: "hsl(var(--primary))",
                boxShadow:
                  "0 0 0 1px hsl(var(--primary) / 0.4), 0 24px 60px -20px hsl(var(--primary) / 0.35)",
              }
            : undefined
        }
      >
        {tier.badge && (
          <div className="absolute -top-3 left-1/2 -translate-x-1/2">
            <Badge className="bg-primary text-primary-foreground shadow-primary-glow">
              {tier.badge}
            </Badge>
          </div>
        )}
        <CardContent className="flex h-full flex-col gap-6 p-8">
          <div>
            <h3 className="text-xl font-semibold tracking-tight">{tier.name}</h3>
            <p className="mt-2 text-sm text-muted-foreground">{tier.tagline}</p>
          </div>

          <div className="flex items-baseline gap-1">
            <span
              className={cn(
                "text-5xl font-bold tracking-tighter",
                // BUG: text-gradient-accent usa green→green su transparent
                // text. Sulla card highlight che ha BG verde, il testo
                // diventava invisibile (green-on-green). Sulle altre card
                // bg dark il gradient ha senso, ma highlight no — usiamo
                // foreground solido (white-on-green leggibile).
                tier.highlight ? "text-foreground" : "text-foreground",
              )}
            >
              {tier.priceDisplay}
            </span>
            {tier.priceSuffix && (
              <span
                className={cn(
                  "text-sm",
                  // Suffisso "/ mese": opacità ridotta ma comunque
                  // visibile sul verde (muted-foreground è troppo grigio).
                  tier.highlight
                    ? "text-foreground/80"
                    : "text-muted-foreground",
                )}
              >
                {tier.priceSuffix}
              </span>
            )}
          </div>

          <ul className="flex flex-col gap-3">
            {tier.features.map((raw) => {
              const f = parseFeature(raw);
              return (
                <li
                  key={raw}
                  className={cn(
                    "flex items-start gap-3 text-sm",
                    // Feature coming-soon: testo attenuato per segnalare
                    // che non è ancora attiva.
                    f.comingSoon && "opacity-60",
                  )}
                >
                  {/* TICK: era text-primary (verde) — invisibile sulla
                      card highlight bg-verde. Ora pill bianca-su-verde
                      sul highlight, verde-su-dark sulle altre. */}
                  <span
                    aria-hidden
                    className={cn(
                      "mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-full",
                      tier.highlight
                        ? "bg-foreground/20 text-foreground"
                        : "bg-primary/15 text-primary",
                    )}
                  >
                    <Check className="h-3 w-3 stroke-[3]" />
                  </span>
                  {/* PREMIUM ICON: se la feature ha marker [icon], lo
                      rendiamo INLINE prima del testo. Sostituisce gli
                      emoji 🎯 🎤 con Icon component del design system. */}
                  <span className="flex flex-1 items-start gap-2">
                    {f.icon && (
                      <span
                        className={cn(
                          "mt-0.5 inline-flex h-5 w-5 flex-none items-center justify-center rounded",
                          tier.highlight
                            ? "bg-foreground/15 text-foreground"
                            : "bg-primary/15 text-primary",
                        )}
                      >
                        <Icon name={f.icon} size={12} />
                      </span>
                    )}
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      {f.text}
                      {f.comingSoon && (
                        <span
                          className={cn(
                            "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                            tier.highlight
                              ? "bg-foreground/25 text-foreground"
                              : "bg-amber-500/20 text-amber-400",
                          )}
                        >
                          Coming soon
                        </span>
                      )}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>

          <Button
            asChild
            variant={tier.highlight ? "default" : "outline"}
            className={cn(
              "mt-auto",
              tier.highlight &&
                "group relative overflow-hidden bg-primary text-primary-foreground hover:bg-primary/90",
            )}
          >
            <Link href={href}>
              <span className="relative z-10">{tier.cta}</span>
              {tier.highlight && (
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 group-hover:translate-x-full"
                />
              )}
            </Link>
          </Button>
        </CardContent>
      </Card>
    </motion.div>
  );
}
