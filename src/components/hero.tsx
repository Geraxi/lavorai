"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { AuroraBackground } from "@/components/aurora-background";
import { DashboardMockup } from "@/components/dashboard-mockup";

export function Hero() {
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
        className="relative z-10 pt-16 md:pt-24"
        style={{
          maxWidth: 1480,
          margin: "0 auto",
          padding: "64px 40px 0",
        }}
      >
        <div className="grid items-center gap-14 lg:grid-cols-[1.15fr_1fr] lg:gap-20">
          {/* Colonna sinistra: copy + CTA */}
          <div className="flex flex-col items-start text-left">
            <motion.h1
              initial={{ opacity: 0, y: 20, filter: "blur(6px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
              className="text-balance font-bold tracking-tight text-foreground"
              style={{
                fontSize: "clamp(3rem, 6.4vw, 5.5rem)",
                letterSpacing: "-0.04em",
                lineHeight: 1.02,
                fontWeight: 700,
              }}
            >
              Candidarsi non è più{" "}
              <span className="text-gradient-accent">il tuo lavoro.</span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, delay: 0.2 }}
              className="mt-7 max-w-2xl text-balance text-muted-foreground"
              style={{
                fontSize: "clamp(1.125rem, 1.5vw, 1.4rem)",
                lineHeight: 1.5,
              }}
            >
              LavorAI trova le posizioni compatibili, riscrive il CV per
              ognuna, e invia tutto al posto tuo. Tu pensa solo ai colloqui.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, delay: 0.35 }}
              className="mt-10 flex flex-col items-start gap-3"
            >
              <ShineButton />
              <span style={{ fontSize: 14, color: "var(--fg-muted)" }}>
                3 candidature gratis · Nessuna carta richiesta · Pausa o annulla
                quando vuoi
              </span>
            </motion.div>

            {/* 3 checkmark — promesse vere e verificabili */}
            <motion.ul
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, delay: 0.5 }}
              className="mt-9 flex flex-col gap-2.5"
              style={{ fontSize: 15.5 }}
            >
              <li className="flex items-center gap-3">
                <span className="text-primary" style={{ fontSize: 17 }}>
                  ✓
                </span>
                <span>Solo annunci veri di Greenhouse, Lever, Workable</span>
              </li>
              <li className="flex items-center gap-3">
                <span className="text-primary" style={{ fontSize: 17 }}>
                  ✓
                </span>
                <span>
                  CV e lettera in italiano nativo, su misura per ogni job
                </span>
              </li>
              <li className="flex items-center gap-3">
                <span className="text-primary" style={{ fontSize: 17 }}>
                  ✓
                </span>
                <span>Nessun login ai tuoi account — zero rischio ban</span>
              </li>
            </motion.ul>
          </div>

          {/* Colonna destra: dashboard preview live */}
          <div className="relative hidden lg:flex lg:justify-center">
            <div className="relative w-full" style={{ maxWidth: 560 }}>
              <DashboardMockup />
            </div>
          </div>
        </div>

        {/* Mobile preview */}
        <div className="mt-16 flex justify-center lg:hidden">
          <div className="w-full max-w-[440px]">
            <DashboardMockup />
          </div>
        </div>

        <div className="mt-32 mb-24" />
      </div>
    </section>
  );
}

/**
 * CTA primario unico — "Avvia l'auto-apply". Più grande e tangibile.
 */
function ShineButton() {
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
      <Link href="/optimize">
        <span
          className="relative z-10 font-semibold"
          style={{ fontSize: 17, letterSpacing: "-0.005em" }}
        >
          Avvia l&apos;auto-apply
        </span>
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 group-hover:translate-x-full"
        />
      </Link>
    </Button>
  );
}
