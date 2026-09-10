import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Informativa privacy",
  alternates: { canonical: "/privacy" },
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
        <h1 className="text-4xl font-bold tracking-tight">Informativa privacy</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Informativa ai sensi degli artt. 13 e 14 del Regolamento (UE) 2016/679.
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
                <strong>Annunci di lavoro</strong>: testi degli annunci raccolti
                da fonti pubbliche (pagine carriera delle aziende su Greenhouse,
                Lever, Ashby, Workable e altri ATS; board come Adzuna, EURES,
                Remotive) o incollati dall&apos;utente.
              </li>
              <li>
                <strong>Dati di candidatura</strong>: le informazioni che
                inseriamo nei form delle aziende al posto tuo (contatti, CV,
                lettera, risposte standard come disponibilità e autorizzazione
                al lavoro). Non chiediamo né conserviamo credenziali di portali
                terzi: l&apos;auto-apply avviene sui form pubblici degli ATS.
              </li>
              <li>
                <strong>Metadati candidature</strong>: job a cui ti candidi,
                stato invio, timestamp, eventuali errori.
              </li>
              <li>
                <strong>Email</strong> per notifiche di stato candidatura e, se
                attivi la Inbox, le risposte dei recruiter ricevute
                all&apos;indirizzo di inoltro dedicato alla tua candidatura.
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
                prima di attivare l&apos;invio automatico delle candidature.
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
                <strong>Vercel Inc.</strong> — hosting dell&apos;applicazione web,
                funzioni in region Francoforte (UE)
              </li>
              <li>
                <strong>Neon Inc.</strong> — database Postgres, region
                Francoforte (UE)
              </li>
              <li>
                <strong>Railway Corp.</strong> — esecuzione del worker che
                compila e invia le candidature
              </li>
              <li>
                <strong>Anthropic PBC</strong> e <strong>OpenAI</strong> —
                elaborazione AI di CV, lettere e risposte ai form tramite API;
                i dati inviati non sono usati per l&apos;addestramento dei modelli
              </li>
              <li>
                <strong>Resend</strong> — invio e ricezione delle email
                transazionali e delle risposte dei recruiter
              </li>
              <li>
                <strong>Stripe</strong> — pagamenti; LavorAI non conserva i dati
                della carta
              </li>
              <li>
                <strong>Upstash</strong> — code di lavoro e rate limiting
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold">5. Periodo di conservazione</h2>
            <ul className="ml-5 list-disc space-y-2">
              <li>CV e testi generati: 90 giorni dall&apos;ultima candidatura</li>
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
                Cancellarli — diritto all&apos;oblio (art. 17), anche in
                autonomia dalle Impostazioni: la cancellazione dell&apos;account
                elimina profilo, CV, file e candidature
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
              Tutti i dati sono cifrati in transito (TLS) e a riposo presso i
              fornitori indicati. Le password sono salvate solo come hash. I
              dati sensibili eventualmente memorizzati sono cifrati con
              AES-256-GCM prima del salvataggio. L&apos;accesso al database è
              limitato al titolare.
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
            Ultimo aggiornamento: 10 settembre 2026.
          </p>
        </div>
      </main>
    </div>
  );
}
