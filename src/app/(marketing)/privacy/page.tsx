import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { CookieSettingsLink } from "@/components/cookie-settings-link";

export const metadata: Metadata = {
  title: "Informativa privacy",
  alternates: { canonical: "/privacy" },
  description:
    "Informativa privacy di LavorAI. Come gestiamo i dati personali, i cookie (incluso Meta Pixel), e i diritti GDPR.",
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
              <li>
                <strong>Consenso (art. 6.1.a GDPR e art. 122 Codice
                Privacy)</strong>: cookie e strumenti facoltativi di analisi e
                pubblicità, incluso Meta Pixel (vedi sezione 5).
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

          <section id="cookie">
            <h2 className="text-xl font-semibold">5. Cookie, analisi e pubblicità (Meta Pixel)</h2>
            <p>
              Usiamo cookie tecnici necessari per accesso, sicurezza e lingua.
              Gli strumenti facoltativi si attivano solo secondo le tue scelte,
              separate per finalità:
            </p>
            <ul className="ml-5 list-disc space-y-2">
              <li>
                <strong>Analisi</strong>: Google Analytics, per misurare in
                forma aggregata l&apos;uso del sito.
              </li>
              <li>
                <strong>Pubblicità</strong>: <strong>Meta Pixel</strong> di
                Meta Platforms Ireland Ltd (&quot;Meta&quot;) e Google Ads, per
                misurare le registrazioni generate dai nostri annunci e
                ottimizzare le campagne pubblicitarie.
              </li>
            </ul>
            <p>
              <strong>Dati inviati a Meta</strong> (solo con il consenso
              pubblicità): l&apos;evento (visualizzazione di pagina e, una sola
              volta, il completamento della registrazione con un identificativo
              casuale dell&apos;evento), dati tecnici di dispositivo e browser,
              la pagina visitata e i cookie pubblicitari di Meta (es.
              <code> _fbp</code>, <code>_fbc</code>). Non inviamo a Meta nome,
              email, telefono né altri dati di contatto, e{" "}
              <strong>i dati del CV e delle candidature non sono mai condivisi
              con Meta</strong>. La corrispondenza avanzata automatica di Meta è
              disattivata. Per i dati raccolti tramite il Pixel, Meta agisce
              come autonomo titolare/contitolare secondo i propri termini; il
              trattamento successivo da parte di Meta è descritto
              nell&apos;informativa di Meta (
              <a href="https://www.facebook.com/privacy/policy" target="_blank" rel="noopener noreferrer">
                facebook.com/privacy/policy
              </a>
              ), che può comportare trasferimenti verso gli Stati Uniti.
            </p>
            <p>
              <strong>Le tue scelte</strong>: nello Spazio economico europeo,
              nel Regno Unito e in Svizzera (e quando non riusciamo a
              determinare la regione) gli strumenti di analisi e pubblicità
              restano disattivati finché non li accetti; puoi accettare o
              rifiutare con la stessa facilità. Altrove possono essere attivi
              per impostazione predefinita, ma il tuo rifiuto viene sempre
              rispettato. Puoi cambiare idea o revocare il consenso in qualsiasi
              momento da <CookieSettingsLink className="underline" /> (link
              nel piè di pagina e nelle Impostazioni dell&apos;account): la
              revoca ha effetto immediato, anche nelle altre schede aperte, e
              non pregiudica la liceità del trattamento precedente. Conserviamo
              una prova della tua scelta (identificativo casuale del browser,
              data, versione dell&apos;informativa, regione e scelte) senza
              collegarla al tuo account.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">6. Periodo di conservazione</h2>
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
            <h2 className="text-xl font-semibold">7. I tuoi diritti (Capo III GDPR)</h2>
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
            <h2 className="text-xl font-semibold">8. Sicurezza</h2>
            <p>
              Tutti i dati sono cifrati in transito (TLS) e a riposo presso i
              fornitori indicati. Le password sono salvate solo come hash. I
              dati sensibili eventualmente memorizzati sono cifrati con
              AES-256-GCM prima del salvataggio. L&apos;accesso al database è
              limitato al titolare.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">9. Data breach</h2>
            <p>
              In caso di violazione, notificheremo al Garante entro 72 ore come
              richiesto dall&apos;art. 33 GDPR, e agli utenti interessati senza
              ritardo se la violazione comporta rischio elevato.
            </p>
          </section>

          <p className="text-xs text-muted-foreground">
            Ultimo aggiornamento: 18 ottobre 2026.
          </p>
        </div>
      </main>
    </div>
  );
}
