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
    q: "Come funziona l'auto-candidatura?",
    a: "Carichi il CV (o lo crei da zero con l'AI), imposti le preferenze (ruoli, città, RAL, modalità), e LavorAI scansiona i portali 24/7. Quando trova un match, adatta CV + cover letter all'annuncio e invia la candidatura per te. Tu ricevi solo le risposte dei recruiter.",
  },
  {
    q: "Non ho un CV — posso crearlo sulla piattaforma?",
    a: "Sì. Inserisci il tuo LinkedIn (o fornisci esperienze/competenze a testo libero) e l'AI ti costruisce un CV ATS-friendly in formato DOCX/PDF pronto all'uso.",
  },
  {
    q: "Su quali portali vi candidate?",
    a: "InfoJobs, LinkedIn, Indeed, Subito Lavoro, Monster e diversi portali verticali italiani + internazionali. L'elenco cresce costantemente.",
  },
  {
    q: "Posso controllare dove candidarmi?",
    a: "Sì. Imposti filtri su ruoli, sedi, RAL minima, modalità (remoto/ibrido/in sede), seniority e aziende da evitare. LavorAI candida solo ai match che rispettano i tuoi criteri.",
  },
  {
    q: "Cos'è un ATS e perché conta?",
    a: "ATS (Applicant Tracking System) sono software usati dall'80% delle aziende medio-grandi per filtrare CV prima del recruiter umano. Ogni CV generato da LavorAI è ottimizzato per passare questi filtri.",
  },
  {
    q: "Il mio CV viene condiviso con qualcuno?",
    a: "No. I dati sono processati solo per generare candidature tue. Non vendiamo né condividiamo nulla. Puoi esportare o cancellare tutto in un click dalle impostazioni.",
  },
  {
    q: "Posso cancellare l'abbonamento in qualsiasi momento?",
    a: "Sì, con un click dal tuo account. Nessun vincolo, nessuna penale.",
  },
  {
    q: "Come gestite i miei dati personali?",
    a: "GDPR-compliant. Dati crittografati at-rest, hosting in UE. Export JSON + cancellazione account disponibili dalle impostazioni.",
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
