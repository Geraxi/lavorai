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

      <div className="container relative z-10 pt-16 md:pt-24">
        <div className="grid items-center gap-12 lg:grid-cols-[1.1fr_1fr] lg:gap-16">
          {/* Colonna sinistra: copy + CTA */}
          <div className="flex flex-col items-start text-left">
            <motion.h1
              initial={{ opacity: 0, y: 20, filter: "blur(6px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
              className="text-balance text-5xl font-bold tracking-tight text-foreground sm:text-6xl md:text-7xl"
              style={{ letterSpacing: "-0.035em", lineHeight: 1.02 }}
            >
              Candidati a 50 lavori con un click.{" "}
              <span className="text-gradient-accent">In automatico.</span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, delay: 0.2 }}
              className="mt-6 max-w-xl text-balance text-lg text-muted-foreground md:text-xl"
            >
              LavorAI trova, compila e invia le candidature al posto tuo.
              Niente form, niente lettere, niente tempo perso.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, delay: 0.35 }}
              className="mt-10 flex flex-col items-start gap-3"
            >
              <ShineButton />
              <span style={{ fontSize: 13, color: "var(--fg-muted)" }}>
                3 candidature gratis · Nessuna carta richiesta · Pausa o annulla
                quando vuoi
              </span>
            </motion.div>

            {/* 3 checkmark — promesse vere e verificabili */}
            <motion.ul
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, delay: 0.5 }}
              className="mt-8 flex flex-col gap-2"
              style={{ fontSize: 14 }}
            >
              <li className="flex items-center gap-2.5">
                <span className="text-primary">✓</span>
                <span>Solo annunci veri di Greenhouse, Lever, Workable</span>
              </li>
              <li className="flex items-center gap-2.5">
                <span className="text-primary">✓</span>
                <span>CV e lettera in italiano nativo, su misura per ogni job</span>
              </li>
              <li className="flex items-center gap-2.5">
                <span className="text-primary">✓</span>
                <span>Nessun login ai tuoi account — zero rischio ban</span>
              </li>
            </motion.ul>
          </div>

          {/* Colonna destra: dashboard preview live */}
          <div className="relative hidden lg:flex lg:justify-center">
            <div className="relative w-full max-w-[480px]">
              <DashboardMockup />
            </div>
          </div>
        </div>

        {/* Mobile preview */}
        <div className="mt-14 flex justify-center lg:hidden">
          <div className="w-full max-w-[400px]">
            <DashboardMockup />
          </div>
        </div>

        <div className="mt-24 mb-20" />
      </div>
    </section>
  );
}

/**
 * CTA primario unico — "Avvia l'auto-apply". Niente CTA secondaria
 * (one-primary-action principle).
 */
function ShineButton() {
  return (
    <Button asChild size="lg" className="group relative overflow-hidden" style={{ minHeight: 52, paddingLeft: 24, paddingRight: 24 }}>
      <Link href="/optimize">
        <span className="relative z-10 text-base font-semibold">
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
