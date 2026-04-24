"use client";

import { Target, Upload, Zap, ArrowRight } from "lucide-react";
import { motion } from "motion/react";
import { Reveal, RevealItem, RevealStagger } from "@/components/reveal";

// Triade Prepara → Candidati → Monitora, descritta sul funzionamento
// reale della pipeline (CV extraction → auto-apply cron → tracking pixel).
const steps = [
  {
    n: "01",
    icon: Upload,
    title: "Prepara",
    text: "Carichi il CV (PDF/DOCX). Claude lo destruttura in profilo: esperienze, skill, lingue. Scegli ruoli, città, RAL minima e soglia di match.",
    meta: "≈3 min",
  },
  {
    n: "02",
    icon: Target,
    title: "Candidati",
    text: "Ogni 30 minuti LavorAI trova nuovi annunci su Greenhouse e Lever che superano la tua soglia, riscrive CV + cover letter e invia direttamente sul form ATS.",
    meta: "24/7",
  },
  {
    n: "03",
    icon: Zap,
    title: "Monitora",
    text: "Nella dashboard vedi stato in tempo reale, match score, data di apertura della mail da parte del recruiter. Pausa una sessione quando basta.",
    meta: "Live",
  },
];

export function SectionComeFunziona() {
  return (
    <section
      id="come-funziona"
      className="relative border-t border-border/60 py-24 md:py-32"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,hsl(var(--primary)/0.07),transparent_60%)]"
      />

      <div className="container relative">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="text-xs uppercase tracking-[0.2em] text-primary">
            Come funziona
          </p>
          <h2 className="mt-3 text-balance text-4xl font-bold tracking-tight sm:text-5xl">
            Prepara, candidati,{" "}
            <span className="text-gradient-accent">monitora.</span>
          </h2>
          <p className="mt-5 text-lg text-muted-foreground">
            Un unico copilota per ogni fase: dal primo CV al colloquio finale.
          </p>
        </Reveal>

        <RevealStagger
          staggerDelay={0.12}
          className="relative mt-20 grid gap-6 md:grid-cols-3 md:gap-4"
        >
          {steps.map(({ n, icon: Icon, title, text, meta }, i) => (
            <RevealItem key={n}>
              <div className="relative flex items-stretch">
                <StepCard
                  n={n}
                  icon={Icon}
                  title={title}
                  text={text}
                  meta={meta}
                />
                {i < steps.length - 1 && <Connector />}
              </div>
            </RevealItem>
          ))}
        </RevealStagger>
      </div>
    </section>
  );
}

function StepCard({
  n,
  icon: Icon,
  title,
  text,
  meta,
}: {
  n: string;
  icon: React.ElementType;
  title: string;
  text: string;
  meta: string;
}) {
  return (
    <motion.div
      whileHover={{ y: -6 }}
      transition={{ type: "spring", stiffness: 300, damping: 22 }}
      className="group relative w-full overflow-hidden rounded-2xl border border-border/70 bg-card/40 p-7 backdrop-blur-sm"
      style={{
        boxShadow:
          "0 1px 0 hsl(var(--foreground) / 0.04) inset, 0 10px 30px -12px hsl(var(--foreground) / 0.18)",
      }}
    >
      {/* Gradient border on hover */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-2xl opacity-0 transition-opacity duration-500 group-hover:opacity-100"
        style={{
          background:
            "linear-gradient(135deg, hsl(var(--primary)/0.35), transparent 40%, hsl(var(--primary)/0.15))",
          padding: 1,
          WebkitMask:
            "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
          WebkitMaskComposite: "xor",
          maskComposite: "exclude",
        }}
      />

      {/* Icon orb */}
      <div className="relative">
        <div
          aria-hidden
          className="absolute -inset-4 rounded-full opacity-60 blur-2xl transition-all duration-500 group-hover:opacity-100 group-hover:blur-3xl"
          style={{
            background:
              "radial-gradient(circle, hsl(var(--primary) / 0.35), transparent 70%)",
          }}
        />
        <motion.div
          whileHover={{ rotate: 6, scale: 1.05 }}
          transition={{ type: "spring", stiffness: 300, damping: 18 }}
          className="relative flex h-14 w-14 items-center justify-center rounded-2xl border border-primary/40"
          style={{
            background:
              "linear-gradient(145deg, hsl(var(--primary) / 0.22), hsl(var(--primary) / 0.05))",
            boxShadow:
              "0 1px 0 hsl(var(--primary) / 0.25) inset, 0 8px 20px -6px hsl(var(--primary) / 0.35)",
          }}
        >
          <Icon className="h-6 w-6 text-primary" strokeWidth={2.2} />
        </motion.div>
      </div>

      {/* Content */}
      <div className="relative mt-6">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
            Step {n}
          </span>
          <span
            className="rounded-full border border-border/60 bg-background/40 px-2 py-0.5 font-mono text-[10px] text-muted-foreground"
            style={{ letterSpacing: "0.04em" }}
          >
            {meta}
          </span>
        </div>
        <h3 className="mt-3 text-xl font-semibold tracking-tight">{title}</h3>
        <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground">
          {text}
        </p>
      </div>
    </motion.div>
  );
}

function Connector() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute top-1/2 z-10 hidden -translate-y-1/2 md:flex"
      style={{ right: -22 }}
    >
      <motion.div
        initial={{ opacity: 0, x: -6 }}
        whileInView={{ opacity: 1, x: 0 }}
        viewport={{ once: true, amount: 0.6 }}
        transition={{ duration: 0.5, delay: 0.3 }}
        className="flex h-11 w-11 items-center justify-center rounded-full border border-primary/30 bg-background shadow-[0_4px_16px_-4px_hsl(var(--primary)/0.4)]"
      >
        <motion.span
          animate={{ x: [0, 3, 0] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
          className="text-primary"
        >
          <ArrowRight className="h-4 w-4" strokeWidth={2.5} />
        </motion.span>
      </motion.div>
    </div>
  );
}
