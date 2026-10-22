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
   web/worker instances share this database and account, UTC periods are correct,
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
