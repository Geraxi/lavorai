"use client";

import { motion } from "motion/react";
import { Reveal } from "@/components/reveal";

// Metriche concrete della pipeline: mostra cosa fa realmente il sistema.
const stats = [
  { value: "30 min", label: "cadenza del cron auto-apply" },
  { value: "4 ATS", label: "submit diretto: Greenhouse, Lever, Workable, BambooHR" },
  { value: "1 pag.", label: "CV PDF ATS-friendly generato da Claude" },
  { value: "🇪🇺", label: "dati in server UE, GDPR nativo" },
];

export function SectionStats() {
  return (
    <section className="relative border-t border-border/60 py-20">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,hsl(var(--primary)/0.06),transparent_70%)]"
      />
      <div className="container relative">
        <Reveal>
          <div className="mx-auto grid max-w-5xl grid-cols-2 gap-6 md:grid-cols-4">
            {stats.map((s, i) => (
              <motion.div
                key={s.value}
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.4 }}
                transition={{
                  duration: 0.5,
                  delay: i * 0.08,
                  ease: [0.22, 1, 0.36, 1],
                }}
                className="text-center"
              >
                <div
                  className="text-gradient-accent text-4xl font-bold tracking-tight md:text-5xl"
                  style={{ letterSpacing: "-0.03em" }}
                >
                  {s.value}
                </div>
                <div className="mt-2 text-sm text-muted-foreground md:text-[13px]">
                  {s.label}
                </div>
              </motion.div>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
