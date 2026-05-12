"use client";

import { motion } from "motion/react";
import { Reveal, RevealItem, RevealStagger } from "@/components/reveal";
import { TESTIMONIALS } from "@/lib/marketing-content";

// Le testimonial vivono in `src/lib/marketing-content.ts → TESTIMONIALS`
// (single source di proof point della landing — vedi anche CASE_STUDIES,
// SUCCESS_METRICS). Editare lì aggiorna sia questa sezione che eventuali
// altri consumer senza duplicare contenuto.
const testimonials = TESTIMONIALS.map((t) => ({
  initial: t.name.trim().charAt(0).toUpperCase(),
  name: t.name,
  role: t.role,
  quote: t.quote,
  outcome: t.outcome,
}));

export function SectionTestimonialsV2() {
  return (
    <section className="relative border-t border-border/60 py-24 md:py-28">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 60% 70% at 50% 0%, hsl(var(--primary)/0.05), transparent 70%)",
        }}
      />

      <div className="container relative">
        <Reveal className="mx-auto mb-14 max-w-2xl text-center">
          <p
            className="mono text-[10.5px] uppercase tracking-[0.32em] text-primary/80"
            style={{ fontWeight: 500 }}
          >
            Testimonianze
          </p>
          <h2
            className="mt-4 text-balance text-3xl font-semibold tracking-tight sm:text-4xl"
            style={{ letterSpacing: "-0.025em" }}
          >
            Chi ha smesso di candidarsi a mano.
          </h2>
        </Reveal>

        <RevealStagger
          staggerDelay={0.1}
          className="mx-auto grid max-w-6xl gap-5 md:grid-cols-3"
        >
          {testimonials.map((t) => (
            <RevealItem key={t.name}>
              <motion.div
                whileHover={{ y: -4 }}
                transition={{ type: "spring", stiffness: 280, damping: 22 }}
                className="h-full p-7 ds-glass"
                style={{
                  boxShadow:
                    "0 1px 0 hsl(var(--foreground) / 0.04) inset, 0 10px 30px -12px hsl(var(--foreground) / 0.16)",
                }}
              >
                <p
                  className="text-[15px] leading-relaxed"
                  style={{ color: "var(--fg)" }}
                >
                  &ldquo;{t.quote}&rdquo;
                </p>
                {t.outcome && (
                  <div
                    className="mt-4 inline-flex items-center"
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: "hsl(var(--primary))",
                      background: "hsl(var(--primary) / 0.10)",
                      border: "1px solid hsl(var(--primary) / 0.25)",
                      borderRadius: 999,
                      padding: "4px 10px",
                      letterSpacing: "-0.005em",
                    }}
                  >
                    → {t.outcome}
                  </div>
                )}
                <div
                  className="mt-6 flex items-center gap-3 border-t border-border/50 pt-4"
                >
                  <div
                    aria-hidden
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 999,
                      background: "hsl(var(--primary) / 0.18)",
                      border: "1px solid hsl(var(--primary) / 0.45)",
                      color: "hsl(var(--primary))",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 16,
                      fontWeight: 600,
                      letterSpacing: "-0.01em",
                    }}
                  >
                    {t.initial}
                  </div>
                  <div>
                    <div style={{ fontSize: 13.5, fontWeight: 600 }}>
                      {t.name}
                    </div>
                    <div
                      style={{ fontSize: 12, color: "var(--fg-muted)", marginTop: 1 }}
                    >
                      {t.role}
                    </div>
                  </div>
                </div>
              </motion.div>
            </RevealItem>
          ))}
        </RevealStagger>
      </div>
    </section>
  );
}
