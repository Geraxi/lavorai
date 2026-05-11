"use client";

import { Check } from "lucide-react";
import { Reveal, RevealItem, RevealStagger } from "@/components/reveal";

const vantaggi = [
  {
    title: "Candidature automatiche 24/7",
    detail: "LavorAI candida per te mentre dormi, su portali italiani e internazionali.",
  },
  {
    title: "CV generato dall'AI oppure il tuo",
    detail: "Carica il PDF/DOCX o parti da zero: l'AI costruisce un CV ATS-friendly partendo dal tuo profilo.",
  },
  {
    title: "Preferenze granulari",
    detail: "Ruoli, città, RAL, remoto/ibrido, seniority, aziende da evitare. Candida solo ai match giusti.",
  },
  {
    title: "Lettera motivazionale in italiano nativo",
    detail: "Adattata ad ogni annuncio · non tradotta dall'inglese.",
  },
  {
    title: "Nessun credito nascosto",
    detail: "€19 e candidature illimitate. Cancelli in un click.",
  },
  {
    title: "Fondatore italiano, dati in UE",
    detail: "Supporto diretto in italiano, hosting e DB in Europa (Vercel Frankfurt).",
  },
];

export function SectionPerche() {
  return (
    <section
      id="perche"
      className="relative border-t border-border/60 py-24 md:py-32"
    >
      <div className="container">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="text-xs uppercase tracking-[0.2em] text-primary">
            Perché LavorAI
          </p>
          <h2 className="mt-3 text-balance text-4xl font-bold tracking-tight sm:text-5xl">
            Pensato per chi cerca lavoro{" "}
            <span className="text-gradient-accent">in italiano.</span>
          </h2>
          <p className="mt-5 text-lg text-muted-foreground">
            Nato in Italia, non tradotto da un tool americano.
          </p>
        </Reveal>

        <RevealStagger className="mx-auto mt-16 grid max-w-5xl gap-4 sm:grid-cols-2">
          {vantaggi.map((v) => (
            <RevealItem key={v.title}>
              <div className="card-hover-glow group flex gap-4 rounded-xl border border-border/60 bg-card/60 p-5 backdrop-blur">
                <div className="flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-primary/15 ring-1 ring-primary/25">
                  <Check className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <div className="font-semibold tracking-tight">{v.title}</div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    {v.detail}
                  </div>
                </div>
              </div>
            </RevealItem>
          ))}
        </RevealStagger>
      </div>
    </section>
  );
}
