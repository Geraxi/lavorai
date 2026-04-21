import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Termini di servizio",
  description:
    "Termini e condizioni di LavorAI, inclusi i termini per la funzionalità di auto-apply sui portali di lavoro.",
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
          Versione draft Sprint 4 — non è una versione definitiva. Prima del
          launch pubblico verrà revisionata da un legale.
        </p>

        <div className="prose prose-invert mt-8 max-w-none space-y-6 text-sm leading-relaxed text-foreground/90">
          <section>
            <h2 className="text-xl font-semibold">1. Oggetto del servizio</h2>
            <p>
              LavorAI ({`"`}noi{`"`}, {`"`}la piattaforma{`"`}) è un SaaS italiano
              che ottimizza CV e lettere motivazionali per specifici annunci di
              lavoro tramite intelligenza artificiale, e offre una funzionalità
              opzionale di invio automatico delle candidature ({`"`}auto-apply{`"`}) sui
              portali di ricerca lavoro supportati (InfoJobs, LinkedIn, Indeed,
              Subito Lavoro).
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">
              2. Auto-apply: come funziona e cosa autorizzi
            </h2>
            <p>
              Attivando l&apos;auto-apply su un portale, ci autorizzi espressamente a:
            </p>
            <ul className="ml-5 list-disc space-y-2">
              <li>
                Memorizzare, in forma cifrata (AES-256-GCM), il cookie di
                sessione del tuo account su quel portale
              </li>
              <li>
                Utilizzare il tuo account per navigare le pagine di annuncio e
                compilare/inviare form di candidatura per tuo conto
              </li>
              <li>
                Allegare automaticamente il CV e la lettera motivazionale
                generati da LavorAI
              </li>
              <li>
                Conservare uno screenshot di conferma come prova dell&apos;invio
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold">
              3. Rischi e limiti che accetti
            </h2>
            <p>
              Le politiche dei portali di lavoro terzi (LinkedIn, InfoJobs,
              Indeed, Subito) possono vietare l&apos;uso di strumenti automatizzati
              per inviare candidature. Riconosci e accetti che:
            </p>
            <ul className="ml-5 list-disc space-y-2">
              <li>
                Il tuo account sul portale può essere sospeso, limitato o
                disattivato dal portale stesso per uso non conforme alle loro
                condizioni d&apos;uso
              </li>
              <li>
                LavorAI non è responsabile di eventuali conseguenze derivanti
                dall&apos;uso della funzionalità auto-apply, inclusi ma non
                limitati a: ban dell&apos;account, perdita di accesso, mancata
                ricezione della candidatura da parte dell&apos;azienda
              </li>
              <li>
                Ti impegni a non usare l&apos;auto-apply in modo da violare le
                condizioni d&apos;uso dei portali terzi
              </li>
              <li>
                Puoi revocare la tua autorizzazione in qualsiasi momento dalle
                impostazioni del tuo account, che comporterà la cancellazione
                immediata dei cookie memorizzati
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold">
              4. Manleva e limitazioni di responsabilità
            </h2>
            <p>
              Nella misura massima consentita dalla legge italiana applicabile
              (inclusa la Parte III del Codice del Consumo), LavorAI non sarà
              responsabile di:
            </p>
            <ul className="ml-5 list-disc space-y-2">
              <li>
                Azioni o omissioni dei portali terzi, inclusi modifiche delle
                loro policy, UI, o API che rendano l&apos;auto-apply temporaneamente
                o permanentemente inutilizzabile
              </li>
              <li>
                Perdite economiche indirette, perdita di opportunità di lavoro o
                danni reputazionali derivanti dall&apos;uso della piattaforma
              </li>
              <li>
                Contenuti generati dall&apos;intelligenza artificiale che dovessero
                contenere inesattezze, pur avendo impostato il sistema per
                evitare fabbricazioni
              </li>
            </ul>
            <p>
              L&apos;utente ha sempre l&apos;ultima responsabilità di revisionare CV e
              lettera prima dell&apos;invio e può disabilitare l&apos;auto-apply in ogni
              momento.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">5. Piani e pagamento</h2>
            <p>
              LavorAI offre un piano Free (3 candidature totali) e un piano Pro
              (€19/mese, candidature illimitate). Nessun credito nascosto.
              Cancellabile in qualsiasi momento dal portale Stripe.
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
            Ultimo aggiornamento: 18 aprile 2026 — draft interno.
          </p>
        </div>
      </main>
    </div>
  );
}
