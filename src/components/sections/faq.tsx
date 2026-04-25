"use client";

import Link from "next/link";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Reveal } from "@/components/reveal";

const faq = [
  {
    q: "Si candida davvero per me, in automatico?",
    a: "Sì. Imposti ruoli, città, soglia di match. Ogni 30 minuti LavorAI scansiona gli annunci freschi: quando ne trova uno compatibile, riscrive CV e cover letter per quella posizione e invia direttamente sul form ATS dell'azienda. Tu vedi solo lo stato e ricevi gli inviti ai colloqui.",
  },
  {
    q: "Mi serve il login a LinkedIn / Indeed / altri profili?",
    a: "No, mai. Non chiediamo né conserviamo credenziali di portali. Compiliamo solo form pubblici di Greenhouse, Lever e Workable — gli stessi che riempiresti tu cliccando \"Apply\". Nessun rischio di ban sui tuoi account.",
  },
  {
    q: "Devo scrivere io le cover letter?",
    a: "No. Vengono generate automaticamente in italiano nativo, su misura per ogni annuncio. In modalità ibrida puoi rivedere ogni candidatura prima dell'invio; in modalità auto parte tutto da solo.",
  },
  {
    q: "Posso decidere dove candidarmi?",
    a: "Sì. Filtri precisi su ruoli, città, RAL minima, dipendente vs P.IVA, aziende da escludere, soglia di match. Tre modalità: Off (nessun invio), Hybrid (chiede ok prima di ogni invio), Auto (zero-touch). Cambio in un click dalle preferenze.",
  },
  {
    q: "Ricevo solo gli inviti ai colloqui?",
    a: "Esatto. La dashboard mostra in tempo reale lo stato delle candidature (in coda, in invio, inviata, vista). Ricevi notifica solo quando un recruiter risponde — nient'altro.",
  },
  {
    q: "Posso annullare in qualsiasi momento?",
    a: "Sì, con un click. Nessun vincolo, nessuna penale, nessuna domanda. Pausa l'auto-apply quando vuoi e riavvialo quando ti serve.",
  },
  {
    q: "Cosa succede ai miei dati?",
    a: "Stanno su server europei (Neon · Frankfurt), GDPR-first. Export integrale in JSON e cancellazione completa con un click — pulisce profilo, CV, file, code di lavoro. Non vendiamo nulla, non condividiamo con nessuno.",
  },
];

export function SectionFaq() {
  return (
    <section id="faq" className="relative border-t border-border/60 py-24 md:py-32">
      <div className="container">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="text-xs uppercase tracking-[0.2em] text-primary">FAQ</p>
          <h2 className="mt-3 text-balance text-4xl font-bold tracking-tight sm:text-5xl">
            Domande frequenti
          </h2>
          <p className="mt-5 text-lg text-muted-foreground">
            Se non trovi la risposta,{" "}
            <Link
              href="/contatti"
              className="text-foreground underline-offset-4 hover:underline"
            >
              scrivici
            </Link>
            .
          </p>
        </Reveal>

        <Reveal delay={0.1} className="mx-auto mt-14 max-w-3xl">
          <div className="rounded-2xl border border-border/60 bg-card/40 p-2 backdrop-blur">
            <Accordion type="single" collapsible className="w-full">
              {faq.map(({ q, a }, i) => (
                <AccordionItem
                  key={q}
                  value={`item-${i}`}
                  className="border-border/60 px-4"
                >
                  <AccordionTrigger className="text-left text-base font-medium hover:no-underline [&[data-state=open]]:text-primary">
                    {q}
                  </AccordionTrigger>
                  <AccordionContent className="text-base leading-relaxed text-muted-foreground">
                    {a}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
