# Attivazione dopo la preview — rapporto di verifica

Branch locale: `codex/value-before-trial`. Base: `origin/main` verificato via fetch, commit `8efe5fc80dc18142da844b2c8f07aa5905423502`.
Checkout isolato: `/Users/umbertogeraci/Documents/Codex/2026-10-21/task-6/lavorai`.
Nessun commit, push, PR, merge, deploy, modifica di produzione, checkout Stripe reale, email o candidatura reale. Le modifiche di task-3 non sono state inglobate.

## Comportamento

1. Signup password e OAuth creano l’account senza consumare la prova o avviare un timer. La conversione Ads della registrazione resta separata e deduplicata.
2. Dopo verifica email sono disponibili CV, preferenze, analisi/lettera personalizzata e fino a tre offerte del catalogo filtrate per ruolo, località, modalità di lavoro, retribuzione e aziende escluse. L’assenza di offerte viene dichiarata, senza inventare aziende o garantire risposte.
3. La preview privata è persistita e recuperabile al refresh. Un claim temporaneo limita generazioni concorrenti; gli errori rilasciano il claim. Vederla non attiva invii né modalità automatiche. Le preferenze di invio già esistenti restano invariate.
4. La scelta di attivare è separata: carta, durata, prezzo e rinnovo sono espliciti. Il server richiede preview completata, controlla lo storico Stripe paginato e impedisce checkout concorrenti. Riutilizza un checkout aperto compatibile; i piani già attivi vanno al portale senza essere cancellati o riavviati.
5. Stripe riceve `trial_period_days: 7`, non una scadenza calcolata dal signup. Il webhook verificato registra l’attivazione e la scadenza reale. La callback del browser non concede accesso. Per le prove Stripe esistenti prevalgono la scadenza Stripe e il precedente limite applicativo.
6. `invoice.paid` con importo positivo registra il pagamento, deduplicato per fattura; prova gratuita e fatture a zero non sono acquisti. I rinnovi restano distinguibili. I promemoria applicativi leggono le date della prova effettiva, non l’età dell’account.

## Account storici: regola conservativa

`trialActivationVersion = 1` è assegnato solo dalla creazione account nel nuovo flusso. La migrazione lascia NULL tutti gli utenti esistenti. L’idoneità richiede questo marcatore, nessun `proTrialUsedAt`, nessun `trialEndsAt` e nessuna prova nello storico Stripe.

Un account storico senza alcun dato non viene considerato automaticamente nuovo/idoneo. I vecchi marcatori automatici non vengono azzerati. Questi utenti possono vedere la preview e scegliere un piano a pagamento oppure richiedere revisione. Non è implementato alcun reset massivo o recupero retroattivo automatico. Eventuali concessioni dopo revisione richiedono una decisione separata basata su prove effettive di mancato utilizzo.

## File principali

- Signup/OAuth e selezioni: `src/app/api/auth/signup/route.ts`, `src/lib/auth-adapter.ts`, `src/lib/auth.ts`, `src/lib/user-selects.ts`, verifica email.
- Regole: `src/lib/billing.ts`, `trial-eligibility.ts`, `onboarding-access.ts`, `trial-access.ts`, `src/proxy.ts`, layout app.
- Preview: pagine/client onboarding, API demo e demo/viewed, preferenze, `onboarding-options.ts` (costanti client separate dalle dipendenze database).
- Pagamento: `src/app/api/stripe/checkout/route.ts`, `webhook/route.ts`, pagina e azioni start-membership.
- Lifecycle/copy: `src/lib/trial.ts`, messaggi IT/EN e punti marketing che indicavano signup come avvio prova.
- Schema: quattro colonne nullable aggiunte da `prisma/migrations/20261021210000_value_first_activation/migration.sql`: preview, due claim e versione del flusso. Nessun backfill.
- Test: suite card-onboarding, OAuth, registration-trial, compatibilità schema, nuovo `test-value-first-preview.ts`, `test-value-first-migration.sql`, renderer fixture React.

## Verifiche

- `npm test`: suite completa offline, compresi signup/OAuth, autorizzazioni, consent/worker, Ads Google e Meta, webhook firmati con fixture, SCA, callback spoofing, cancellazioni e replay, errori, concorrenza, scadenze e cap per utenti esistenti.
- `tsc --noEmit`: completato senza errori.
- `npm run build`: build ottimizzata completata. Ambiente isolato con credenziali fittizie e database irraggiungibile; rete usata per i font Google. Nessuna credenziale di produzione caricata.
- Preview mock: 401/403, prerequisiti, claim concorrenti, errore AI/retry, recupero persistito, filtro ruolo/località, catalogo vuoto, evento viewed distinto dalla generazione, criteri legacy.
- Checkout/webhook mock: sette giorni anche con signup lontano, niente seconda prova dopo storico usato o per vecchi account non marcati, niente sostituzione silenziosa della prova richiesta con un addebito, checkout aperto riutilizzato, `invoice.paid` a zero ignorato, pagamento duplicato contato una volta, rinnovo distinto.
- PostgreSQL 16 temporaneo su `127.0.0.1:55466/activation_fixture`, cluster `/tmp/lavorai-task6-pg`: schema del main, quattro utenti sintetici (vecchio vuoto, vecchio marcatore, prova Stripe, abbonamento attivo), migrazione reale, confronto JSON di ogni campo preesistente. Dati invariati; colonne nuove NULL per i vecchi utenti; nuovo account marcato ma senza prova avviata.
- Browser con componenti React reali e router/auth/fetch simulati: upload a 320px, preview a 390px, desktop a 1440px; nessun overflow. Refresh conserva preferenze e preview. Il CTA della preview chiama solo complete/welcome-seen e naviga a start-membership. Errore checkout mostrato e pulsanti riabilitati; richiesta esplicita `trialRequested:true`. Nessuna richiesta esterna di pagamento/invio.

Evidenze locali: `output/verification/` e `output/playwright/value-first-*.png`. Le fixture sono rigenerabili con `node scripts/render-value-first-fixtures.mjs`; usano font di sistema per evitare download e dati esclusivamente sintetici. I test browser sono controlli di componenti/integrazione mock, non un checkout end-to-end su Stripe reale.

## Rilascio successivo, non eseguito

1. Revisionare diff e rapporto; verificare eventuali nuovi commit su main senza importare task-3 automaticamente.
2. Applicare la migrazione additiva **prima** del codice, nell’ambiente di rilascio autorizzato, e generare il client Prisma. Il codice nuovo richiede le colonne aggiunte. Il test locale non ha applicato tutta la cronologia delle vecchie migrazioni: parte dallo schema del main.
3. Verificare che l’endpoint Stripe riceva `invoice.paid` oltre agli eventi esistenti. In cutover non riprodurre in massa vecchie fatture: il precedente reporting era deduplicato per subscription, il nuovo per invoice, e serve riconciliazione prima di un backfill.
4. Eventuali test con Stripe test-mode, email provider o OAuth reale sono una fase distinta: qui sono stati usati esclusivamente mock/fixture. Nessun test su servizi reali è stato eseguito.
5. Dopo autorizzazione al rilascio, verificare percorso nuovo utente, account storico in revisione e abbonamento già attivo. Nessun reset storico automatico è richiesto.
6. Rollback: le colonne additive possono restare. Non ripristinare alla cieca il vecchio checkout: la sua logica signup+7 non è compatibile con gli account creati dal nuovo flusso.

## Limiti operativi

Spazio disponibile osservato alla ripresa: circa 10 GiB. Sono state copiate/materializzate dipendenze solo nel task-6; nessuna cache o cartella di altri task è stata eliminata. La precedente disconnessione del Mac è risolta; il rapporto è stato scritto ex novo perché il tentativo precedente non aveva lasciato il file.

Verifica conclusiva: `git diff --check` pulito; confronto schema PostgreSQL/Prisma senza differenze. Server fixture 8766, PostgreSQL temporaneo 55466 e sessione Playwright `task6-activation` arrestati. Il cluster temporaneo è conservato in `/tmp/lavorai-task6-pg` per eventuale ispezione, senza processi attivi.
