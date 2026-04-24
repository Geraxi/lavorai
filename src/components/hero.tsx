"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { ArrowRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AuroraBackground } from "@/components/aurora-background";
import { CVMockup } from "@/components/cv-mockup";
import { TrustRow } from "@/components/trust-row";

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
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/5 px-3 py-1 text-xs backdrop-blur-sm"
            >
              <Sparkles className="h-3 w-3 text-primary" />
              <span className="text-foreground/90">
                Made in Italy · GDPR · Dati in UE
              </span>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 24, filter: "blur(8px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1], delay: 0.1 }}
              className="text-balance text-5xl font-bold tracking-tight text-foreground sm:text-6xl md:text-7xl"
              style={{ letterSpacing: "-0.03em", lineHeight: 1.02 }}
            >
              Basta candidarsi per settimane.{" "}
              <span className="text-gradient-accent">Inizia a fare colloqui in giorni.</span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.3 }}
              className="mt-6 max-w-xl text-balance text-lg text-muted-foreground md:text-xl"
            >
              LavorAI trova le posizioni più compatibili,{" "}
              <strong className="text-foreground">
                riscrive CV e lettera motivazionale per ogni annuncio,
                si candida in automatico
              </strong>{" "}
              e ti prepara al colloquio dal vivo — così passi da invio ad
              assunzione nel tempo di un caffè.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.45 }}
              className="mt-10 flex flex-col gap-3 sm:flex-row"
            >
              <ShineButton />
              <Button asChild size="lg" variant="outline">
                <Link href="#come-funziona">Come funziona</Link>
              </Button>
            </motion.div>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.7 }}
              className="mt-6 flex items-center gap-3 text-sm text-muted-foreground"
            >
              <span className="flex -space-x-2">
                {[0, 1, 2, 3].map((i) => (
                  <span
                    key={i}
                    className="h-7 w-7 rounded-full border-2 border-background"
                    style={{
                      background: `linear-gradient(135deg, hsl(${142 + i * 30} 60% 50%), hsl(${180 + i * 40} 60% 40%))`,
                    }}
                  />
                ))}
              </span>
              <span>
                Nessuna carta richiesta ·{" "}
                <span className="text-foreground">3 candidature gratis</span>
              </span>
            </motion.div>
          </div>

          {/* Colonna destra: mockup CV */}
          <div className="relative hidden lg:flex lg:justify-center">
            <div className="relative w-full max-w-[440px]">
              <CVMockup />
            </div>
          </div>
        </div>

        {/* Mockup mobile — compare sotto il copy */}
        <div className="mt-16 flex justify-center lg:hidden">
          <div className="w-full max-w-[360px]">
            <CVMockup />
          </div>
        </div>

        {/* Trust row */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 0.6 }}
          className="mt-28 mb-24 md:mt-36"
        >
          <TrustRow />
        </motion.div>
      </div>
    </section>
  );
}

/**
 * CTA primario con shine sweep al hover. Mantiene Button shadcn sotto
 * ma aggiunge un overlay decorativo.
 */
function ShineButton() {
  return (
    <Button asChild size="lg" className="group relative overflow-hidden">
      <Link href="/optimize">
        <span className="relative z-10 inline-flex items-center gap-2">
          Inizia ora
          <ArrowRight className="transition-transform group-hover:translate-x-0.5" />
        </span>
        {/* Shine overlay */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 group-hover:translate-x-full"
        />
      </Link>
    </Button>
  );
}
