"use client";

import { Target, Upload, Zap } from "lucide-react";
import { Reveal, RevealItem, RevealStagger } from "@/components/reveal";

const steps = [
  {
    n: "01",
    icon: Upload,
    title: "Carica il CV",
    text: "PDF o DOCX. Claude estrae esperienze, skill e lingue in profilo strutturato.",
  },
  {
    n: "02",
    icon: Target,
    title: "Imposta le preferenze",
    text: "Ruoli, città, RAL minima, modalità di lavoro, aziende da evitare, soglia di match.",
  },
  {
    n: "03",
    icon: Zap,
    title: "Lascia che giri",
    text: "Ogni 30 min LavorAI scansiona Greenhouse e Lever, adatta CV e cover letter, e invia.",
  },
];

export function SectionComeFunziona() {
  return (
    <section
      id="come-funziona"
      className="border-t border-border/60 py-24 md:py-32"
    >
      <div className="container">
        <Reveal className="mx-auto max-w-2xl text-center">
          <h2
            className="text-balance text-4xl font-semibold tracking-tight sm:text-5xl"
            style={{ letterSpacing: "-0.03em" }}
          >
            Come funziona.
          </h2>
          <p className="mt-5 text-lg text-muted-foreground">
            Setup una volta, tre minuti. Poi gira in background finché non lo
            metti in pausa.
          </p>
        </Reveal>

        <RevealStagger
          staggerDelay={0.1}
          className="mx-auto mt-16 grid max-w-5xl gap-6 md:grid-cols-3"
        >
          {steps.map(({ n, icon: Icon, title, text }) => (
            <RevealItem key={n}>
              <div className="h-full rounded-lg border border-border/60 bg-card p-6">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10">
                    <Icon className="h-4.5 w-4.5 text-primary" strokeWidth={2} />
                  </div>
                  <span className="font-mono text-xs text-muted-foreground">
                    {n}
                  </span>
                </div>
                <h3 className="mt-5 text-lg font-semibold tracking-tight">
                  {title}
                </h3>
                <p className="mt-2 text-[14.5px] leading-relaxed text-muted-foreground">
                  {text}
                </p>
              </div>
            </RevealItem>
          ))}
        </RevealStagger>
      </div>
    </section>
  );
}
