# LavorAI — Deploy completo su Vercel (Postgres + Blob)

Guida zero-touch per portare in produzione DB + Storage usando solo Vercel.
Tempo totale: **~15 min**.

---

## 0. Prerequisiti

- Repo LavorAI su GitHub
- Account Vercel (Hobby plan gratis sufficiente per iniziare)

---

## 1. Crea progetto Vercel

1. https://vercel.com → Add New → Project
2. Import repo LavorAI
3. **Framework preset:** Next.js (auto)
4. **Root directory:** `lavorai/` (se hai monorepo, altrimenti default)
5. **Build command:** `prisma migrate deploy && next build`
6. **NON deployare ancora** — prima setup DB/storage

---

## 2. Vercel Postgres

1. Dashboard del progetto → **Storage** tab → **Create Database** → **Postgres**
2. Database name: `lavorai-db`
3. Region: **Frankfurt (fra1)**
4. Click Create — Vercel inietta automaticamente le env vars `POSTGRES_*` nel progetto

5. Copia il valore di `POSTGRES_PRISMA_URL` (Storage → lavorai-db → `.env.local` tab) e aggiungilo come **`DATABASE_URL`** nelle env vars del progetto:
   - Settings → Environment Variables → New
   - Key: `DATABASE_URL`
   - Value: incolla la stringa `POSTGRES_PRISMA_URL`
   - Environments: **All** (Production, Preview, Development)

   *Nota: Vercel auto-inietta `POSTGRES_PRISMA_URL` ma Prisma legge `DATABASE_URL` — questa duplicazione è normale.*

---

## 3. Vercel Blob (storage CV)

1. Storage tab → **Create Database** → **Blob**
2. Name: `lavorai-blob`
3. Connect to project → tutto in un click

   Vercel auto-inietta `BLOB_READ_WRITE_TOKEN` nelle env del progetto. **Non devi fare altro.**

---

## 4. Switch Prisma a Postgres

In locale (sul tuo Mac):

```bash
cd lavorai/

# 1. Edita prisma/schema.prisma — cambia la riga:
#    provider = "sqlite"
# in:
#    provider = "postgresql"

# 2. Reset migrations SQLite (non compatibili Postgres)
rm -rf prisma/migrations

# 3. Crea migration baseline contro il DB Postgres di Vercel
#    (usa la connection URL — la trovi in Storage → lavorai-db → .env.local tab → POSTGRES_URL_NON_POOLING)
DATABASE_URL='postgresql://...non-pooling...' npx prisma migrate dev --name initial_postgres

# 4. Commit + push
git add prisma/
git commit -m "switch prisma to postgres"
git push
```

Vercel rileva il push, fa build con `prisma migrate deploy`, applica le migrations al DB live.

---

## 5. Resto delle env vars

Settings → Environment Variables → aggiungi (per **All environments**):

```
# Auth
AUTH_SECRET=<openssl rand -hex 32>
AUTH_URL=https://lavorai.it       # dopo aver settato custom domain
NEXT_PUBLIC_SITE_URL=https://lavorai.it

# AI
ANTHROPIC_API_KEY=sk-ant-...

# Email
RESEND_API_KEY=re_...
EMAIL_FROM=LavorAI <noreply@lavorai.it>

# Encryption portal cookies
APP_ENCRYPTION_KEY=<openssl rand -hex 32>

# Queue (per Auto-apply worker — solo se vuoi worker su Railway)
REDIS_URL=rediss://default:...@xxx.upstash.io:6379

# Opzionali
ADZUNA_APP_ID=
ADZUNA_APP_KEY=
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

**NON aggiungere** queste — sono auto-iniettate da Vercel:
- `DATABASE_URL` (già fatto al passo 2 manualmente perché Prisma vuole questo nome)
- `POSTGRES_*` (auto)
- `BLOB_READ_WRITE_TOKEN` (auto)

---

## 6. Custom domain

Settings → Domains → Add → `lavorai.it` (o quello che hai)

Configura i DNS come Vercel ti dice (CNAME a `cname.vercel-dns.com` o A record IP).

Aggiorna `AUTH_URL` e `NEXT_PUBLIC_SITE_URL` al dominio custom.

---

## 7. Deploy + verifica

1. Settings → Deployments → Redeploy (per applicare le env vars)
2. Dopo deploy, test:
   - https://lavorai.it → home OK
   - Signup → email verifica arriva
   - Click verify link → "Email verificata"
   - Login password → entri in dashboard
   - Upload CV in /onboarding → dovresti vedere il CV salvato come URL `https://...public.blob.vercel-storage.com/users/...`
   - GDPR export → JSON con i tuoi dati
   - Account delete → cascade OK

---

## 8. Costi reali (Hobby plan)

| Servizio | Free tier | Usage tipico MVP | Limite/Costo |
|---|---|---|---|
| Vercel Hobby | gratis | bandwidth + builds illimitati per progetti hobby | $0 |
| Vercel Postgres | 60h compute/mese, 256MB storage | basta per ~1k MAU | $0 → $20/mese a 5k MAU |
| Vercel Blob | 1GB storage, 10GB bandwidth/mese | ~500 CV salvati gratis | $0 → $0.15/GB oltre |

**Totale MVP: $0** fino a ~1000 utenti attivi/mese.

---

## 9. Cose che NON puoi fare su Vercel-only

- **Auto-apply Playwright** (worker Railway separato — vedi `DEPLOY-WORKER.md`).
  Vercel serverless non gira Playwright affidabilmente.
- **Background jobs > 60s** (limite serverless Hobby; 5min su Pro).

Se ti basta il flow "Apply → CV+CL via email → utente clicca apply manualmente" non serve worker. Il worker Railway si aggiunge dopo se vuoi vero auto-submit.

---

## 10. Troubleshooting rapido

**"Can't reach database"** → Verifica `DATABASE_URL` punti a `POSTGRES_PRISMA_URL` (con `?pgbouncer=true&connect_timeout=15`)

**Migrations falliscono al build** → Usa `POSTGRES_URL_NON_POOLING` per le migration (no pgbouncer). Configurabile in `package.json`:
```json
"build": "DATABASE_URL=$POSTGRES_URL_NON_POOLING prisma migrate deploy && DATABASE_URL=$POSTGRES_PRISMA_URL next build"
```

**Upload CV "Failed to fetch blob"** → Token mancante. Storage → lavorai-blob → riconnetti al progetto.

**Email non arrivano** → Resend dominio non verificato (DNS pending). Controlla Resend dashboard.
