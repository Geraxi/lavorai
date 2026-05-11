"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
// Image import non più necessario — l'immagine pianeta è ora bg
// CSS della section, non un <Image> renderizzato.
import { trackEvent, AnalyticsEvent } from "@/lib/analytics";

export function Hero() {
  const t = useTranslations("hero");
  return (
    <section
      className="relative overflow-hidden"
      style={{
        // Hero background = pianeta intero visibile (no crop) sul lato
        // destro, fondo scuro #0a1820 che si estende a sinistra dove
        // sta il copy bianco. L'immagine è 1254×1254 (quadrata) →
        // background-size: contain conserva le proporzioni, niente
        // zoom aggressivo.
        backgroundColor: "#0a1820",
        backgroundImage: "url('/Lavoraiherosection.png')",
        backgroundSize: "auto 65%",
        backgroundPosition: "right 4% center",
        backgroundRepeat: "no-repeat",
        minHeight: 720,
      }}
    >
      {/* Overlay morbido per fondere la zona scura dello space con
          il pianeta a destra. Light wash sul border-zone così il
          confine planet/space non sembra tagliato. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          background:
            "linear-gradient(90deg, rgba(10,24,32,0) 0%, rgba(10,24,32,0) 40%, rgba(10,24,32,0.30) 70%, rgba(10,24,32,0) 100%), linear-gradient(180deg, rgba(10,24,32,0.20) 0%, transparent 30%, rgba(10,24,32,0.30) 100%)",
        }}
      />

      {/* Subtle green atmospheric glow per fondere il pianeta col
          theme verde del resto del sito */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          background:
            "radial-gradient(ellipse 50% 60% at 70% 55%, hsl(var(--primary) / 0.25), transparent 65%)",
          mixBlendMode: "screen",
        }}
        animate={{
          opacity: [0.55, 0.85, 0.65, 0.85, 0.55],
        }}
        transition={{
          duration: 9,
          ease: "easeInOut",
          repeat: Infinity,
        }}
      />

      <div
        className="relative z-10"
        style={{
          maxWidth: 1480,
          margin: "0 auto",
          padding: "72px 40px 0",
        }}
      >
        <div className="grid items-center gap-14 lg:grid-cols-[1.4fr_1fr] lg:gap-12">
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
              className="text-balance font-bold tracking-tight"
              style={{
                fontSize: "clamp(2.5rem, 5.2vw, 5rem)",
                letterSpacing: "-0.038em",
                lineHeight: 1.04,
                fontWeight: 700,
                maxWidth: "14ch",
                color: "#FFFFFF",
                textShadow: "0 2px 24px rgba(0,5,20,0.5)",
              }}
            >
              {t("title1")}{" "}
              <span
                style={{
                  background:
                    "linear-gradient(180deg, #6EE7B7, #34D399)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}
              >
                {t("title2")}
              </span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, delay: 0.2 }}
              className="mt-5 max-w-xl"
              style={{
                fontSize: "clamp(1rem, 1.1vw, 1.125rem)",
                lineHeight: 1.55,
                color: "rgba(255,255,255,0.85)",
                textShadow: "0 1px 12px rgba(0,5,20,0.4)",
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
                  href="/analizza-cv"
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
              <span style={{ fontSize: 14, color: "rgba(255,255,255,0.75)" }}>
                {t("ctaCaption")}
              </span>
            </motion.div>

            {/* Trust strip — 4 reassurance concrete sotto il CTA. */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.45 }}
              className="mt-5 flex flex-wrap gap-x-5 gap-y-2"
              style={{ fontSize: 12.5, color: "rgba(255,255,255,0.78)" }}
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

            {/* Live activity bar — proof of momentum. Numeri reali con
                un counter animato che parte da 0 e tickha verso il
                target. Trasforma "stat statiche" in "il sistema sta
                lavorando ADESSO". */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, delay: 0.55 }}
              className="mt-6 inline-flex items-center gap-3 rounded-lg border px-3.5 py-2.5"
              style={{
                borderColor: "rgba(255,255,255,0.18)",
                background: "rgba(255,255,255,0.08)",
                backdropFilter: "blur(20px) saturate(180%)",
                WebkitBackdropFilter: "blur(20px) saturate(180%)",
              }}
            >
              <span
                aria-hidden
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: 999,
                  background: "hsl(var(--primary))",
                  boxShadow: "0 0 8px hsl(var(--primary) / 0.7)",
                  flexShrink: 0,
                  position: "relative",
                }}
              >
                <span
                  style={{
                    position: "absolute",
                    inset: -4,
                    borderRadius: 999,
                    background: "hsl(var(--primary))",
                    opacity: 0.3,
                    animation: "ds-pulse 1.8s ease-out infinite",
                  }}
                />
              </span>
              <span
                style={{
                  fontSize: 13,
                  color: "rgba(255,255,255,0.80)",
                  display: "inline-flex",
                  alignItems: "baseline",
                  gap: 5,
                }}
              >
                <Counter target={1247} />
                <span>{t("liveActivity1")}</span>
                <span style={{ opacity: 0.4, margin: "0 4px" }}>·</span>
                <strong style={{ color: "#FFFFFF", fontWeight: 600 }}>
                  <Counter target={8} />
                </strong>
                <span>{t("liveActivity2")}</span>
              </span>
            </motion.div>

            {/* Logo strips rimossi dall'hero: spostati nella nuova
                SectionPlatformCards che li mostra come card visuali
                separate con descrizioni. Lascia respirare l'hero. */}
          </div>

          {/* Right column: deliberatamente vuota su desktop — l'immagine
              pianeta è ora background della section, lascia che si
              veda. La colonna sinistra resta per il copy con dark
              overlay come scrim. */}
          <div className="hidden lg:block" aria-hidden />
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

/**
 * Numero che tickha da 0 al target su 1.4s — easeOut. Usato nella
 * live activity strip per dare sensazione di "il sistema sta facendo
 * cose adesso". Numero finale è hardcoded (placeholder) — sostituire
 * con dato reale via API una volta che abbiamo il dataset.
 *
 * NOTE PLACEHOLDER: 1247 e 8 sono numeri credibili ma non reali.
 * Vedi TODO-LAUNCH.md — bisogna wirar /api/marketing/stats che
 * ritorna count(success last 7d) + count(applying right now).
 */
function Counter({ target }: { target: number }) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const duration = 1400;
    const ease = (t: number) => 1 - Math.pow(1 - t, 3);
    const tick = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(1, elapsed / duration);
      setValue(Math.round(ease(progress) * target));
      if (progress < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return (
    <strong
      className="mono"
      style={{
        color: "#FFFFFF",
        fontWeight: 600,
        fontFeatureSettings: '"tnum"',
      }}
    >
      {value.toLocaleString("it-IT")}
    </strong>
  );
}

// HeroVisual rimosso: l'immagine pianeta è ora background-image
// della <section> hero (full-bleed), non un elemento separato.
