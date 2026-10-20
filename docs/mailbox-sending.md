# Invio candidature dalla casella dell'utente (Gmail / Outlook)

Branch `feat/real-application-sending`. Solo codice locale: nessun deploy, nessuna migrazione di produzione eseguita.

## 1. Audit: perché oggi gli invii falliscono o non si possono confermare

Percorso attuale: `POST /api/applications/apply` e `apply-batch` ("Candidati a tutte") → `enqueueApplication` →
`application-worker.ts` (ottimizza CV/lettera, poi sceglie un canale). Due canali:

1. **Form ATS via Playwright** (`portal-adapters/*`, `submitViaPlaywright`). Esiti in `submitConfirmation`
   (`DETECTED_*`, `UNCONFIRMED`, `CAPTCHA`, `DRY_RUN`, …) e `submissionReceiptJson`.
2. **Email al recruiter via Resend** (`recruiter-delivery.ts` → `sendRecruiterEmailOnce`), da un dominio LavorAI
   "per conto di" il candidato, con reply-to e indirizzo inbound `reply+<id>@`.

Cause principali (codice + `docs/audit-2026-10-18-reliability.md` + audit live del 18/10: dashboard con
**0 inviate con evidenza, 396 esito non verificato, 1668 non inviate, 1195 che richiedono un'azione**):

| # | Causa | Effetto |
|---|---|---|
| R1 | Il canale email parte dal **dominio di LavorAI**, non dalla casella del candidato. Mittente terzo "per conto di", tracking pixel, allegati DOCX: profilo tipico da spam/quarantena; il recruiter vede un mittente sconosciuto. | Consegna debole; risposte che dipendono dal relay inbound. |
| R2 | L'email viene inviata solo se `findVerifiedRecruiterEmail` trova un indirizzo **sulla pagina dell'annuncio dello stesso datore**; per aziende con ATS noto il fallback email è vietato (`isKnownAtsCompany`). | La maggior parte delle candidature finisce in `ready_to_apply` "manuale" o `failed`. |
| R3 | L'evidenza email = `EMAIL_SENT` all'accettazione Resend; il "consegnato" dipende dai webhook Resend (`email.delivered`). Senza webhook configurati restano `accepted`. | Tutto resta "inviata, non verificata". |
| R4 | Gli adapter ATS rompono spesso: Ashby `form_not_found` dal 13/10 (G9), CAPTCHA, domande obbligatorie (`needs_answers`, resume solo Greenhouse/Recruitee, G10), submit cliccato senza ricevuta (`UNCONFIRMED`). | `failed`/`unverified`; mai ritentati (giusto, ma bloccanti). |
| R5 | Gate operativi: `APPLICATIONS_PAUSED`, budget giornaliero globale (`application-submission-budget`), rollout manual-only, liveness hold, consenso/attivazione. | Righe "held" che sembrano bloccate. |
| R6 | L'integrazione Gmail esistente (`/api/gmail/connect`) chiede solo `gmail.readonly` (lettura risposte): **non può inviare**. | Nessun canale "dalla tua casella". |

## 2. Cosa aggiunge questo branch

Canale primario: l'email parte dalla **casella dell'utente** (Gmail API `users.messages.send`, Microsoft Graph
bozza + `/send`) con la lettera nel corpo, CV PDF (+ lettera DOCX se presente) in allegato e un `Message-ID` nostro.
Salviamo id messaggio, id thread (Gmail `threadId` / Graph `conversationId`) e `internetMessageId`.

- `src/lib/mailbox/send-guard.ts` – guardia fail-closed: `NODE_ENV=test` sempre dry-run; live solo con
  `VERCEL_ENV=production` (salvo `APPLICATIONS_PAUSED` o `MAILBOX_SEND_DRY_RUN=true`); ovunque altro (dev, preview,
  `next start` locale, Railway/altri host) dry-run salvo `MAILBOX_SEND_LIVE=true` esplicito.
  In dry-run nessuna chiamata di rete: riga `dryRun=true`, id `dryrun-…`, mai contata come consegna.
- `mime.ts` (MIME puro, anti header-injection), `providers.ts` (client Gmail/Graph con `fetch` iniettabile),
  `oauth.ts` (state HMAC, scambio/refresh token, verifica scope di invio), `service.ts` (prepare → approve → send → check),
  `delivery-state.ts` (macchina a stati + riconoscimento DSN/NDR), `runtime.ts` (dipendenze reali).
- Tabelle additive `MailboxConnection` (token cifrati AES-GCM) e `MailboxSend`.
  Migrazione: `prisma/migrations/20261020120000_mailbox_sending` (solo CREATE TABLE/INDEX + FK).
- API: `/api/mailbox/{connect,callback/[provider],status,disconnect}`, `/api/applications/mailbox/{prepare,send}`,
  `/api/cron/mailbox-delivery` (Bearer `CRON_SECRET`).
- UI: Impostazioni → "Casella per inviare le candidature"; `/applications/invio` "Approva invii" (elenco destinatari,
  conferma esplicita); badge di consegna in Candidature.
- `application-lifecycle.ts` / `application-evidence.ts`: `submittedVia = mailbox_gmail|mailbox_outlook` con
  `MAILBOX_ACCEPTED` (inviata, non verificata) → `MAILBOX_NO_BOUNCE` (confermata) o `MAILBOX_BOUNCED` (fallita).

## 3. Macchina a stati (`MailboxSend.state`)

```
prepared ──approva (destinatari confermati uno per uno)──▶ approved
approved ──provider accetta, id salvato──▶ submitted
approved ──rifiuto esplicito (4xx/401)──▶ failed
approved ──timeout/5xx/429 (esito ambiguo)──▶ unverified      (mai ritentato in automatico)
submitted ──DSN/NDR nel thread──▶ failed (bounced, evidenza: mittente+oggetto)
submitted ──≥1 lettura del thread riuscita e 48h senza rimbalzi──▶ delivery_confirmed
submitted ──thread illeggibile a finestra scaduta──▶ unverified
delivery_confirmed ──rimbalzo tardivo (≤7 giorni)──▶ failed
```

"delivery_confirmed" = accettata dal provider con id **e** nessun rimbalzo rilevato dopo la finestra. Non è prova di
lettura o risposta. Un "Delay" DSN non chiude lo stato. Claim atomico `sendClaimedAt` = un solo invio per riga.

## 4. Setup richiesto (owner)

**Google (Gmail)**: Google Cloud Console → progetto esistente del login Google →
- Abilita *Gmail API*.
- OAuth consent screen: scope `https://www.googleapis.com/auth/gmail.send` (sensitive, da aggiungere) e
  `https://www.googleapis.com/auth/gmail.readonly` (restricted, **già richiesto** dal progetto per l'Inbox e in
  verifica). `gmail.metadata` **non** viene richiesto: `readonly` copre già la lettura dei thread per i rimbalzi
  (`users.threads.get?format=metadata`, solo intestazioni From/Subject/Date/Content-Type; nessun corpo salvato).
  In produzione serve la **verifica Google** (gmail.send va aggiunto alla verifica in corso); lo scope restricted
  richiede anche la valutazione di sicurezza (CASA). Finché non verificato: modalità Testing con utenti di test (max 100).
- Al callback verifichiamo gli scope concessi: con il consenso granulare l'utente può deselezionarne uno; senza
  `gmail.send` **e** `gmail.readonly` il collegamento viene rifiutato (`missing_scope`), perché senza lettura non
  potremmo mai rilevare rimbalzi né confermare la consegna.
- Le caselle collegate prima di questa modifica con `gmail.metadata` funzionano ancora (metadata basta per
  `format=metadata`); al prossimo ricollegamento ottengono `gmail.readonly`.
- Credenziali OAuth client "Web": redirect URI `https://<dominio>/api/mailbox/callback/gmail` (+ `http://localhost:3000/...` per dev).
- Env: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (già presenti per il login).

**Microsoft (Outlook / Microsoft 365)**: Azure Portal → Microsoft Entra ID → App registrations → New registration →
- Account types: "Accounts in any organizational directory and personal Microsoft accounts" (tenant `common`).
- Redirect URI (Web): `https://<dominio>/api/mailbox/callback/outlook`.
- API permissions (Microsoft Graph, Delegated): `Mail.Send`, `Mail.ReadWrite` (bozza con id + lettura thread), `User.Read`, `offline_access`.
  Alcuni tenant aziendali richiedono il consenso dell'amministratore. Publisher verification consigliata.
- Certificates & secrets → client secret.
- Env: `MS_CLIENT_ID`, `MS_CLIENT_SECRET`, opzionale `MS_TENANT_ID` (default `common`).

**Comuni**: `APP_ENCRYPTION_KEY` (≥32 caratteri, cifra i token), `AUTH_SECRET` (firma lo state),
`CRON_SECRET`; pianificare `GET /api/cron/mailbox-delivery` ogni ora (non aggiunto a `vercel.json`).
Opzionali: `MAILBOX_SEND_LIVE=true` (solo per prove reali fuori produzione), `MAILBOX_SEND_DRY_RUN=true`
(kill-switch in produzione), `MAILBOX_BOUNCE_WINDOW_HOURS` (default 48).
Applicare la migrazione additiva con il processo di rollout approvato.

## 5. Test

- `npm run test:mailbox-sending` – unit: guardia, MIME, DSN/NDR, stati, client Gmail/Graph con fetch finto, OAuth state. Fetch globale bloccato.
- `npm run test:mailbox-sending-postgres` – integrazione su `localhost/lavorai_test` (rifiuta altri DB) con client finti.

## 6. Limiti

- Nessun DSN non significa consegna in inbox: filtri spam/quarantena silenziosi non sono rilevabili.
- Rimbalzi fuori thread (alcuni server inviano DSN senza `In-Reply-To`) possono sfuggire; Gmail di norma li inserisce nel thread.
- Graph: l'id della bozza può cambiare dopo l'invio; tracciamo via `conversationId` + `internetMessageId`.
- Allegati Graph inline fino a ~3 MB ciascuno (sessione di upload non implementata).
- Il destinatario resta quello verificato da `findVerifiedRecruiterEmail`: le offerte senza email pubblica del
  datore vanno ancora sul form ATS (vedi `docs/ats-submission.md`).
- L'auto-apply del worker non usa ancora questo canale: ogni invio passa dall'approvazione esplicita.
