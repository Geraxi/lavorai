import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "Informativa privacy di LavorAI. Come gestiamo i dati personali, i cookie dei portali terzi, e i diritti GDPR.",
};

export default function PrivacyPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="border-b border-border/60">
        <div className="container flex h-16 items-center justify-between">
          <Logo size="md" />
          <Button asChild variant="ghost" size="sm">
            <Link href="/">← Torna alla home</Link>
          </Button>
        </div>
      </header>
      <main className="container max-w-3xl py-12">
        <h1 className="text-4xl font-bold tracking-tight">Privacy Policy</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Versione draft Sprint 4 — non è definitiva. Revisione legale prima del
          launch pubblico.
        </p>

        <div className="prose prose-invert mt-8 max-w-none space-y-6 text-sm leading-relaxed text-foreground/90">
          <section>
            <h2 className="text-xl font-semibold">1. Titolare del trattamento</h2>
            <p>
              LavorAI, fondatore Umberto Geraci. Per domande e richieste di
              esercizio dei diritti: <a href="mailto:privacy@lavorai.it">privacy@lavorai.it</a>.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">2. Dati trattati</h2>
            <ul className="ml-5 list-disc space-y-2">
              <li>
                <strong>Dati del CV</strong>: nome, contatti, esperienze,
                formazione, skill presenti nel file che carichi. Usati solo per
                generare CV ottimizzati.
              </li>
              <li>
                <strong>Annunci di lavoro</strong>: testi degli annunci ricevuti
                dalle fonti pubbliche (Adzuna) o incollati dall&apos;utente.
              </li>
              <li>
                <strong>Cookie di sessione dei portali terzi</strong>: quando
                attivi l&apos;auto-apply, memorizziamo cifrati AES-256-GCM i cookie
                della tua sessione su InfoJobs, LinkedIn, Indeed o Subito. Non
                vediamo mai la tua password.
              </li>
              <li>
                <strong>Metadati candidature</strong>: job a cui ti candidi,
                stato invio, timestamp, eventuali errori.
              </li>
              <li>
                <strong>Email</strong> per notifiche di stato candidatura.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold">3. Finalità e base giuridica</h2>
            <ul className="ml-5 list-disc space-y-2">
              <li>
                <strong>Esecuzione del contratto (art. 6.1.b GDPR)</strong>:
                fornire il servizio di ottimizzazione CV e auto-apply.
              </li>
              <li>
                <strong>Consenso esplicito (art. 6.1.a GDPR)</strong>: richiesto
                prima di attivare l&apos;auto-apply su ogni portale terzo.
              </li>
              <li>
                <strong>Legittimo interesse (art. 6.1.f GDPR)</strong>: logging
                tecnico per sicurezza e miglioramento del servizio.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold">4. Sotto-responsabili del trattamento</h2>
            <ul className="ml-5 list-disc space-y-2">
              <li>
                <strong>Vercel Inc.</strong> — hosting applicazione, region
                Frankfurt (UE)
              </li>
              <li>
                <strong>Anthropic PBC</strong> — elaborazione AI del CV, con
                politica di zero-retention (i dati inviati non sono usati per
                training)
              </li>
              <li>
                <strong>Resend</strong> — invio email transazionali, region UE
              </li>
              <li>
                <strong>Stripe</strong> — pagamenti, region UE/USA con SCC
              </li>
              <li>
                <strong>Supabase</strong> (prossimo Sprint) — database, region
                Frankfurt (UE)
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold">5. Periodo di conservazione</h2>
            <ul className="ml-5 list-disc space-y-2">
              <li>CV e testi generati: 90 giorni dall&apos;ultima candidatura</li>
              <li>
                Cookie di sessione portali: fino a 30 giorni di inattività o
                revoca esplicita
              </li>
              <li>
                Metadati candidature (job, stato, timestamp): 12 mesi per
                permettere analisi del tuo percorso
              </li>
              <li>
                Account: fino a 24 mesi dall&apos;ultimo login, poi cancellazione
                automatica
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold">6. I tuoi diritti (Capo III GDPR)</h2>
            <p>In qualsiasi momento puoi:</p>
            <ul className="ml-5 list-disc space-y-2">
              <li>Accedere ai tuoi dati (art. 15)</li>
              <li>Rettificarli (art. 16)</li>
              <li>
                Cancellarli — diritto all&apos;oblio (art. 17), anche via
                auto-cancellazione delle sessioni portale
              </li>
              <li>Limitarne il trattamento (art. 18)</li>
              <li>Esportarli in formato strutturato (art. 20)</li>
              <li>Opporti al trattamento (art. 21)</li>
              <li>
                Reclamo al Garante privacy italiano:{" "}
                <a
                  href="https://www.garanteprivacy.it"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  garanteprivacy.it
                </a>
              </li>
            </ul>
            <p>
              Per esercitare i diritti: <a href="mailto:privacy@lavorai.it">privacy@lavorai.it</a>.
              Risposta entro 30 giorni.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">7. Sicurezza</h2>
            <p>
              Tutti i dati sono crittografati in transito (TLS 1.3) e at-rest.
              I cookie di sessione dei portali sono cifrati con AES-256-GCM
              prima del salvataggio in database. La chiave di cifratura è
              ruotata annualmente. Accesso ai dati limitato al fondatore tramite
              autenticazione multi-fattore.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">8. Data breach</h2>
            <p>
              In caso di violazione, notificheremo al Garante entro 72 ore come
              richiesto dall&apos;art. 33 GDPR, e agli utenti interessati senza
              ritardo se la violazione comporta rischio elevato.
            </p>
          </section>

          <p className="text-xs text-muted-foreground">
            Ultimo aggiornamento: 18 aprile 2026 — draft interno.
          </p>
        </div>
      </main>
    </div>
  );
}
