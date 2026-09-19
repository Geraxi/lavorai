# LavorAI Worker — Deploy su Railway (Playwright + BullMQ)

Questo guida setta il worker che gira 24/7 per processare le candidature:
OpenAI optimization + DOCX + email delivery + (opzionale) Playwright submit.

**Tempo totale: ~20 minuti.** Richiede carta di credito per Upstash + Railway
(entrambi hanno free tier sufficiente per iniziare).

---

## 1. Upstash Redis (queue backend)

**Perché**: BullMQ richiede Redis. Upstash ha free tier 10k cmd/giorno, sufficiente per MVP.

1. Vai su https://upstash.com → Sign up (GitHub login)
2. Create Database → **Global** type, Region **Frankfurt (eu-west-1)**
3. Dopo creazione, nella pagina del DB copia:
   - **Endpoint** → `REDIS_URL` (formato `rediss://...:PORT`)
4. Salva il `REDIS_URL` per i prossimi step

---

## 2. Railway (worker container)

**Perché**: Vercel serverless non gira Playwright. Railway ha container persistenti,
$5/mese include il worker 24/7 + database opzionale.

1. Vai su https://railway.app → Sign up (GitHub)
2. **New Project** → **Deploy from GitHub repo** → seleziona il repo LavorAI
3. Railway rileverà il `Dockerfile.worker`. Se no: Settings → Build → **Dockerfile Path: `Dockerfile.worker`**
4. **Variables** (Settings → Variables) aggiungi TUTTE queste:

```
# Database (stesso Postgres del web)
DATABASE_URL=postgresql://postgres....

# Redis queue
REDIS_URL=rediss://default:...@fra1.upstash.io:6379

# AI
OPENAI_API_KEY=sk-...
OPENAI_MODEL_STRONG=gpt-5.6-terra
OPENAI_MODEL_FAST=gpt-5.6-luna

# Email
RESEND_API_KEY=re_...
EMAIL_FROM=LavorAI <noreply@lavorai.it>

# Inbound email domain for ATS replies & security codes (REQUIRED for auto-OTP)
# Must match the Resend Inbound domain (e.g. inbound.lavorai.it)
# Without this, Greenhouse/Ashby security codes will be sent to user's personal email
INBOUND_EMAIL_DOMAIN=inbound.lavorai.it

# Storage (Supabase)
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...
SUPABASE_STORAGE_BUCKET=lavorai

# Encryption per cookie portali
APP_ENCRYPTION_KEY=<openssl rand -hex 32>

# Feature flag: abilita Playwright auto-submit
AUTO_APPLY_ENABLED=true

# Concurrency (default 2, alza se il piano Railway lo regge)
WORKER_CONCURRENCY=2

# Site URL per email templates
NEXT_PUBLIC_SITE_URL=https://lavorai.it

# Opzionali
APP_WORKER_SECRET=<random>  # se vuoi proteggere /api/applications/process
```

5. Railway farà build automatico del Dockerfile. Primo build ~5min (scarica immagine Playwright ~1GB).

6. **Verifica** nei Deploy Logs:
   ```
   [worker] avvio BullMQ worker su queue 'applications'
   [worker] concurrency=2, auto-apply=true
   [worker] connected to Redis, ready for jobs
   ```

---

## 3. Configure Inbound Email (CRITICAL for Auto-OTP)

**Why**: Greenhouse, Ashby, and other ATS platforms send email verification codes during application submission. Without inbound email routing, these codes would go to the user's personal inbox, requiring manual entry. With inbound configured, codes arrive at the system and are auto-completed.

1. **In Resend Dashboard**:
   - Go to **Inbound** → **Add domain**
   - Enter your subdomain (e.g. `inbound.lavorai.it`)
   - Copy the MX records shown
   
2. **In your DNS provider** (Cloudflare, Namecheap, etc.):
   - Add the MX records provided by Resend
   - Priority 10, points to `feedback-smtp.*.resend.com`
   - Wait 5-30 min for DNS propagation
   
3. **Verify in Resend**:
   - Click "Verify" — should show green checkmark
   - Send test email to `test@inbound.lavorai.it`
   - Should appear in Resend → Inbound → Messages
   
4. **Configure webhook** (if not already done):
   - Resend → Webhooks → Add endpoint
   - URL: `https://lavorai.it/api/webhooks/resend`
   - Events: `email.received`, `email.opened`
   - Copy signing secret → save as `RESEND_WEBHOOK_SECRET` in Vercel & Railway

5. **Set environment variable**:
   - Railway: add `INBOUND_EMAIL_DOMAIN=inbound.lavorai.it`
   - Vercel: add the same (used by API routes)

**Without this**: Applications to Greenhouse/Ashby will FAIL with clear error message directing you here. Security codes would otherwise arrive at user's Gmail, creating manual work and defeating the purpose of auto-apply.

---

## 4. Collega Vercel al Redis

Sul progetto Vercel → Settings → Environment Variables aggiungi:

```
REDIS_URL=rediss://default:...@fra1.upstash.io:6379   # lo stesso di Railway
```

Poi **Redeploy** (Vercel non ri-legge env senza redeploy).

Ora il flow è:
1. User clicca Apply su lavorai.it (Vercel)
2. Vercel: crea Application + `enqueueApplication()` → **push su Redis queue**
3. Railway worker: pull dalla queue → processApplication → email + DOCX + (opzionale) Playwright submit
4. Status aggiornato nel DB, utente vede progresso in dashboard

---

## 5. Test end-to-end

1. Login su lavorai.it con account verificato
2. Vai su /jobs → clicca "Candidati" su un job mock
3. In Railway logs dovresti vedere:
   ```
   [worker] processing job cmo... (applicationId=cmo...)
   [worker] completed job cmo...
   ```
4. Controlla email → arriva CV + cover letter allegati
5. Controlla dashboard → status "CV pronto" (o "Inviata" se mock/auto-apply riuscito)

---

## 6. Monitoring

**Railway ha già built-in:**
- Logs realtime
- Memory/CPU graphs
- Restart automatico su crash

**Aggiungi se serve:**
- **Sentry** → set `SENTRY_DSN` in env, avvolgi `processApplication` con try/catch + `Sentry.captureException`
- **Better Stack** → push logs

---

## 7. Selettori portali — stato attuale

- ✅ **mock jobs** (`url contiene example.com`) → simula successo, utile per demo
- 🟡 **InfoJobs** → selectors stub (linee 212-242 di `src/lib/application-worker.ts`).
  Da testare con un job reale e raffinare appena hai una sessione IT valida.
- ❌ **LinkedIn / Indeed** → non implementati intenzionalmente.
  Violano TOS + anti-bot attivo + legal risk. Se vuoi procedere, fork
  il codice e accetta il rischio ban account.

Per aggiungere un nuovo portale: edita `portalSubmitStrategy()` in
`src/lib/application-worker.ts`, segui il pattern di `infojobs`.

---

## 8. Cost estimate (MVP free tier)

- **Upstash Free**: 10k cmd/giorno → ~300 candidature/giorno (BullMQ è frugale)
- **Railway Trial**: $5 credito/mese, worker always-on consuma ~$3-4/mese
- **Vercel Hobby**: gratuito per frontend + API
- **Totale**: **$0-5/mese** fino a ~300 candidature/giorno

Quando scali:
- Upstash Pay-as-you-go: $0.2 per 100k cmd
- Railway Pro: $5 + usage
- Vercel Pro: $20/mese se superi Hobby

---

## 9. Troubleshooting

**"Can't find module tsx"**
→ Dockerfile deve fare `npm install tsx --no-save`. Verifica è dentro.

**"Connection refused redis"**
→ `REDIS_URL` manca o wrong. Controlla in Railway Variables. Upstash URL include password + porta.

**"Browser couldn't be started"**
→ Usa `mcr.microsoft.com/playwright:v1.48.2-jammy` come base, NON node:alpine.

**Worker fa errori Prisma**
→ Manca `prisma generate` nel build. È già nel Dockerfile. Verifica.

**Status "ready_to_apply" invece di "success"**
→ È il comportamento atteso se `AUTO_APPLY_ENABLED=false`. Setta true in Railway.

**"missing_field: configurare la ricezione email per le candidature"**
→ Manca `INBOUND_EMAIL_DOMAIN` in Railway. Greenhouse/Ashby richiedono questo per auto-OTP. Vedi sez. 3.

**Security codes arrivano all'utente invece che al sistema**
→ `INBOUND_EMAIL_DOMAIN` non è configurato OPPURE il worker sta usando `userEmail` invece dell'alias inbound. Verifica Railway env.

**LinkedIn ha bannato il mio account**
→ Vedi sez. 7. Non farlo.

---

## 10. Ancora da fare (per ora scelte consapevoli)

- Retry logic per Playwright failures è in BullMQ (3 attempts, exponential backoff). OK out-of-box.
- Dead letter queue: BullMQ mantiene failed jobs 7 giorni. Ispeziona con `npx bullmq dashboard` (terzo tool).
- Proxy pool: serve solo se scali > 50 candidature/giorno/account su stesso portale. Per MVP skip.
- Captcha solving: 2Captcha/CapMonster integration. Se InfoJobs te ne chiede uno spesso, ri-valuta.
