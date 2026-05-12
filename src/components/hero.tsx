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
        backgroundColor: "#010510",
        minHeight: 800,
        display: "flex",
        alignItems: "center",
      }}
    >
      {/* Animated rotating background image */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          backgroundImage: "url('/Lavoraiherosection.png')",
          backgroundSize: "contain",
          backgroundPosition: "right center",
          backgroundRepeat: "no-repeat",
          transformOrigin: "75% 50%", // Anchor rotation roughly around the planet
        }}
        animate={{
          rotate: [0, 1.5, -1.5, 0],
          scale: [1.02, 1.05, 1.05, 1.02],
        }}
        transition={{
          duration: 18,
          ease: "easeInOut",
          repeat: Infinity,
        }}
      />
      {/* Soft gradient to fade the left side into black, blending the image */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          background:
            "linear-gradient(90deg, #010510 0%, rgba(1,5,16,0.8) 40%, rgba(1,5,16,0) 100%)",
        }}
      />

      {/* Subtle green atmospheric glow */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          background:
            "radial-gradient(ellipse 40% 50% at 75% 50%, hsl(var(--primary) / 0.15), transparent 70%)",
          mixBlendMode: "screen",
        }}
        animate={{
          opacity: [0.5, 0.8, 0.5],
        }}
        transition={{
          duration: 8,
          ease: "easeInOut",
          repeat: Infinity,
        }}
      />

      <div
        className="relative z-10 w-full"
        style={{
          maxWidth: 1480,
          margin: "0 auto",
          padding: "40px",
        }}
      >
        <div className="grid items-center gap-14 lg:grid-cols-2">
          {/* Colonna sinistra: Testo puro su dark background, senza box glassmorphism */}
          <motion.div 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
            className="flex flex-col items-start text-left relative z-10 w-full lg:max-w-[640px] pt-10 pb-20"
          >
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="mb-6 inline-flex items-center gap-2 rounded-full border px-3 py-1"
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
                  letterSpacing: "0.1em",
                  color: "hsl(var(--primary))",
                  textTransform: "uppercase",
                }}
              >
                PER CHI CERCA LAVORO ALLE 23 DI DOMENICA
              </span>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 20, filter: "blur(6px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
              className="text-balance font-bold tracking-tight"
              style={{
                // Misura "base" = quella di LavorAI (l'ultima riga).
                // Le righe precedenti sono in em per scalare in proporzione.
                fontSize: "clamp(3.5rem, 7vw, 7.5rem)",
                letterSpacing: "-0.03em",
                lineHeight: 1.02,
                fontWeight: 800,
                color: "#FFFFFF",
                textShadow: "0 2px 24px rgba(0,5,20,0.5)",
              }}
            >
              {/* Scala progressiva: il passato è piccolo, il futuro è grande.
                  Trasmette il "build-up" tipografico fino al brand name. */}
              <motion.span
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 0.55, x: 0 }}
                transition={{ duration: 0.5, delay: 0.05 }}
                style={{
                  display: "block",
                  fontSize: "0.42em",
                  letterSpacing: "-0.025em",
                  lineHeight: 1.1,
                }}
              >
                Lavoravo.
              </motion.span>
              <motion.span
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 0.75, x: 0 }}
                transition={{ duration: 0.5, delay: 0.15 }}
                style={{
                  display: "block",
                  fontSize: "0.58em",
                  letterSpacing: "-0.028em",
                  lineHeight: 1.08,
                  marginTop: "0.1em",
                }}
              >
                Lavoro.
              </motion.span>
              <motion.span
                initial={{ opacity: 0, x: -4 }}
                animate={{ opacity: 0.92, x: 0 }}
                transition={{ duration: 0.55, delay: 0.25 }}
                style={{
                  display: "block",
                  fontSize: "0.78em",
                  letterSpacing: "-0.03em",
                  lineHeight: 1.05,
                  marginTop: "0.06em",
                }}
              >
                Lavorerò.
              </motion.span>
              <motion.span
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.4, ease: [0.22, 1, 0.36, 1] }}
                style={{
                  display: "block",
                  color: "hsl(var(--primary))",
                  textShadow: "0 0 40px hsl(var(--primary)/0.35)",
                  marginTop: "0.04em",
                }}
              >
                LavorAI.
              </motion.span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, delay: 0.2 }}
              className="mt-6 max-w-[500px]"
              style={{
                fontSize: "clamp(1rem, 1.1vw, 1.125rem)",
                lineHeight: 1.6,
                color: "rgba(255,255,255,0.7)",
              }}
            >
              LavorAI è il copilota che si carica il peso ripetitivo: trova le offerte giuste, riscrive il CV per ognuna, compila i form. Tu torni a fare colloqui, non a riempire campi.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, delay: 0.35 }}
              className="mt-8 flex flex-col items-start gap-5 w-full"
            >
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  asChild
                  className="group relative overflow-hidden bg-primary text-primary-foreground hover:bg-primary/90"
                  style={{
                    minHeight: 52,
                    paddingLeft: 24,
                    paddingRight: 24,
                    fontSize: 16,
                    fontWeight: 600,
                    borderRadius: 12,
                  }}
                >
                  <Link href="/signup" onClick={() => trackEvent(AnalyticsEvent.HERO_CTA_PRIMARY, { label: "signup" })}>
                    <span className="relative z-10">Provalo, vedi se ti capisce</span>
                  </Link>
                </Button>
                <Link
                  href="/analizza-cv"
                  onClick={() => trackEvent(AnalyticsEvent.HERO_CTA_SECONDARY, { label: "lead_magnet" })}
                  className="ds-btn"
                  style={{
                    minHeight: 52,
                    paddingLeft: 24,
                    paddingRight: 24,
                    fontSize: 16,
                    fontWeight: 600,
                    background: "#FFFFFF",
                    color: "#000000",
                    borderRadius: 12,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  Prima fai vedere il mio CV →
                </Link>
              </div>
              
              {/* Checkmarks row */}
              <div className="flex flex-wrap gap-x-5 gap-y-2 mt-2" style={{ fontSize: 13, color: "rgba(255,255,255,0.9)", fontWeight: 500 }}>
                {["3 candidature gratis", "Niente carta", "Pausa quando vuoi"].map((text) => (
                  <span key={text} className="inline-flex items-center gap-1.5">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="hsl(var(--primary))" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                    {text}
                  </span>
                ))}
              </div>
            </motion.div>

            {/* 4-icon trust strip Grid */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.45 }}
              className="mt-8 grid grid-cols-2 gap-x-6 gap-y-4 max-w-[500px]"
              style={{ fontSize: 13, color: "rgba(255,255,255,0.7)" }}
            >
              <div className="flex items-start gap-3">
                <svg className="mt-0.5" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                <span className="leading-tight">GDPR-first<br/>server EU</span>
              </div>
              <div className="flex items-start gap-3">
                <svg className="mt-0.5" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                <span className="leading-tight">Cancella tutto<br/>in 1 click</span>
              </div>
              <div className="flex items-start gap-3">
                <svg className="mt-0.5" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path><polyline points="9 12 11 14 15 10"></polyline></svg>
                <span className="leading-tight">Niente credenziali<br/>LinkedIn richieste</span>
              </div>
              <div className="flex items-start gap-3">
                <svg className="mt-0.5" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>
                <span className="leading-tight">Pausa<br/>quando vuoi</span>
              </div>
            </motion.div>

            {/* Live activity bar */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, delay: 0.55 }}
              className="mt-10 inline-flex items-center gap-3 rounded-lg border px-3.5 py-2.5"
              style={{
                borderColor: "rgba(255,255,255,0.1)",
                background: "rgba(255,255,255,0.02)",
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
                  color: "rgba(255,255,255,0.6)",
                  display: "inline-flex",
                  alignItems: "baseline",
                  gap: 5,
                }}
              >
                <strong style={{ color: "#FFFFFF", fontWeight: 600 }}>
                  <Counter target={1247} />
                </strong>
                <span>{t("liveActivity1")}</span>
                <span style={{ opacity: 0.4, margin: "0 6px" }}>·</span>
                <strong style={{ color: "#FFFFFF", fontWeight: 600 }}>
                  <Counter target={8} />
                </strong>
                <span>{t("liveActivity2")}</span>
              </span>
            </motion.div>
          </motion.div>

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
