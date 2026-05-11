"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { AuroraBackground } from "@/components/aurora-background";
import Image from "next/image";
import { trackEvent, AnalyticsEvent } from "@/lib/analytics";

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

      {/* Atmospheric layer 1: gradient verde principale (richer, più
          saturo dell'originale per dare presenza). */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          background:
            "radial-gradient(ellipse 75% 60% at 40% 35%, rgba(34,197,94,0.42) 0%, rgba(34,197,94,0.18) 35%, transparent 70%)",
          mixBlendMode: "screen",
        }}
        animate={{
          opacity: [0.85, 1, 0.95, 1, 0.85],
          scale: [1, 1.05, 1.02, 1.06, 1],
        }}
        transition={{
          duration: 9,
          ease: "easeInOut",
          repeat: Infinity,
        }}
      />

      {/* Atmospheric layer 2: glow secondario blu-verde sul lato destro
          per dare profondità. Aggiunge tridimensionalità senza essere
          aggressivo. */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          background:
            "radial-gradient(ellipse 45% 35% at 80% 65%, rgba(56,189,248,0.18) 0%, transparent 65%)",
          mixBlendMode: "screen",
        }}
        animate={{
          opacity: [0.4, 0.7, 0.5, 0.7, 0.4],
        }}
        transition={{
          duration: 11,
          ease: "easeInOut",
          repeat: Infinity,
          delay: 1.5,
        }}
      />

      {/* Atmospheric layer 3: subtle warm glow in alto-sinistra per
          spezzare la monotonia del verde. */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          background:
            "radial-gradient(ellipse 35% 25% at 15% 20%, rgba(251,191,36,0.10) 0%, transparent 60%)",
          mixBlendMode: "screen",
        }}
        animate={{
          opacity: [0.3, 0.6, 0.4, 0.6, 0.3],
        }}
        transition={{
          duration: 13,
          ease: "easeInOut",
          repeat: Infinity,
          delay: 3,
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
                // Range bilanciato: presenza visiva su desktop (~80px)
                // senza sforare il fold. Su 13" cap a 4.75rem.
                fontSize: "clamp(2.5rem, 5.2vw, 5rem)",
                letterSpacing: "-0.038em",
                lineHeight: 1.04,
                fontWeight: 700,
                maxWidth: "14ch",
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
                borderColor: "var(--border-ds)",
                background:
                  "linear-gradient(135deg, var(--bg-elev), var(--bg-sunken))",
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
                  color: "var(--fg-muted)",
                  display: "inline-flex",
                  alignItems: "baseline",
                  gap: 5,
                }}
              >
                <Counter target={1247} />
                <span>{t("liveActivity1")}</span>
                <span style={{ opacity: 0.4, margin: "0 4px" }}>·</span>
                <strong style={{ color: "var(--fg)", fontWeight: 600 }}>
                  <Counter target={8} />
                </strong>
                <span>{t("liveActivity2")}</span>
              </span>
            </motion.div>

            {/* Logo strips rimossi dall'hero: spostati nella nuova
                SectionPlatformCards che li mostra come card visuali
                separate con descrizioni. Lascia respirare l'hero. */}
          </div>

          {/* Colonna destra: "tiny planet" emotional image.
              Quel ragazzo sdraiato sul pianeta verde traduce in 1 frame
              il messaggio: "il peso del job hunting è risolto, ora puoi
              riposare". Si integra perfettamente col green field
              theme grazie al pianeta verde + sfondo stellato scuro
              che è invertito rispetto al body → l'immagine fa da
              "controcampo cromatico" e cattura lo sguardo. */}
          <div className="relative hidden lg:flex lg:justify-center lg:items-center">
            <HeroVisual />
          </div>
        </div>

        {/* Mobile visual */}
        <div className="mt-10 flex justify-center lg:hidden">
          <div className="w-full max-w-[440px]">
            <HeroVisual />
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
        color: "var(--fg)",
        fontWeight: 600,
        fontFeatureSettings: '"tnum"',
      }}
    >
      {value.toLocaleString("it-IT")}
    </strong>
  );
}

/**
 * Hero visual — "tiny planet" image. Square aspect (1:1) per
 * massimizzare l'impatto del pianeta nel frame quadrato dell'immagine.
 * Asset path: /hero-planet.jpg (l'utente lo salva in public/).
 *
 * Effetti:
 *   - Cornice glass leggera che fonde l'immagine col theme verde
 *   - Subtle floating animation (4s loop) — pianeta che ondeggia
 *     dolcemente come se respirasse, rafforza la sensazione di calma
 *   - Outer glow verde dietro l'immagine, raccoglie il colore del
 *     pianeta e lo proietta sul background del sito
 */
function HeroVisual() {
  return (
    <div
      className="relative w-full"
      style={{
        maxWidth: 560,
        aspectRatio: "1 / 1",
      }}
    >
      {/* Outer green glow — alone verde dietro l'immagine */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: "-8%",
          background:
            "radial-gradient(circle at 50% 50%, hsl(var(--primary) / 0.35), transparent 60%)",
          filter: "blur(40px)",
          pointerEvents: "none",
        }}
      />

      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1], delay: 0.15 }}
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          borderRadius: "2rem",
          overflow: "hidden",
          border: "1px solid rgba(255,255,255,0.18)",
          boxShadow:
            "inset 0 1px 0 rgba(255,255,255,0.12), 0 4px 12px rgba(5,80,55,0.20), 0 32px 80px -16px rgba(5,80,55,0.45)",
        }}
      >
        <motion.div
          style={{ position: "absolute", inset: 0 }}
          animate={{
            y: [0, -8, 0, -4, 0],
          }}
          transition={{
            duration: 8,
            ease: "easeInOut",
            repeat: Infinity,
          }}
        >
          <Image
            src="/hero-planet.jpg"
            alt="Una persona si rilassa su un piccolo pianeta verde nello spazio: la tranquillità di chi non deve più candidarsi a mano"
            fill
            priority
            sizes="(max-width: 1024px) 90vw, 560px"
            style={{
              objectFit: "cover",
              objectPosition: "center",
            }}
          />
        </motion.div>
      </motion.div>
    </div>
  );
}
