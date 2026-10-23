# Coordinated release integration — 23 October 2026

This combines application safety + email reliability (`1588fa1`, based on
`72ca061`), current main (`8efe5fc`), the local value-first activation work,
and the supplied admin statistics patch. It does not include PR82.

Integration repairs:
- Both automatic-producer selects and the locked fresh-application admission
  read `subscriptionStatus` and `trialActivationVersion`. New activated trials
  share a five-per-day budget across manual and automatic creation; legacy
  subscription caps and quota-reset markers remain unchanged.
- New trial lifecycle reminders select only the new activation cohort and use
  the actual Stripe deadline. No existing subscription is enrolled retroactively.
- Verified Stripe activation queues the day-zero confirmation with a stable
  subscription event key. Repeated webhooks cannot produce a new notification
  identity. Historical unmarked subscriptions do not receive this new event.
- The obsolete timestamp-only admin trial grant returns authenticated HTTP410,
  without touching eligibility, billing, quota or email. It cannot truthfully
  grant card-backed access under the new model.
- Email monthly admission counts the trailing 31 days, conservatively covering
  provider billing cycles that do not reset on the first. Initial unlogged
  provider traffic still requires reconciliation.

## Release gates (not production actions)

Do not merge to main or migrate production until coordinated worker access and
runtime versions are verified. The deployment image is Dockerfile.worker's
Playwright image; a generic Dockerfile says nothing about its actual Node.
Verify Node patch versions against the October2026 security advisory on both
web and worker. Vercel's `24.x` setting and a READY build do not prove the patch.
The WAF does not protect downloaded remote responses. A worker container build
and runtime smoke test are required after any Node image update.

Before enabling producers, stop or drain old web/worker/cron executions. Apply
reviewed additive migrations in order:
1. `20261021110000_application_sent_notification`
2. `20261021210000_value_first_activation`
3. `20261022110000_email_reliability`

Verify migration history/checksums and a current restore point first. These
migrations do not backfill users, notification intents, consents, counters or
historical applications. Production schema must not be reset or db-pushed.
Deploy the same compatible code to web and worker, verify runtime SHA and
notification-pump health, then resume only authorized fresh work. Do not change
existing rollout controls as a side effect of this release.

Reconcile actual provider usage against logs/reservations before admitting any
email. Waiting for a daily reset does not reconcile the monthly baseline.
At the observed daily quota boundary, a new empty reservation table is not proof
of available quota. Do not replay historical pending applications or rebuild
notification intents to populate the queue.

Rollback requires stopping producers first. Keep additive tables, reservations,
provider evidence and activation markers. A Vercel rollback alone leaves a mixed
worker/web fleet and is not a safe rollback. Restoring old signup logic after new
users are created would restart the unwanted registration-time trial behavior.

## Verification boundaries

Local mocked-provider suite and typecheck; real disposable PostgreSQL concurrency
checks for quota, idempotency and mixed manual/automatic admission; additive SQL
against the exact main schema with synthetic legacy rows. The offline webpack
build uses mocked Google Font responses and a dummy localhost database, so it
cannot verify production data rendering, provider authentication, worker health,
real sends or runtime patch versions. No real applications or emails were sent.

## Atomic provider quota initialization

Apply additive migration `20261023120000_email_quota_baseline` after the email
migration. It creates an empty ledger only. It does not populate consumption or
send anything. Initialization is a separate reviewed operator transaction.

1. Stop every web/cron/worker email producer, including old instances. Wait for
   in-flight requests to settle or retain their uncertainty conservatively. The
   database gate cannot fence code deployed before this feature.
2. Read actual provider usage and daily/monthly reset timestamps after quiescence.
   Prepare JSON with `id` (unique observation identifier), `observedAt` (ISO),
   `dailyConsumed`, `monthlyConsumed`, `dailyResetAt`, `monthlyResetAt`. No keys or
   customer data belong in this file. Observations older than5minutes fail closed.
3. Review the non-mutating command:
   `node --import tsx scripts/initialize-email-quota.ts --snapshot=/private/usage.json`
4. Only after producer coordination is verified, use the same command with
   `--apply --producers-quiesced` against the verified production database.
   The transaction locks the shared dispatch gate, rejects an active lease,
   and records the provider floor plus unresolved pre-existing reservations.
   Reusing the observation identifier with different inputs fails; repeating an
   identical observation returns the original immutable row. No counter drops,
   quota increase, email retry or historical intent creation occurs.
5. Read back usage before resuming. Daily97 with local90 results in floor97,
   not187 and not90. With the unchanged95 daily safety cap all new email
   admissions remain deferred until sufficient capacity exists. No extra quota
   is invented to use the provider's remaining3messages. After the actual daily
   reset, the monthly floor remains until its actual provider reset; meanwhile
   new reservations count above it. Multiple observations combine by maximum.
   After expiry the conservative trailing31-day local ledger still applies.

The `--producers-quiesced` flag is an operator attestation, not an automatic
worker shutdown or proof that older processes stopped. Do not run the production
command while Railway access prevents verifying that prerequisite. Unknown
traffic outside the coordinated account is not made safe by a database lock.
