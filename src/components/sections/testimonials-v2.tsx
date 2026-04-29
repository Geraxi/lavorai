"use client";

import { motion } from "motion/react";
import { Reveal, RevealItem, RevealStagger } from "@/components/reveal";

interface Testimonial {
  initial: string;
  name: string;
  role: string;
  quote: string;
}

const testimonials: Testimonial[] = [
  {
    initial: "M",
    name: "Marco R.",
    role: "Product Manager · Milano",
    quote:
      "Ho ricevuto 4 inviti a colloquio in 2 settimane. Prima ci volevano mesi di ricerca manuale.",
  },
  {
    initial: "S",
    name: "Sara T.",
    role: "UX Designer · Roma",
    quote:
      "Mi sono dimenticata che LavorAI stava girando. Ho aperto l'email e avevo 3 colloqui fissati.",
  },
  {
    initial: "L",
    name: "Luca B.",
    role: "Software Engineer · Torino",
    quote:
      "50 candidature inviate in automatico mentre dormivo. Assunto in 3 settimane.",
  },
];

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
                className="h-full rounded-2xl border border-border/70 bg-card/40 p-7 backdrop-blur-sm"
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
