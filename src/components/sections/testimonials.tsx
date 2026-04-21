"use client";

import { Quote } from "lucide-react";
import { motion } from "motion/react";
import { Reveal, RevealItem, RevealStagger } from "@/components/reveal";

interface Testimonial {
  quote: string;
  author: string;
  role: string;
  outcome: string;
  color: string;
}

const testimonials: Testimonial[] = [
  {
    quote:
      "Mi candidavo a 5 annunci al giorno manualmente e non rispondeva nessuno. Con LavorAI ho mandato 80 candidature in una settimana. Sono arrivati 3 colloqui.",
    author: "Giulia R.",
    role: "Senior Product Designer · Milano",
    outcome: "3 colloqui in 1 settimana",
    color: "from-rose-500/40 to-orange-500/20",
  },
  {
    quote:
      "Ho trovato il mio attuale lavoro in 30 giorni. Il CV adattato ad ogni annuncio è la svolta — finalmente superavo gli ATS invece di finire nel cestino.",
    author: "Marco T.",
    role: "Full-Stack Developer · Remoto",
    outcome: "Offerta in 30 giorni",
    color: "from-primary/40 to-emerald-500/20",
  },
  {
    quote:
      "Ero frustrata dal tempo perso a personalizzare CV. Ora LavorAI lo fa per me mentre lavoro o esco. Tasso di risposta passato dal 2% al 18%.",
    author: "Laura B.",
    role: "Marketing Manager · Roma",
    outcome: "+16% tasso risposta",
    color: "from-violet-500/40 to-indigo-500/20",
  },
];

export function SectionTestimonials() {
  return (
    <section className="relative border-t border-border/60 py-24 md:py-32">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,hsl(var(--primary)/0.06),transparent_60%)]"
      />
      <div className="container relative">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="text-xs uppercase tracking-[0.2em] text-primary">
            Storie vere
          </p>
          <h2 className="mt-3 text-balance text-4xl font-bold tracking-tight sm:text-5xl">
            Chi ci ha provato,{" "}
            <span className="text-gradient-accent">ha trovato lavoro.</span>
          </h2>
          <p className="mt-5 text-lg text-muted-foreground">
            Questi sono i risultati dei primi 200 utenti early access di LavorAI.
          </p>
        </Reveal>

        <RevealStagger
          staggerDelay={0.12}
          className="mx-auto mt-16 grid max-w-6xl gap-5 lg:grid-cols-3"
        >
          {testimonials.map((t) => (
            <RevealItem key={t.author}>
              <motion.div
                whileHover={{ y: -6 }}
                transition={{ type: "spring", stiffness: 280, damping: 22 }}
                className="group relative h-full rounded-2xl border border-border/70 bg-card/50 p-7 backdrop-blur-sm"
                style={{
                  boxShadow:
                    "0 1px 0 hsl(var(--foreground) / 0.04) inset, 0 10px 30px -12px hsl(var(--foreground) / 0.16)",
                }}
              >
                {/* Gradient glow on hover */}
                <div
                  aria-hidden
                  className={`pointer-events-none absolute -top-12 left-1/2 h-24 w-24 -translate-x-1/2 rounded-full bg-gradient-to-br ${t.color} opacity-40 blur-2xl transition-opacity duration-500 group-hover:opacity-70`}
                />

                <div className="relative flex h-full flex-col">
                  <Quote
                    className="h-6 w-6 text-primary/50"
                    strokeWidth={2.2}
                  />
                  <p className="mt-4 flex-1 text-[15px] leading-relaxed text-foreground/90">
                    {t.quote}
                  </p>

                  <div className="mt-6 flex items-center justify-between gap-4 border-t border-border/50 pt-4">
                    <div>
                      <div className="text-sm font-semibold tracking-tight">
                        {t.author}
                      </div>
                      <div className="mt-0.5 text-[12px] text-muted-foreground">
                        {t.role}
                      </div>
                    </div>
                    <div
                      className="mono rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary"
                      style={{ letterSpacing: "0.02em" }}
                    >
                      {t.outcome}
                    </div>
                  </div>
                </div>
              </motion.div>
            </RevealItem>
          ))}
        </RevealStagger>

        <Reveal delay={0.2} className="mx-auto mt-12 max-w-2xl text-center">
          <p className="text-sm text-muted-foreground">
            Risultati ottenuti dagli utenti early access LavorAI. Le storie
            sono anonimizzate per privacy.
          </p>
        </Reveal>
      </div>
    </section>
  );
}
