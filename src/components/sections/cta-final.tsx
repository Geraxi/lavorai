"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/reveal";

export function SectionCtaFinal() {
  return (
    <section className="relative overflow-hidden border-t border-border/60 py-24 md:py-32">
      {/* Gradient dramatico */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
      >
        <div className="absolute left-1/2 top-1/2 h-[600px] w-[900px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-br from-primary/40 via-primary/10 to-transparent blur-3xl" />
      </div>
      <div className="grid-bg pointer-events-none absolute inset-0 opacity-20 [mask-image:radial-gradient(ellipse_at_center,black,transparent_70%)]" />

      <div className="container relative">
        <Reveal className="mx-auto max-w-3xl text-center">
          <h2 className="text-balance text-5xl font-bold tracking-tight sm:text-6xl md:text-7xl">
            Smetti di candidarti.{" "}
            <span className="text-gradient-accent">Lavorai lo fa per te.</span>
          </h2>
          <p className="mt-6 text-lg text-muted-foreground md:text-xl">
            Setup in 30 secondi. Da lì in poi candida da solo, ogni 30
            minuti, finché non lo metti in pausa. 3 candidature gratis,
            nessuna carta richiesta.
          </p>
          <p
            style={{
              marginTop: 18,
              fontSize: 13,
              color: "var(--fg-subtle)",
            }}
          >
            Pausa o annulla in qualsiasi momento · Dati su server UE · No login
            ai tuoi account
          </p>
          <motion.div
            whileHover={{ scale: 1.02 }}
            transition={{ duration: 0.25 }}
            className="mt-10 inline-block"
          >
            <Button
              asChild
              size="lg"
              className="group relative h-14 overflow-hidden px-8 text-base"
            >
              <Link href="/optimize">
                <span className="relative z-10">
                  Avvia l&apos;auto-apply
                </span>
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 group-hover:translate-x-full"
                />
              </Link>
            </Button>
          </motion.div>
        </Reveal>
      </div>
    </section>
  );
}
