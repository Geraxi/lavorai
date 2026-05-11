"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { AuroraBackground } from "@/components/aurora-background";
import { DashboardMockup } from "@/components/dashboard-mockup";
import { trackEvent, AnalyticsEvent } from "@/lib/analytics";
import { SUPPORTED_PORTALS } from "@/lib/marketing-content";

export function Hero() {
  const t = useTranslations("hero");
  return (
    <section className="relative overflow-hidden">
      <AuroraBackground variant="hero" />

      {/* Grid pattern sottile */}
      <div
        aria-hidden
        className="grid-bg pointer-events-none absolute inset-0 opacity-40 [mask-image:radial-gradient(ellipse_80%_60%_at_50%_0%,black,transparent)]"
      />

      {/* Gradient verde animato — sfondo morbido che pulsa */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          background:
            "radial-gradient(ellipse 70% 55% at 50% 40%, rgba(34,197,94,0.28) 0%, rgba(34,197,94,0.12) 35%, transparent 70%)",
          mixBlendMode: "screen",
        }}
        animate={{
          opacity: [0.7, 1, 0.85, 1, 0.7],
          scale: [1, 1.04, 1.02, 1.05, 1],
        }}
        transition={{
          duration: 8,
          ease: "easeInOut",
          repeat: Infinity,
        }}
      />

      <div
        className="relative z-10"
        style={{
          maxWidth: 1480,
          margin: "0 auto",
          padding: "48px 40px 0",
        }}
      >
        <div className="grid items-center gap-14 lg:grid-cols-[1.15fr_1fr] lg:gap-20">
          {/* Colonna sinistra: copy + CTA */}
          <div className="flex flex-col items-start text-left">
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="mb-5 inline-flex items-center gap-2 rounded-full border px-3 py-1"
              style={{
                borderColor: "hsl(var(--primary) / 0.4)",
                background: "hsl(var(--primary) / 0.08)",
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 999,
                  background: "hsl(var(--primary))",
                  boxShadow: "0 0 8px hsl(var(--primary) / 0.6)",
                }}
              />
              <span
                className="mono"
                style={{
                  fontSize: 11,
                  fontWeight: 500,
                  letterSpacing: "0.18em",
                  color: "hsl(var(--primary))",
                  textTransform: "uppercase",
                }}
              >
                {t("badge")}
              </span>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 20, filter: "blur(6px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
              className="text-balance font-bold tracking-tight text-foreground"
              style={{
                // Capped più basso (era 5.5rem → 4rem) per stare dentro
                // il fold su 13" laptop. Headline ora 2 righe max.
                fontSize: "clamp(2.25rem, 4.5vw, 4rem)",
                letterSpacing: "-0.035em",
                lineHeight: 1.05,
                fontWeight: 700,
                maxWidth: "16ch",
              }}
            >
              {t("title1")}{" "}
              <span className="text-gradient-accent">{t("title2")}</span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, delay: 0.2 }}
              className="mt-5 max-w-xl text-muted-foreground"
              style={{
                fontSize: "clamp(1rem, 1.1vw, 1.125rem)",
                lineHeight: 1.55,
              }}
            >
              {t("subtitle")}
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, delay: 0.35 }}
              className="mt-7 flex flex-col items-start gap-3"
            >
              <div
                className="flex flex-wrap items-center gap-3"
              >
                <ShineButton
                  label={t("cta")}
                  onClick={() =>
                    trackEvent(AnalyticsEvent.HERO_CTA_PRIMARY, {
                      label: "signup",
                    })
                  }
                />
                <Link
                  href="/optimize"
                  onClick={() =>
                    trackEvent(AnalyticsEvent.HERO_CTA_SECONDARY, {
                      label: "lead_magnet",
                    })
                  }
                  className="ds-btn"
                  style={{
                    minHeight: 60,
                    paddingLeft: 24,
                    paddingRight: 24,
                    fontSize: 15,
                    fontWeight: 600,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  {t("ctaSecondary")} →
                </Link>
              </div>
              <span style={{ fontSize: 14, color: "var(--fg-muted)" }}>
                {t("ctaCaption")}
              </span>
            </motion.div>

            {/* Trust strip — 4 reassurance concrete sotto il CTA.
                Rispondono alle obiezioni più frequenti PRIMA che vengano
                fatte (data safety, controllo, no credenziali, reversibilità). */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.45 }}
              className="mt-5 flex flex-wrap gap-x-5 gap-y-2"
              style={{ fontSize: 12.5, color: "var(--fg-muted)" }}
            >
              {(["trustStrip1", "trustStrip2", "trustStrip3", "trustStrip4"] as const).map(
                (k) => (
                  <span key={k} className="inline-flex items-center gap-1.5">
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
            </motion.div>

            {/* I 3 checkmark redundant rimossi: il trust strip sopra
                già copre le stesse promesse in formato più compatto.
                Le claim più dettagliate sono nelle sezioni Boundaries +
                Trust block più sotto. Questo hero ora cape nel fold. */}

            {/* Logo strips — onesta distinzione tra discovery (LinkedIn,
                Indeed) e submit reale (Greenhouse, Lever, Ashby).
                Differenzia da competitor che claim "candida su LinkedIn"
                quando in realtà non possono (TOS + anti-bot). */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, delay: 0.55 }}
              className="mt-7 flex flex-col gap-3"
            >
              <div>
                <p
                  className="mono"
                  style={{
                    fontSize: 11,
                    textTransform: "uppercase",
                    letterSpacing: "0.16em",
                    color: "var(--fg-subtle)",
                    fontWeight: 500,
                  }}
                >
                  {t("portalsLabel")}
                </p>
                <div
                  style={{
                    marginTop: 8,
                    display: "flex",
                    gap: 18,
                    flexWrap: "wrap",
                    alignItems: "center",
                  }}
                >
                  {SUPPORTED_PORTALS.discovery.map((p) => (
                    <span
                      key={p}
                      style={{
                        fontSize: 15,
                        fontWeight: 600,
                        letterSpacing: "-0.015em",
                        color: "var(--fg-muted)",
                        filter: "grayscale(1)",
                        opacity: 0.75,
                      }}
                    >
                      {p}
                    </span>
                  ))}
                </div>
              </div>
              <div>
                <p
                  className="mono"
                  style={{
                    fontSize: 11,
                    textTransform: "uppercase",
                    letterSpacing: "0.16em",
                    color: "hsl(var(--primary))",
                    fontWeight: 500,
                  }}
                >
                  {t("portalsApplyLabel")}
                </p>
                <div
                  style={{
                    marginTop: 8,
                    display: "flex",
                    gap: 18,
                    flexWrap: "wrap",
                    alignItems: "center",
                  }}
                >
                  {SUPPORTED_PORTALS.apply.map((p) => (
                    <span
                      key={p}
                      style={{
                        fontSize: 15,
                        fontWeight: 600,
                        letterSpacing: "-0.015em",
                        color: "var(--fg)",
                      }}
                    >
                      {p}
                    </span>
                  ))}
                </div>
              </div>
            </motion.div>
          </div>

          {/* Colonna destra: dashboard preview live */}
          <div className="relative hidden lg:flex lg:justify-center">
            <div className="relative w-full" style={{ maxWidth: 560 }}>
              <DashboardMockup />
            </div>
          </div>
        </div>

        {/* Mobile preview */}
        <div className="mt-10 flex justify-center lg:hidden">
          <div className="w-full max-w-[440px]">
            <DashboardMockup />
          </div>
        </div>

        <div className="mt-10 mb-4" />
      </div>
    </section>
  );
}

/**
 * CTA primario unico — "Avvia l'auto-apply". Più grande e tangibile.
 */
function ShineButton({
  label,
  onClick,
}: {
  label: string;
  onClick?: () => void;
}) {
  return (
    <Button
      asChild
      size="lg"
      className="group relative overflow-hidden"
      style={{
        minHeight: 60,
        paddingLeft: 32,
        paddingRight: 32,
      }}
    >
      <Link href="/signup" onClick={onClick}>
        <span
          className="relative z-10 font-semibold"
          style={{ fontSize: 17, letterSpacing: "-0.005em" }}
        >
          {label}
        </span>
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 group-hover:translate-x-full"
        />
      </Link>
    </Button>
  );
}
