"use client";

import { motion } from "motion/react";
import { Reveal } from "@/components/reveal";

// Metriche concrete: dimensione del pool, velocità, copertura ATS, fiducia.
// Visual treatment ispirato a Linear / Vercel: numero grande con kerning
// stretto, label minuscola low-key, divider verticali tra le colonne.
const stats = [
  {
    value: "1.400+",
    suffix: "",
    label: "Annunci attivi",
    sub: "aggiornati ogni 6 ore",
  },
  {
    value: "30",
    suffix: "s",
    label: "Per candidatura",
    sub: "CV + lettera cuciti su misura",
  },
  {
    value: "4",
    suffix: "",
    label: "ATS integrati",
    sub: "Greenhouse · Lever · Workable · BambooHR",
  },
  {
    value: "100",
    suffix: "%",
    label: "Made in EU",
    sub: "dati su server europei, GDPR nativo",
  },
];

export function SectionStats() {
  return (
    <section className="relative overflow-hidden border-t border-border/60 py-24 md:py-28">
      {/* Subtle radial wash — solo accenno, niente gradient pesante */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 60% 70% at 50% 0%, hsl(var(--primary)/0.05), transparent 70%)",
        }}
      />

      <div className="container relative">
        {/* Eyebrow header per dare contesto premium */}
        <Reveal className="mx-auto mb-14 max-w-2xl text-center md:mb-16">
          <p
            className="mono text-[10.5px] uppercase tracking-[0.32em] text-primary/80"
            style={{ fontWeight: 500 }}
          >
            By the numbers
          </p>
          <h2
            className="mt-4 text-balance text-3xl font-semibold tracking-tight sm:text-4xl"
            style={{ letterSpacing: "-0.025em" }}
          >
            Pensato per chi non ha tempo da perdere.
          </h2>
        </Reveal>

        <Reveal>
          <div
            className="mx-auto grid max-w-5xl grid-cols-2 md:grid-cols-4"
            style={{
              borderTop: "1px solid var(--border-ds)",
              borderBottom: "1px solid var(--border-ds)",
            }}
          >
            {stats.map((s, i) => (
              <motion.div
                key={s.label}
                initial={{ opacity: 0, y: 14 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.4 }}
                transition={{
                  duration: 0.55,
                  delay: i * 0.06,
                  ease: [0.22, 1, 0.36, 1],
                }}
                style={{
                  // Divider verticali tra le colonne (solo desktop) +
                  // orizzontali sotto la prima riga (solo mobile)
                  borderRight:
                    i < stats.length - 1
                      ? "1px solid var(--border-ds)"
                      : undefined,
                  borderBottom:
                    i < 2 ? "1px solid var(--border-ds)" : undefined,
                  padding: "32px 20px",
                }}
                className="md:!border-b-0 md:!border-r"
              >
                <div className="flex flex-col items-start">
                  <div className="flex items-baseline gap-1">
                    <span
                      className="text-foreground"
                      style={{
                        fontSize: "clamp(2.5rem, 5vw, 3.75rem)",
                        fontWeight: 600,
                        letterSpacing: "-0.04em",
                        lineHeight: 1,
                        fontFeatureSettings: '"tnum"',
                      }}
                    >
                      {s.value}
                    </span>
                    {s.suffix && (
                      <span
                        className="text-primary"
                        style={{
                          fontSize: "clamp(1.25rem, 2vw, 1.75rem)",
                          fontWeight: 500,
                          letterSpacing: "-0.02em",
                        }}
                      >
                        {s.suffix}
                      </span>
                    )}
                  </div>
                  <div
                    className="mt-3 text-foreground"
                    style={{
                      fontSize: 14,
                      fontWeight: 500,
                      letterSpacing: "-0.005em",
                    }}
                  >
                    {s.label}
                  </div>
                  <div
                    className="mt-1 text-muted-foreground"
                    style={{
                      fontSize: 12,
                      lineHeight: 1.5,
                      letterSpacing: "0",
                    }}
                  >
                    {s.sub}
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
