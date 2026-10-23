# LavorAI Worker — Vercel (senza Railway)

Railway non è più usato. L'invio delle candidature gira interamente su Vercel.

## Come funziona

- **Enqueue**: `enqueueApplication` (src/lib/application-queue.ts) fa self-invoke
  HTTP a `POST /api/applications/process` (una function per candidatura,
  `maxDuration` 300s, Chromium via `@sparticuz/chromium`).
  `PROCESS_FALLBACK_DELAY_MS` default 0.
- **Recupero / polling**: `GET /api/cron/drain-queue` (Vercel Cron ogni 5 min,
  backup GitHub Actions `.github/workflows/drain-queue.yml` ogni 15 min).
  Claim atomico delle righe `queued` (fino a `WORKER_CONCURRENCY`, default 2)
  + liveness recheck delle candidature in hold circa ogni 30 min.
- **Auto-apply**: `GET /api/cron/auto-apply` schedulato `0 8,9,12,13,16,17 * * *`
  UTC; il route esegue solo quando a Europe/Rome sono le 10, 14 o 18
  (CET e CEST). Prima esegue un backfill CVProfile breve (max 20, 60s).
  Run manuale: header `X-Admin-Key: <ADMIN_SYNC_KEY>` (bypassa il guard orario).

## Env vars su Vercel (Production)

`DATABASE_URL`, `DIRECT_URL` (Neon EU), `CRON_SECRET`, `APP_WORKER_SECRET` e/o
`ADMIN_SYNC_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `RESEND_API_KEY`,
`EMAIL_FROM`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
`SUPABASE_STORAGE_BUCKET`, `APP_ENCRYPTION_KEY`, `GOOGLE_CLIENT_ID`,
`GOOGLE_CLIENT_SECRET`, `NEXT_PUBLIC_SITE_URL`, `AUTO_APPLY_ENABLED`,
`PORTAL_SUBMIT_ENABLED`, `PORTAL_SUBMIT_DRY_RUN`, `APPLICATION_SENDING_MODE`,
`APPLY_GLOBAL_DAILY_CAP`, `APPLICATION_ROLLOUT_START_AT`; opzionali
`WORKER_CONCURRENCY`, `PROCESS_FALLBACK_DELAY_MS`, `PROXY_SERVER`,
`PROXY_USERNAME`, `PROXY_PASSWORD`, `APPLICATIONS_PAUSED`.

## GitHub Actions secrets

Solo `CRON_SECRET` (stesso valore di Vercel).

## Esecuzione locale (debug)

`npx tsx worker.ts` funziona ancora (polling DB + scheduler interno) ma NON va
eseguito in produzione insieme ai cron Vercel. `Dockerfile.worker` resta solo
per uso locale.

## Migrazione da Railway

1. Spegnere/eliminare il servizio Railway.
2. Ruotare tutti i segreti che erano su Railway e aggiornarli su Vercel.
3. Verificare `/api/admin/browser-healthcheck` con `PORTAL_SUBMIT_DRY_RUN=true`.
