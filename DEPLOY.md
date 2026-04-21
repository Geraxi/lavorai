# LavorAI — Deploy Checklist

Passi per portare LavorAI da dev a produzione. Ordine consigliato.

---

## 1. Supabase (DB + Storage)

**1.1 Crea il progetto**
- Vai su https://supabase.com → New Project
- Region: **Frankfurt (eu-central-1)** (vicino utenti IT + conforme GDPR)
- Database password: salvala nel password manager
- Attendi ~2 minuti il provisioning

**1.2 DATABASE_URL**
- Settings → Database → Connection string → **URI** (modalità pooled, porta 6543 per prod)
- Esempio: `postgresql://postgres.xxxx:PASSWORD@aws-0-eu-central-1.pooler.supabase.com:6543/postgres?pgbouncer=true`

**1.3 Storage bucket**
- Storage → New bucket → nome: `lavorai` → **privato** (non pubblico)
- Policies: lascia vuote. L'app usa service_role key → bypass RLS

**1.4 Service key**
- Settings → API → `service_role` key (secret, server-only). Copiala, serve per Vercel.

---

## 2. Migrazione Prisma SQLite → Postgres

In locale, dopo aver messo `DATABASE_URL` Postgres in `.env.local`:

```bash
# 1. Cambia provider in prisma/schema.prisma
#    provider = "postgresql"

# 2. Reset delle migrations SQLite (non compatibili Postgres)
rm -rf prisma/migrations

# 3. Crea una migration iniziale per Postgres
npx prisma migrate dev --name initial_postgres

# 4. Verifica schema applicato
npx prisma db pull  # dovrebbe essere no-op
```

Commit `prisma/migrations/*` aggiornate.

Per i prossimi deploy Vercel: aggiungi nel `package.json` script build:
```json
"build": "prisma migrate deploy && next build"
```

---

## 3. Resend (email)

**3.1 Dominio verificato**
- Vai su https://resend.com → Domains → Add Domain
- Aggiungi `lavorai.it` (o il tuo)
- Inserisci i record DNS (SPF + DKIM) sul provider del dominio
- Attendi validazione (15 min - 24h)

**3.2 Chiavi**
- API Keys → Create
- `EMAIL_FROM` esempio: `LavorAI <noreply@lavorai.it>`

**3.3 Test**
- Dopo deploy, fai signup test → dovresti ricevere verify email

---

## 4. Vercel (deploy)

**4.1 Collega repo GitHub**
- Vercel → Add New → Project → Import repo

**4.2 Environment Variables** (tutti → Production + Preview + Development)

**Obbligatorie:**
```
AUTH_SECRET=<openssl rand -hex 32>
AUTH_URL=https://lavorai.it
NEXT_PUBLIC_SITE_URL=https://lavorai.it
DATABASE_URL=<postgres connection string Supabase pooled>
ANTHROPIC_API_KEY=sk-ant-...
RESEND_API_KEY=re_...
EMAIL_FROM=LavorAI <noreply@lavorai.it>
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service role key>
SUPABASE_STORAGE_BUCKET=lavorai
APP_ENCRYPTION_KEY=<openssl rand -hex 32>
```

**Raccomandate (rate limiter distribuito):**
```
UPSTASH_REDIS_REST_URL=https://...
UPSTASH_REDIS_REST_TOKEN=...
```

**Opzionali:**
```
# Stripe (solo se abiliti subscription Pro)
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PAYMENT_LINK=https://buy.stripe.com/...
NEXT_PUBLIC_STRIPE_PAYMENT_LINK=https://buy.stripe.com/...

# Adzuna (senza questa /jobs mostra mock)
ADZUNA_APP_ID=
ADZUNA_APP_KEY=
```

**4.3 Build command**
- Settings → Build → `prisma migrate deploy && next build`

**4.4 Region**
- Settings → Functions → Europe (eu-central-1 / Frankfurt) per latenza bassa

---

## 5. Stripe (opzionale, per Pro subscription)

- Crea prodotto "Pro" su Stripe Dashboard → copia Price ID
- Webhook endpoint: `https://lavorai.it/api/stripe/webhook`
- Subscribe a eventi: `checkout.session.completed`, `customer.subscription.*`, `invoice.payment_failed`
- Copia `whsec_...` in `STRIPE_WEBHOOK_SECRET`

---

## 6. Adzuna (job board reale)

- Registrati su https://developer.adzuna.com (gratis)
- Copia `APP_ID` + `APP_KEY`
- Senza queste chiavi `/jobs` mostra 10 job mock per dev

---

## 7. Post-deploy checklist

- [ ] Signup con email reale → ricevi email verify
- [ ] Click verify link → atterri su /verify-email "Email verificata ✓"
- [ ] Login con password → entri in dashboard
- [ ] Upload CV in onboarding → file appare su Supabase Storage bucket
- [ ] Password reset → email arriva, link funziona
- [ ] GDPR export → scarica JSON con tutti i tuoi dati
- [ ] Account delete → user sparisce dal DB
- [ ] `/jobs` mostra job reali (se Adzuna configurata)
- [ ] `/optimize` → magic link → CV adottato all'account

---

## 8. Ancora da fare (non inclusi in questo deploy)

- **Auto-apply worker** → il cuore del prodotto. Il codice attuale gira in-process (`src/lib/application-worker.ts`) ma su Vercel serverless non è sustainable. Serve:
  - Railway / Render worker con BullMQ + Redis
  - Playwright per navigare portali reali (LinkedIn, Indeed)
  - Session cookie management cifrato (già abbiamo `PortalSession` schema)
  - Gestione 2FA / captcha / bot detection
- **Monitoring** → Sentry per errori client+server, Axiom/Better Stack per logs
- **Backup DB** → Supabase Pro ha backup auto giornalieri. Check lo piano è quello.

---

## Troubleshooting

**"JWTSessionError" dopo deploy**
→ Hai cambiato `AUTH_SECRET`? Tutte le sessioni precedenti sono invalidate. Normale, utenti devono rifare login.

**Magic link / verify email non arrivano**
→ Dominio Resend non verificato (controlla DNS). Temporaneo: usa `onboarding@resend.dev` come from (limite 100/giorno).

**"SUPABASE_SERVICE_ROLE_KEY mancante" al primo request**
→ Env var non propagata. Redeploy forzato da Vercel Settings.

**CV upload fallisce**
→ Bucket `lavorai` non esiste o non è privato. Check Supabase → Storage.
