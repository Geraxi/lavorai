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
    a: "Carichi il CV, imposti ruoli + soglia di match. Un cron GitHub Actions ogni 30 minuti scansiona Greenhouse e Lever: quando trova un annuncio sopra la tua soglia, Claude riscrive CV + cover letter per quella specifica posizione, e Playwright compila il form ATS e invia. Tu vedi solo lo stato sulla dashboard.",
  },
  {
    q: "Posso candidarmi senza caricare un CV?",
    a: "No, serve un CV di partenza (PDF o DOCX). L'AI estrae il profilo strutturato (esperienze, skill, lingue) e lo riutilizza per ogni annuncio. Sul CV Builder puoi poi editare tutto.",
  },
  {
    q: "Su quali portali vi candidate davvero?",
    a: "Submit reale via Playwright su Greenhouse, Lever, Workable e BambooHR — ATS senza login pubblici, molto usati in EU. Scansione annunci anche da Adzuna (che aggrega InfoJobs, Subito e altri). LinkedIn e Indeed sono esclusi per policy: i loro ToS vietano l'automazione e il rischio di ban sull'account è concreto.",
  },
  {
    q: "Posso controllare dove candidarmi?",
    a: "Sì. Filtri su ruoli, città, RAL minima, modalità, aziende da evitare e soglia di match (es. min 75%). Tre modalità: Off (niente), Hybrid (serve il tuo ok per ogni candidatura), Auto (zero-touch). Daily cap configurabile.",
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
