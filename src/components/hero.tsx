"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CVMockup } from "@/components/cv-mockup";

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="container relative z-10 pt-16 md:pt-24">
        <div className="grid items-center gap-12 lg:grid-cols-[1.1fr_1fr] lg:gap-16">
          {/* Colonna sinistra: copy + CTA */}
          <div className="flex flex-col items-start text-left">
            <motion.h1
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              className="text-balance text-5xl font-semibold tracking-tight text-foreground sm:text-6xl md:text-[64px]"
              style={{ letterSpacing: "-0.035em", lineHeight: 1.05 }}
            >
              Candidature personalizzate, senza passarci le sere.
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.15 }}
              className="mt-6 max-w-xl text-balance text-lg text-muted-foreground"
            >
              LavorAI legge il tuo CV, lo riscrive per ogni annuncio, e invia
              tutto su Greenhouse, Lever e Workable al posto tuo. Tu ricevi
              solo gli inviti ai colloqui.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.3 }}
              className="mt-8 flex flex-col gap-3 sm:flex-row"
            >
              <Button asChild size="lg">
                <Link href="/optimize" className="inline-flex items-center gap-2">
                  Prova con il tuo CV
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="ghost">
                <Link href="#come-funziona">Come funziona</Link>
              </Button>
            </motion.div>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.45 }}
              className="mt-5 text-sm text-muted-foreground"
            >
              Tre candidature gratis. Carta richiesta solo se decidi di
              continuare.
            </motion.p>
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

        <div className="mt-24 mb-24" />
      </div>
    </section>
  );
}
