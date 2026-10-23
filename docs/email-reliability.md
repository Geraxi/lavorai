# Email reliability

Base: `origin/codex/application-safety-fixes`, verified after fetch at
`72ca061a1eb3c3f6c549c7d6b3c7b5f6dac094a9`. Branch: `codex/email-reliability`.
The reference checkout and onboarding checkout were not changed.

## Behavior

- `EmailOutbox` stores immutable rendered notifications and base64 attachments.
  Existing producers retain their recipient selection, templates, consent checks,
  application pause and dry-run checks. CV/manual, summaries, trial/upgrade,
  onboarding and existing admin campaigns now persist before dispatch.
- No historical rows are backfilled. Manual and questions notifications use
  application-specific event keys. Public CV delivery is explicitly admitted only
  by the existing request path after its privacy-consent validation; it can have
  no account. Registered-user rows are deleted with their account. Suspension or
  changed email prevents retry to an obsolete recipient. This change neither adds
  a marketing opt-in nor changes application consent/preferences.
- Routine campaigns deduplicate the same payload per UTC day and reuse active
  intents. An attempted unresolved intent or `review_required` row fences the
  recipient/kind even if the next day renders a different body. A new daily key
  cannot bypass an uncertain provider acceptance. Such a fence needs explicit
  investigation, not an automatic reset or a fresh key.
- `ApplicationSentNotification` remains the sole outbox for `application_sent`.
  Its evidence/intent checks, immutable payload, existing idempotency key and
  lease are preserved. Added bounded attempts and backoff do not recreate the
  application, submit an ATS form or send to a recruiter.
- `worker.ts` drains stored notifications every 30 seconds with a non-overlap
  guard. This pump calls only retry entrypoints, not historical reconciliation or
  application processing. The daily nudges cron also drains after its producers.
  A daily cron alone is insufficient: a live updated worker is a release prerequisite.
- Every existing `src` Resend send uses `src/lib/resend.ts`. A database row lock
  serializes reservation/admission; a committed global lease holds dispatch until
  completion, then enforces 250 ms spacing (at most roughly four sends/second).
  Contenders wait up to five seconds; persistent notifications remain pending if
  contention persists. Fetch has a 15-second timeout; the gate lease lasts 60 seconds.
- Day/month quotas count the UNION of committed reservations and legacy EmailLog
  IDs, so an accepted new email isn't counted twice. Reservations commit before
  the provider call and are never automatically refunded, including rejected or
  uncertain sends. Same-key retries in the same UTC day reuse the reservation.
  Cross-day retries can conservatively consume another reservation. Defaults
  remain 95/day and 2900/month. Routine emails leave up to ten daily/monthly slots
  for essential traffic; the drain orders essentials first. Limits are admission
  budgets, not proof of provider delivery.
- Authentication links and existing inbox/recruiter workflows retain their own
  synchronous/one-shot or durable semantics, using the same rate/quota transport.
  They are not moved into the generic campaign queue. Auth expiry semantics are
  unchanged; a provider/quota failure can still require a new user request.
  Recruiter sends are NEVER retried by this transport. Explicit rejection responses
  remain available to the existing recruiter classification; pre-send gate denial
  is distinguished from provider uncertainty.

## Truthful outcomes and ambiguity

`sent` means API acceptance with both no error and a nonempty provider email ID,
not delivery to the recipient. `pending` is awaiting an allowed retry; `failed`
is a known permanent failure or an unattempted stale intent. `review_required`
stops automatic replay after ambiguous/exhausted attempts or idempotency conflict.
EmailLog is written only after validated acceptance. If persistence fails after
acceptance, the outbox remains pending/sending until replay returns the same ID.
A lost lease cannot report successful completion.

At most five provider attempts; exponential backoff starts at 30 seconds (then
60, 120, 240 seconds). Gate/quota deferrals do not consume attempts. Network
exceptions, missing IDs, 429, 408, 5xx and concurrent idempotency conflicts are
retryable; invalid-payload idempotency conflicts require review. Notifications
expire 23 hours after admission, and replay also stops 23 hours after first
attempt. We deliberately leave an hour below Resend's documented **24-hour**
idempotency retention:
https://resend.com/docs/dashboard/emails/idempotency-keys (checked 2026-10-22).

An aborted HTTP request does not prove that the provider rejected it. The same
key and exact stored body must be reused within the window. Beyond it, inspect
provider evidence manually; never automatically change key/requeue. There is no
claim of exactly-once delivery: provider guarantees, bounded process suspension,
clock synchronization and database durability remain assumptions. A 60-second
lease plus 15-second transport deadline bounds normal overlap, but arbitrary host
suspension cannot be fenced by a provider that does not accept our lease token.
Other tools/accounts/processes bypassing this adapter and provider reads also
consume account limits; rate headroom does not eliminate every possible 429.

Sensitive rendered bodies/attachments are cleared from terminal rows after seven
days by the pump; dedupe/status evidence remains. Pending stale rows first become
terminal and are scrubbed on a subsequent pump. Guest CV data has no account FK,
so this retention is particularly important. No payloads or API credentials are
included in error messages.

## Migration and safe rollout (NOT executed against production)

1. Obtain explicit release authorization. Stop old email-producing workers/cron
   executions and prevent mixed old/new senders. Legacy code does not acquire the
   gate and would invalidate the shared budget. Record any in-flight uncertainties.
2. Back up and apply only the additive migration
   `20261022110000_email_reliability`: three new tables and two columns on the
   existing application notification outbox. No data backfill, credential change,
   quota increase or historical notification enqueue is included.
3. Verify the actual provider-account day/month usage and quota reset convention
   against existing logs. Legacy direct sends were not all logged; reconcile that
   baseline conservatively before enabling sends (or wait for a clean period).
   Do not treat an empty reservation table as unused provider quota. Confirm all
   web/worker instances share this database and account, the UTC daily reset matches the account (monthly admission conservatively counts the trailing 31 days),
   and clocks are synchronized. Keep other account traffic below the headroom.
4. Deploy compatible web and worker versions together and ensure the 30-second
   pump is healthy before enabling producers. Use only a separately authorized
   canary if one is later approved; none was sent during development.
5. Monitor pending age, attempts, failed/review-required counts, reservations,
   accepted provider IDs, 429s and pump heartbeat. Do not reset uncertain rows or
   release reservations simply to increase throughput. Manually investigate
   routine-campaign fences before admitting another notification of that kind.
6. Rollback: stop dispatch/pump first, retain all outbox/reservation/evidence rows,
   and avoid replaying them through old code. Do not drop these additive tables
   or deploy mixed uncoordinated producers while sends are in flight.

## Local verification

- `npm test`: complete existing suite passed with mocked providers.
- `node --import tsx scripts/test-email-reliability-postgres.ts`: fixed local
  PostgreSQL fixture only, injected fake SDK, no provider network. Covers seven
  concurrent producers; three separate Node processes; quota boundary; essential
  reserve; 429 then success/backoff; hard crash after provider acceptance; concurrent
  replay; timeout ambiguity/window expiry; changed-body next-day campaign fencing;
  missing provider ID/permanent rejection; attempt ceiling; stable event keys;
  no application/recruiter-attempt writes; suspension and account-deletion cascade.
- The new script requires a disposable empty database at
  `127.0.0.1:55439/lavorai_email_test`, local role `umbertogeraci`, with this schema.
  It refuses populated User tables. Do not substitute a production connection.
- Typecheck: `node node_modules/typescript/bin/tsc --noEmit --pretty false`.
- Final typecheck exited 0. `npm test` exited 0 after the final source changes.
- Final migration applied successfully from the exact base schema to a second
  empty local database, `lavorai_email_migration_test` (three tables, indexes,
  account FK and existing-outbox columns).
- `npm run build` (Turbopack) was interrupted after remaining at compilation
  without progress. `npm run build -- --webpack` identified unavailable Google
  Fonts DNS. The same Webpack build then exited 0 using
  `NEXT_FONT_GOOGLE_MOCKED_RESPONSES=/tmp/lavorai-email-font-fixture.cjs`, which
  supplies local CSS for Inter/JetBrains Mono; production source/font settings
  were not changed. This validates compilation, type checking and page generation,
  not real downloaded font assets or a production deployment. The sandbox also
  denied build-time connections to the local database; existing page-generation
  fallbacks completed successfully and emitted Prisma connection warnings. Thus
  this build does not validate data-backed page rendering. The separate PostgreSQL
  integration suite ran successfully with explicit local-network permission.
- Evidence logs and the exact font fixture are in the sibling
  `../email-reliability-evidence/` directory. The build used a cleared environment,
  dummy auth secrets, no provider key and only a local database URL.
- Independent read-only review performed twice; its findings were addressed,
  including the new-day ambiguity bypass, with regression coverage.

Release integration: monthly admission now uses a trailing 31-day window because the verified provider billing cycle does not reset on the first. This may defer mail longer than the provider would, but prevents a calendar-month reset from prematurely replenishing capacity. Initial unlogged provider traffic still requires conservative reconciliation; the rolling window does not reconstruct missing history.

## Worker runtime and cutover preparation (23 October; not deployed)
The worker base Playwright image is pinned to its observed index digest. Official Node 24.22.1 binaries replace its inherited runtime; SHA256 values for Linux x64/arm64 are pinned from https://nodejs.org/dist/v24.22.1/SHASUMS256.txt. Build verifies the exact version; startup accepts only the tested patched Node 24 line and logs Node version plus Railway commit (no environment dump). Playwright browsers and OS libraries remain unchanged. Linux image build and offline Chromium smoke passed in GitHub Actions run 39973321969 at f0f1115 (Node 24.22.1, Chromium 147.0.7727.15, 2m23s). This did not start worker.ts or verify Railway termination behavior. Local Docker daemon was unavailable; macOS tests remain separate evidence.

Cutover cannot rely on APPLICATIONS_PAUSED alone: email auth, lifecycle, and webhook producers must also be quiesced across web and worker. Railway CLI access and explicit replica scaling are available; Vercel incoming requests/cron must be held with a supported deployment/maintenance control and verified before quota baseline initialization. No such hold has been applied or validated. Existing functions already executing must finish; old senders do not obey the new database gate.

The old worker SIGTERM handler exits without waiting for DB-poll work. Before any stop, establish that no active/ambiguous application or provider request is being interrupted; never reset claims or replay uncertain attempts. The new worker tracks admitted DB/BullMQ work, scheduler, liveness, and notification tasks and awaits them on SIGTERM; this does not retroactively fix the old process. Railway termination grace must exceed the drain, and an external SIGKILL still leaves an uncertain outcome. Baseline initialization requires fresh provider day/month consumption and real reset instants after all old senders stop. Do not use stale 97/99 snapshots.

Apply the four additive migrations only after these gates and patched web/worker builds pass. Preserve legacy account flags/quotas and existing attempts. Rollback retains all additive schema/outbox/reservation data and keeps dispatch held until compatible code is available. Prior Railway SUCCESS is not a tested rollback image after the incident; a restore drill and image availability remain unverified.

### Implemented release controls
Set SENDERS_PAUSED=true on every new web/worker deployment to block all Resend sends (including authentication mail), Gmail/Outlook mailbox sends, and application admission/submission through the existing application pause guard. Unknown nonempty values fail closed. The public nonce health response exposes X-Lavorai-Senders-Paused and X-Lavorai-Node-Version; the worker logs the same hold and runtime with commit. Queued notification payloads remain pending; this switch does not authorize historical replay or change user preferences. Old instances do not implement this switch: retire them and await old function completions before taking the provider baseline. In-flight network calls cannot be undone.

The worker shutdown stops admission/timers and waits for already admitted work before closed-cleanly logging. A claim finishing concurrently with SIGTERM remains tracked through processing; no claims are reset. Host termination deadlines can still interrupt work and must be checked during rollout.

.github/workflows/worker-container-preflight.yml uses standard ubuntu-latest, a 20-minute cap, contents:read, no application secrets and no persisted checkout credentials. Its push trigger is limited to the integration branch and workflow/Dockerfile changes. After the owner verified included Actions capacity, run https://github.com/Geraxi/lavorai/actions/runs/39973321969 passed. Docker network was disabled for the Chromium smoke test; worker.ts was never started. The first run failed because xz-utils was absent; f0f1115 adds that dependency. No premium runners or persistent artifacts/caches were added.
