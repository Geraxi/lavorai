"use client";

import { motion } from "motion/react";
import { Clock, FileX, ShieldAlert, type LucideIcon } from "lucide-react";
import { Reveal, RevealStagger, RevealItem } from "@/components/reveal";

const items: { icon: LucideIcon; title: string; text: string; accent: string }[] = [
  {
    icon: ShieldAlert,
    title: "L'ATS ti filtra prima dell'umano",
    text: "L'80% delle aziende italiane medio-grandi usa sistemi ATS che filtrano i CV prima che un umano li legga.",
    accent: "from-rose-500/30 to-orange-500/10",
  },
  {
    icon: FileX,
    title: "Il CV generico si perde nel mucchio",
    text: "Il tuo CV generico finisce tra migliaia di altri. Nessuno lo leggerà mai.",
    accent: "from-violet-500/30 to-indigo-500/10",
  },
  {
    icon: Clock,
    title: "Adattare a mano ti ruba i weekend",
    text: "Adattare manualmente il CV a 50 annunci ti ruba interi weekend — e nemmeno così passi l'ATS.",
    accent: "from-primary/30 to-emerald-500/10",
  },
];

export function SectionProblema() {
  return (
    <section
      id="problema"
      className="relative border-t border-border/60 py-24 md:py-32"
    >
      <div className="container">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="text-xs uppercase tracking-[0.2em] text-primary">
            Il problema
          </p>
          <h2 className="mt-3 text-balance text-4xl font-bold tracking-tight sm:text-5xl">
            Candidarsi nel 2026{" "}
            <span className="text-muted-foreground">è cambiato.</span>
          </h2>
          <p className="mt-5 text-lg text-muted-foreground">
            Senza AI è come cercare lavoro nel 2010 senza LinkedIn.
          </p>
        </Reveal>

        <RevealStagger className="mt-16 grid gap-6 md:grid-cols-3">
          {items.map(({ icon: Icon, title, text, accent }) => (
            <RevealItem key={title}>
              <motion.div
                whileHover={{ y: -4 }}
                transition={{ duration: 0.25 }}
                className="card-hover-glow group relative h-full overflow-hidden rounded-xl border border-border/60 bg-card/60 p-6 backdrop-blur"
              >
                {/* Glow on hover behind icon */}
                <div
                  aria-hidden
                  className={`pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-gradient-to-br ${accent} opacity-40 blur-2xl transition-opacity group-hover:opacity-80`}
                />
                <div className="relative">
                  <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-border/60 bg-background/80 text-primary">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="mt-5 text-xl font-semibold tracking-tight">
                    {title}
                  </h3>
                  <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                    {text}
                  </p>
                </div>
              </motion.div>
            </RevealItem>
          ))}
        </RevealStagger>
      </div>
    </section>
  );
}
