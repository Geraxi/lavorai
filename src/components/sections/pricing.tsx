"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { Check } from "lucide-react";
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
      className="relative border-t border-border/60 py-24 md:py-32"
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
            ? "bg-card/95 shadow-2xl"
            : "border-border/60 bg-card/60",
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
                tier.highlight && "text-gradient-accent",
              )}
            >
              {tier.priceDisplay}
            </span>
            {tier.priceSuffix && (
              <span className="text-sm text-muted-foreground">
                {tier.priceSuffix}
              </span>
            )}
          </div>

          <ul className="flex flex-col gap-3">
            {tier.features.map((f) => (
              <li key={f} className="flex items-start gap-3 text-sm">
                <Check className="mt-0.5 h-4 w-4 flex-none text-primary" />
                <span>{f}</span>
              </li>
            ))}
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
