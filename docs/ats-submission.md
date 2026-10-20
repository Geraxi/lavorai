# Proposta: invio sui form ATS con conferma dell'utente

Stato: design, non implementato. Ambito: Greenhouse, Lever, Ashby, Workday (e SmartRecruiters/Recruitee in seguito).

## Obiettivo

Compilare il form ufficiale del datore di lavoro, mostrare all'utente **cosa verrà inviato** (screenshot + valori dei
campi) e premere "Invia" **solo dopo la sua conferma esplicita**, salvando una ricevuta verificabile. Mai invii ciechi.

## 1. Prima scelta: API ufficiali dove esistono

| ATS | API | Note |
|---|---|---|
| Greenhouse | Job Board API `POST /v1/boards/{token}/jobs/{id}` | Richiede la API key del **board del datore** (Basic auth): utilizzabile solo con partnership/consenso del datore. Ricevuta HTTP 200 + id. |
| Lever | Postings API `POST /v0/postings/{site}/{id}/apply` | Richiede API key del cliente Lever; senza, solo form pubblico. |
| Ashby | `applicationForm.submit` (API pubblica job board) | Richiede API key dell'organizzazione. |
| Workday | Nessuna API pubblica per candidati | Solo form (account candidato per tenant). |

Per i datori che aderiscono (programma "partner") usiamo queste API: ricevuta HTTP verificabile, già supportata dal
parser `submission-receipt.ts`.

## 2. Worker browser-use (MIT, Python) per il form pubblico

- Servizio separato `ats-worker/` (Python 3.11, [browser-use](https://github.com/browser-use/browser-use) + Playwright Chromium),
  coda Redis/BullMQ già presente (`bullmq-queue.ts`) tramite una coda dedicata `ats-fill`.
- Input del job: `applicationId`, URL canonico (`board-apply-resolver.ts`), dati candidato **già approvati**
  (`candidate-facts`, `userProvidedAnswersJson`), file CV/lettera via URL firmato a breve scadenza.
- Agente vincolato: dominio consentito = host dell'ATS (allowlist), nessuna navigazione esterna, nessun login a
  terzi, nessuna risposta inventata (domande sconosciute → `needs_answers`, riuso di `cv-fact-guard`).
- Flusso a due fasi:
  1. **fill**: compila, carica i file, si ferma **prima** del submit. Salva screenshot a pagina intera
     (storage privato, scadenza 7 giorni) + mappa campo→valore + hash del DOM del form. Stato `prepared`.
  2. L'utente vede screenshot e valori in "Approva invii" e conferma → `approved`.
  3. **submit**: nuova sessione, ricompila con gli stessi valori, verifica che l'hash dei campi corrisponda (altrimenti
     torna a `prepared`), clicca invia una sola volta (`sendClaimedAt`), cattura pagina di conferma/risposta di rete →
     `submissionReceiptJson` (`kind: dom|http`). Nessuna conferma → `unverified`, mai ritentato in automatico.
- CAPTCHA, 2FA o login candidato (Workday): nessun aggiramento → `needs_manual` con link e documenti pronti.
- Limiti di frequenza per dominio, user-agent onesto, rispetto di robots/termini dell'ATS; kill-switch
  `APPLICATIONS_PAUSED` e dry-run fuori produzione come per la casella.

## 3. Esclusioni

**Nessuna automazione su LinkedIn (Easy Apply), Indeed, InfoJobs**: i loro termini vietano bot/scraping e l'invio
automatico. Per queste offerte: link all'annuncio + documenti pronti, oppure invio dalla casella se l'annuncio
riporta un indirizzo email del datore.

## 4. Stati e metriche

Stessa macchina a stati di `docs/mailbox-sending.md` (`prepared → approved → submitted → delivery_confirmed | failed |
unverified`), con "confermata" solo per ricevuta HTTP/DOM verificata. Lo screenshot pre-invio non è una ricevuta.

## 5. Rischi aperti

- Le API ATS richiedono la chiave del datore: valore solo con partnership.
- Agenti LLM possono deviare: allowlist di dominio, timeout, budget di passi, revisione umana obbligatoria.
- Privacy: screenshot contengono dati personali → storage privato, cifrato, scadenza breve, mai nei log.
