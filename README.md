# LavorAI

Il copilota italiano per la ricerca del lavoro. Candidati in automatico sui portali italiani con CV e lettera motivazionale AI-personalizzati per ogni annuncio.

**Tagline**: _Se i recruiter usano l'AI, perché tu no?_

---

## Stack

- **Framework**: Next.js 16 (App Router, Turbopack) + TypeScript + React 19
- **UI**: Tailwind + shadcn/ui (marketing) + design system custom light/dark (app) + motion
- **Auth**: NextAuth v5, email magic link via Resend
- **Billing**: Stripe (Checkout + Webhook + Customer Portal)
- **DB**: Prisma + SQLite (dev) → Postgres/Supabase Frankfurt (prod)
- **AI**: Anthropic Claude (`claude-sonnet-4-20250514`, EOL 15/6/2026 — da migrare)
- **Parsing CV**: pdf-parse v2 + mammoth
- **DOCX**: `docx` library
- **Email**: Resend (auth + notifiche)
- **Auto-apply**: Playwright headed → browser automation server-side (Path A scelta founder)
- **Rate limit**: Upstash Redis (prod) / in-memory (dev)
- **Deploy**: Vercel Frankfurt (web) + Railway Frankfurt (worker Playwright) + Supabase Frankfurt (DB)

## Setup locale

```bash
git clone https://github.com/Geraxi/lavorai.git
cd lavorai
npm install
cp .env.example .env.local   # compila le chiavi richieste
npx prisma migrate deploy
npx tsx prisma/seed.ts        # seed demo user + 2 mock job (opzionale)
npx playwright install chromium   # solo se vuoi testare auto-apply
npm run dev
```

Apri [http://localhost:3000](http://localhost:3000).

## Comandi

| Comando | |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run build` | Build produzione |
| `npm run start` | Serve build |
| `npm run lint` | ESLint |
| `npx prisma studio` | UI visuale DB |
| `npx tsx prisma/seed.ts` | Seed demo data |

## Struttura

```
src/
├── app/
│   ├── (marketing)/        # Landing dark — /, /privacy, /termini, /contatti, /optimize
│   ├── (app)/              # App light — /dashboard, /applications, /jobs, /cv, /preferences, /analytics, /inbox, /settings
│   ├── onboarding/         # Wizard split-screen 4 step
│   ├── login/              # Email magic link
│   ├── api/
│   │   ├── auth/[...nextauth]/   # NextAuth handler
│   │   ├── stripe/checkout|portal|webhook/
│   │   ├── applications/ + apply/
│   │   └── onboarding/cv + [portal]/link/
│   ├── error.tsx           # 500 globale
│   ├── not-found.tsx       # 404
│   ├── sitemap.ts
│   └── layout.tsx
├── components/
│   ├── design/             # App design system (Icon, Sidebar, Topbar, Kpi, SectionCard, LiveTicker, DetailDrawer, CommandPalette, ThemeToggle)
│   ├── sections/           # Landing marketing (hero, problema, come-funziona, perche, pricing, faq, cta-final)
│   └── ui/                 # shadcn primitives
├── lib/
│   ├── auth.ts             # NextAuth config (Email via Resend)
│   ├── billing.ts          # Tier config (Free/Pro/Pro+) + entitlements
│   ├── stripe.ts           # Stripe client + price ID mapping
│   ├── rate-limit.ts       # Limiter (Upstash prod / in-memory dev)
│   ├── session.ts          # getCurrentUser + requireUser
│   ├── db.ts               # Prisma singleton
│   ├── crypto.ts           # AES-256-GCM per session cookie portali
│   ├── adzuna.ts           # Job feed client + mock fallback
│   ├── claude.ts           # Claude optimizeCV (prompt caching)
│   ├── cv-parser.ts, docx-generator.ts, email.ts, jobs-repo.ts, ui-applications.ts, application-worker.ts, storage.ts, portals.ts
├── proxy.ts                # Route protection (Next 16 middleware → proxy)
└── types/cv.ts
prisma/
├── schema.prisma           # User + Account + Session + Application + Job + CVDocument + PortalSession + UserPreferences
├── migrations/
└── seed.ts
```

## Pricing tier

| | Free | Pro €19.99/mese | Pro+ €39.99/mese |
|---|---|---|---|
| Candidature mensili | 3 totali | 50/mese | **illimitate** |
| Portali auto-apply | 0 | 1 a scelta | **tutti** (LinkedIn, InfoJobs, Indeed, Subito) |
| CV optimization | ✓ | ✓ | ✓ multi-variante |
| Cover letter | ✓ | ✓ | ✓ personalizzata |
| Formato | DOCX | DOCX | DOCX + PDF + Europass |
| Analytics | ✗ | base | **avanzata** (funnel, geo, heatmap) |
| Support | community | email | **prioritario <4h** |
| API access | ✗ | ✗ | **in arrivo** |

Config in `src/lib/billing.ts` — single source of truth per UI e paywall server-side.

## Environment variables

Vedi `.env.example`. Obbligatorie per produzione:

```
ANTHROPIC_API_KEY
RESEND_API_KEY
EMAIL_FROM=LavorAI <noreply@lavorai.it>        # dominio verificato su Resend
AUTH_SECRET=<openssl rand -hex 32>
AUTH_URL=https://lavorai.it
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
STRIPE_PRICE_ID_PRO
STRIPE_PRICE_ID_PRO_PLUS
DATABASE_URL=postgresql://...                  # Supabase Frankfurt
APP_ENCRYPTION_KEY=<openssl rand -hex 32>
NEXT_PUBLIC_SITE_URL=https://lavorai.it
ADZUNA_APP_ID, ADZUNA_APP_KEY                  # feed job
UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN  # rate limit distribuito
```

## ✅ Production readiness checklist

Cosa è **già implementato nel codice**:
- [x] Auth NextAuth email magic link + Prisma adapter
- [x] Paywall server-side enforcement per-tier (Free/Pro/Pro+)
- [x] Stripe Checkout, Webhook (subscription lifecycle), Customer Portal
- [x] Rate limiting (Upstash o in-memory fallback)
- [x] Security headers (HSTS, X-Frame-Options, etc.) in `next.config.mjs`
- [x] Error pages (404, 500)
- [x] Cookie banner GDPR
- [x] Protezione route via `src/proxy.ts`
- [x] robots.txt + sitemap.xml
- [x] Theme toggle light/dark con persistence
- [x] ⌘K command palette
- [x] Skip to main content (accessibility)
- [x] Structured errors + logging
- [x] Mobile viewport meta
- [x] Dockerfile + railway.json per worker
- [x] GitHub Actions CI (typecheck + build)
- [x] Seed script demo

Cosa **richiede la tua azione** (non posso farlo dal codice):
- [ ] Stripe account: crea prodotti Pro (€19.99) e Pro+ (€39.99), copia `price_id` nelle env
- [ ] Stripe webhook: aggiungi endpoint `https://lavorai.it/api/stripe/webhook` nel dashboard → copia `webhook_secret`
- [ ] Resend account: verifica dominio `lavorai.it` (aggiungi DNS records forniti da Resend) → senza questo, email arrivano solo a te come owner
- [ ] Anthropic: passa a modello supportato (es. `claude-sonnet-4-5-20250929` o successivo) — attuale `claude-sonnet-4-20250514` EOL 15/6/2026
- [ ] Supabase: crea progetto region Frankfurt, copia `DATABASE_URL`, cambia `provider = "postgresql"` in `schema.prisma` e `npx prisma migrate deploy`
- [ ] Upstash: crea database Redis region EU, copia URL+TOKEN
- [ ] Adzuna: registra app gratis, copia APP_ID + APP_KEY
- [ ] Vercel: collega repo GitHub, deploy auto su push, imposta tutte le env sopra
- [ ] Railway (worker Playwright): deploy come separato servizio con `Dockerfile`, scheduler per pollare coda
- [ ] DNS: punta `lavorai.it` → Vercel (A + AAAA + www CNAME)
- [ ] Revisione legale di Privacy + Termini (draft attuale in `src/app/(marketing)/privacy|termini/page.tsx`)
- [ ] Monitoring: aggiungi Sentry (o similar) per error tracking in prod
- [ ] Backup DB: Supabase offre backup automatici, verifica retention
- [ ] Cyber liability insurance (consigliato per Path A auto-apply)

## Deploy guide (step-by-step)

### 1. DB su Supabase
1. Crea progetto region Frankfurt su [supabase.com](https://supabase.com)
2. Settings → Database → copy Connection string (Session pooler)
3. In `schema.prisma` cambia `provider = "postgresql"` e metti `DATABASE_URL` in env Vercel
4. `npx prisma migrate deploy`

### 2. Web app su Vercel
1. [vercel.com/new](https://vercel.com/new) → import repo `Geraxi/lavorai`
2. Framework preset: Next.js (auto-detected)
3. Aggiungi tutte le env dalla sezione sopra
4. Deploy → dominio `*.vercel.app` funzionante
5. Settings → Domains → aggiungi `lavorai.it` → aggiorna DNS

### 3. Worker Playwright su Railway
1. [railway.app/new](https://railway.app/new) → Deploy from GitHub → seleziona repo
2. Railway rileva `railway.json` + `Dockerfile`
3. Region: Frankfurt (EU)
4. Add env vars (stesse di Vercel + `DATABASE_URL`)
5. Deploy

### 4. Stripe
1. [dashboard.stripe.com](https://dashboard.stripe.com) → Products
2. Crea "LavorAI Pro" → price €19.99/mese recurring → copia `price_id` → env `STRIPE_PRICE_ID_PRO`
3. Crea "LavorAI Pro+" → price €39.99/mese recurring → `STRIPE_PRICE_ID_PRO_PLUS`
4. Developers → Webhooks → aggiungi endpoint `https://lavorai.it/api/stripe/webhook` con eventi:
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_failed`
5. Copia signing secret → env `STRIPE_WEBHOOK_SECRET`

### 5. Resend
1. [resend.com](https://resend.com) → Domains → aggiungi `lavorai.it`
2. Aggiungi DNS records (SPF, DKIM, DMARC) al tuo DNS provider
3. Wait for verify → copy API key → env `RESEND_API_KEY`
4. `EMAIL_FROM=LavorAI <noreply@lavorai.it>`

### 6. Smoke test
```bash
# 1. Flusso signup
curl https://lavorai.it/login → inserisci email → ricevi link → clicca
# 2. Flusso checkout
Login → /settings → Upgrade a Pro → paga con carta test 4242424242424242
# 3. Flusso candidatura
/onboarding → upload CV → /jobs → Applica con LavorAI → /applications → status 'success'
```

## Testing Sprint 2 (pipeline AI)

Fixtures in `fixtures/`:
- `fake-cv.pdf`, `fake-cv-dev.pdf` — CV reali per test
- `fake-job.txt` — annuncio Capgemini

```bash
npx tsx scripts/test-optimize.ts fixtures/fake-cv-dev.pdf
# → stampa JSON Claude + salva DOCX in /tmp
```

## Status

**Sprint 5 completato — production-ready scaffolding.**

End-to-end verificato in locale con 1 candidatura reale completa:
CV upload → parseCV (2906 char) → optimizeCV (Claude Sonnet 4) → DOCX generati → worker success in 34s → /applications shows status "inviata" con ATS score 35/100 + suggerimenti.

**Prossimi sprint**:
- Sprint 6: Portal linking UI rebuilt in app shell (LinkedIn/InfoJobs/Indeed/Subito)
- Sprint 7: Real Playwright selectors testati su job reali
- Sprint 8: Chrome extension (complemento/alternativa a Path A)
- Sprint 9: i18n + internazionalizzazione mercato EU
