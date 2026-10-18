# Meta Pixel signup tracking + regional advertising consent

Pixel `2179944702960121` (via `NEXT_PUBLIC_META_PIXEL_ID`), event `CompleteRegistration` only.
No advanced matching, no CAPI, no customer data, no value.

## Consent
- Notice: `src/lib/consent/notice.ts`, version **`2026-10-18.meta-v1`** (`CONSENT_NOTICE_VERSION`).
  The banner/preferences render text from this object; any wording/purpose/recipient change must bump
  the version and keep the old entry. Grants under an older version are re-asked; refusals always hold.
- Purposes are separate: `analytics` (GA4) and `advertising` (Meta Pixel, Google Ads).
- Storage: `localStorage["lavorai-consent"]` (JSON, current) + legacy `lavorai-cookie-consent`
  (`accepted` only when both granted, otherwise `essential`). Legacy `essential` = refusal of both;
  legacy `accepted` (old bundled notice) = unanswered.
- Decision logic: `src/lib/consent/state.ts` → `effectiveConsent()`:
  - region pending → nothing loads;
  - EU/EEA/UK/CH or unresolved → both denied until answered, banner shown, unanswered ≠ accepted;
  - elsewhere → optional tools allowed without banner, explicit refusal honoured.
- Evidence: `POST /api/consent` → `ConsentRecord` (append-only; withdrawal is a new row). Stores a random
  browser visitor id (not linked to the account), timestamp, notice version, region, consentRequired,
  analytics/advertising answers, action, source. No IP/UA/email/user id.
- "Cookie settings": `CookieSettingsLink` in site footer, landing footer, auth pages footer, /privacy and
  /settings. Opens preferences pre-filled with the saved answers (does not reset).
- Withdrawal: applied immediately and in other tabs (storage event + BroadcastChannel `lavorai-consent`);
  the loaded pixel gets `fbq('consent','revoke')` and `_fbp`/`_fbc` are expired; Google gets
  `gtag('consent','update', denied)` and `ga-disable-<id>`.

## Region detection (deviation from `/cdn-cgi/trace`)
lavorai.it is served by Vercel, not Cloudflare: `https://lavorai.it/cdn-cgi/trace` returns 404 (checked
2026-10-18). `GET /api/geo` (same origin) answers in the same trace format (`loc=IT`) from Vercel's
`x-vercel-ip-country` header; missing → `loc=XX`. The client (`src/lib/consent/region.ts`) fetches it
with a 2 s timeout and parses `loc=`. Failure, non-OK, timeout, `XX`, `T1` → consent required (banner).
A resolved country is cached in `sessionStorage` for the visit only. Moving behind Cloudflare later only
requires pointing `GEO_TRACE_PATH` at `/cdn-cgi/trace`.

## Pixel loading
`src/lib/consent/meta-pixel.ts`, driven by `src/components/tracking-pixels.tsx`. Loads `fbevents.js` once
per page, `fbq('set','autoConfig',false,ID)` before `fbq('init',ID)` (no user data), one `PageView`.
No noscript image, no tag manager. Every track call re-checks consent.

## CompleteRegistration (one per real new account)
- Server (`src/lib/registration-conversion.ts`): a `RegistrationConversion` row with an opaque random
  UUID `eventId` is created only where a brand-new User is created:
  - email/password: `src/app/api/auth/signup/route.ts`, right after `prisma.user.create`. The account
    exists before email verification (soft verification), so creation is the measured moment;
  - Google (and first magic-link): Auth.js `events.createUser` in `src/lib/auth.ts` (fires only on adapter
    user creation, never on returning logins).
- Client (`src/components/registration-conversion.tsx` + `src/lib/consent/registration-claim.ts`): on the
  first authenticated page of a browser session (not on /signup or /login, which hard-navigate), after the
  region is resolved, `POST /api/tracking/registration {advertising}`. The server consumes the row
  atomically on the first claim and returns the `eventId` only if: first claim, within 30 min of creation,
  and advertising consent effective. Then the client re-checks consent and calls
  `fbq('track','CompleteRegistration',{}, {eventID})`, guarded by `localStorage["lavorai-reg-sent:<id>"]`.
- So: no event on failed submits, clicks, OAuth start, returning logins, reloads, auth retries, revisits;
  a registration made without ad consent is consumed as `blocked_no_consent` and never replayed later.
- The old client-side `trackConversion("CompleteRegistration")` and `Lead` calls on signup submit are removed.

## Database
`prisma/migrations/20261018020000_meta_signup_consent/migration.sql`: two new tables + indexes + FK to
`User` (ON DELETE CASCADE). Additive only; `prisma db push` would only create these tables. If the tables
are missing, signup still works (creation is best-effort), `/api/consent` returns 503 (choice still applied
locally) and the claim returns no event.

## Tests
- `npm run test:meta-consent` (unit; part of `npm test`).
- `npm run test:meta-consent-browser` against a local server
  (`NEXT_PUBLIC_META_PIXEL_ID=2179944702960121 npx next dev -p 3100`); Meta requests are intercepted locally.
