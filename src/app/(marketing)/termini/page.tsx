import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Termini di servizio",
  description:
    "Termini e condizioni di LavorAI, inclusi i termini per la funzionalità di auto-apply sui portali di lavoro.",
  alternates: { canonical: "/termini" },
};

export default function TerminiPage() {
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
        <h1 className="text-4xl font-bold tracking-tight">Termini di servizio</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Condizioni generali di utilizzo della piattaforma LavorAI.
        </p>

        <div className="prose prose-invert mt-8 max-w-none space-y-6 text-sm leading-relaxed text-foreground/90">
          <section>
            <h2 className="text-xl font-semibold">1. Oggetto del servizio</h2>
            <p>
              LavorAI ({`"`}noi{`"`}, {`"`}la piattaforma{`"`}) è un SaaS italiano
              che ottimizza CV e lettere motivazionali per specifici annunci di
              lavoro tramite intelligenza artificiale, e offre una funzionalità
              opzionale di invio automatico delle candidature ({`"`}auto-apply{`"`}) sui
              portali carriera delle aziende basati su ATS supportati
              (Greenhouse, Lever, Ashby, Workable, Breezy, Pinpoint, Personio e
              altri) e via email al recruiter, quando l&apos;annuncio lo prevede.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">
              2. Auto-apply: come funziona e cosa autorizzi
            </h2>
            <p>
              Attivando l&apos;auto-apply, ci autorizzi espressamente a usare i
              dati del profilo, il CV e le preferenze che hai inserito per:
            </p>
            <ul className="ml-5 list-disc space-y-2">
              <li>
                individuare offerte compatibili sulle fonti supportate e
                preparare una candidatura su misura
              </li>
              <li>
                generare o adattare CV e lettera di presentazione per lo
                specifico annuncio
              </li>
              <li>
                compilare e inviare, secondo la modalità scelta, i form
                pubblici dei sistemi ATS supportati
              </li>
              <li>
                registrare lo stato tecnico e la prova di consegna disponibile
                per ogni invio nella tua dashboard
              </li>
            </ul>
            <p>
              LavorAI non chiede, non conserva e non usa password, cookie di
              sessione o credenziali dei tuoi account LinkedIn, Indeed o di
              altri portali. Per le fonti che richiedono un accesso personale,
              l&apos;utente completa la candidatura sul sito originale.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">
              3. Rischi e limiti che accetti
            </h2>
            <p>
              I form e le politiche delle aziende possono cambiare senza
              preavviso. Riconosci e accetti che:
            </p>
            <ul className="ml-5 list-disc space-y-2">
              <li>
                alcune offerte potrebbero non essere candidabili in automatico
                o potrebbero richiedere un passaggio manuale
              </li>
              <li>
                la consegna di una candidatura non garantisce un colloquio,
                una risposta o un&apos;offerta di lavoro
              </li>
              <li>
                sei responsabile dell&apos;accuratezza delle informazioni del tuo
                profilo e dei documenti che autorizzi a inviare
              </li>
              <li>
                puoi mettere in pausa l&apos;auto-apply o cambiare la modalità in
                qualsiasi momento dalle impostazioni del tuo account
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold">
              4. Manleva e limitazioni di responsabilità
            </h2>
            <p>
              Nei limiti consentiti dalla legge applicabile, LavorAI non
              garantisce:
            </p>
            <ul className="ml-5 list-disc space-y-2">
              <li>
                che tutte le fonti terze rimangano disponibili o mantengano lo
                stesso modulo di candidatura
              </li>
              <li>
                risultati di selezione, tempi di risposta o decisioni dei
                recruiter e delle aziende
              </li>
              <li>
                Contenuti generati dall&apos;intelligenza artificiale che dovessero
                contenere inesattezze: nella modalità Hybrid puoi rivedere ogni
                candidatura prima dell&apos;invio
              </li>
            </ul>
            <p>
              Puoi disabilitare l&apos;auto-apply in ogni momento. Per assistenza o
              per segnalare un invio da verificare, contattaci prima di
              proseguire con nuove candidature.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">5. Piani e pagamento</h2>
            <p>
              LavorAI offre una prova Pro gratuita di 7 giorni, senza carta e
              senza rinnovo automatico, che inizia quando crei il tuo account.
              La prova include al massimo 20 candidature totali. Al termine, le funzionalità sono bloccate finché non scegli
              Pro (€19,99/mese, 50 candidature) o Pro+ (€39,99/mese,
              candidature illimitate). Prima di qualsiasi acquisto Stripe
              mostra prezzo e condizioni; puoi gestire o cancellare
              l&apos;abbonamento dal portale Stripe.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">6. Contatti</h2>
            <p>
              Per domande: <a href="mailto:hello@lavorai.it">hello@lavorai.it</a>.
              Fondatore italiano — dati processati in UE (Frankfurt).
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">7. Modifiche</h2>
            <p>
              Ci riserviamo il diritto di aggiornare questi termini. Le modifiche
              sostanziali verranno notificate via email almeno 30 giorni prima
              dell&apos;entrata in vigore.
            </p>
          </section>

          <p className="text-xs text-muted-foreground">
            Ultimo aggiornamento: 15 settembre 2026.
          </p>
        </div>
      </main>
    </div>
  );
}
