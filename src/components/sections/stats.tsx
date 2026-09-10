"use client";

import { motion } from "motion/react";
import { Reveal } from "@/components/reveal";
import { SUCCESS_METRICS, type SuccessMetric } from "@/lib/marketing-content";

// I numeri vivono in `src/lib/marketing-content.ts → SUCCESS_METRICS`;
// la homepage passa `metrics` con i conteggi live dal DB.
function toStat(s: SuccessMetric) {
  // Split "2.000+" → value "2.000" + suffix "+", "30s" → "30" + "s"
  const m = s.value.match(/^([\d.,]+)([^\d.,]*)$/);
  return { value: m ? m[1] : s.value, suffix: m ? m[2] : "", label: s.label, sub: s.caveat ?? "" };
}

export function SectionStats({ metrics }: { metrics?: SuccessMetric[] }) {
  const stats = (metrics ?? SUCCESS_METRICS).map(toStat);
  return (
    <section className="relative overflow-hidden border-t border-border/60 py-24 md:py-28">
      {/* Subtle radial wash · solo accenno, niente gradient pesante */}
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
            Numeri reali della piattaforma
          </p>
          <h2
            className="mt-4 text-balance text-3xl font-semibold tracking-tight sm:text-4xl"
            style={{ letterSpacing: "-0.025em" }}
          >
            Tu apri l&apos;app una volta. Le candidature partono da sole.
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

        <Reveal delay={0.2} className="mx-auto mt-8 max-w-2xl text-center">
          <p style={{ fontSize: 11.5, color: "var(--fg-subtle)", lineHeight: 1.6 }}>
            Numeri letti dal database di LavorAI, aggiornati ogni ora. Il dettaglio
            di ogni consegna confermata è pubblico su{" "}
            <a href="/proof" className="underline-offset-4 hover:text-foreground hover:underline">/proof</a>.
          </p>
        </Reveal>
      </div>
    </section>
  );
}
