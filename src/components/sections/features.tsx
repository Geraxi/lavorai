"use client";

import {
  Zap,
  FileText,
  Mail,
  BarChart3,
  Sparkles,
  Target,
  type LucideIcon,
} from "lucide-react";
import { motion } from "motion/react";
import { Reveal, RevealItem, RevealStagger } from "@/components/reveal";

interface Feature {
  icon: LucideIcon;
  title: string;
  body: string;
}

const features: Feature[] = [
  {
    icon: Zap,
    title: "Auto-apply in background",
    body: "Un cron controlla i nuovi annunci ogni 30 minuti e invia le candidature che matchano. Non devi essere online.",
  },
  {
    icon: FileText,
    title: "CV riscritto per annuncio",
    body: "Claude adatta bullet, keyword e summary al testo della posizione. Output DOCX e PDF ATS-compatibili.",
  },
  {
    icon: Mail,
    title: "Cover letter in italiano",
    body: "Scritta in italiano nativo, non tradotta. Lunghezza e tono modulati sul ruolo e sull&apos;azienda.",
  },
  {
    icon: Target,
    title: "Submit diretto su ATS",
    body: "Playwright compila e invia direttamente su Greenhouse, Lever e Workable. Niente reindirizzamenti manuali.",
  },
  {
    icon: BarChart3,
    title: "Tracker reale",
    body: "Pixel di apertura via Resend + webhook. Vedi quando il recruiter apre l&apos;email, non statistiche inventate.",
  },
  {
    icon: Sparkles,
    title: "Filtri precisi",
    body: "Ruoli, città, RAL minima, aziende da escludere, soglia di match. Le candidature partono solo dove ha senso.",
  },
];

export function SectionFeatures() {
  return (
    <section
      id="features"
      className="relative border-t border-border/60 py-24 md:py-32"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,hsl(var(--primary)/0.05),transparent_60%)]"
      />
      <div className="container relative">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="text-xs uppercase tracking-[0.2em] text-primary">
            Cosa puoi fare
          </p>
          <h2 className="mt-3 text-balance text-4xl font-semibold tracking-tight sm:text-5xl" style={{ letterSpacing: "-0.03em" }}>
            Cosa fa, in pratica.
          </h2>
          <p className="mt-5 text-lg text-muted-foreground">
            CV builder, cover letter, ATS optimizer, auto-apply e tracking.
            Tutto in un&apos;app, senza saltare da un sito all&apos;altro.
          </p>
        </Reveal>

        <RevealStagger
          staggerDelay={0.08}
          className="mx-auto mt-16 grid max-w-6xl gap-5 sm:grid-cols-2 lg:grid-cols-3"
        >
          {features.map(({ icon: Icon, title, body }) => (
            <RevealItem key={title}>
              <div className="group relative h-full rounded-lg border border-border/60 bg-card p-6 transition-colors hover:border-border">
                <div className="relative">
                  <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10">
                    <Icon className="h-5 w-5 text-primary" strokeWidth={2} />
                  </div>
                  <h3 className="mt-5 text-xl font-semibold tracking-tight">
                    {title}
                  </h3>
                  <p className="mt-2.5 text-[14.5px] leading-relaxed text-muted-foreground">
                    {body}
                  </p>
                </div>
              </div>
            </RevealItem>
          ))}
        </RevealStagger>
      </div>
    </section>
  );
}
