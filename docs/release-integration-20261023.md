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
4. `20261023120000_email_quota_baseline`

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


## Incident containment and remaining cutover — 23 October 16:35 UTC

The owner promoted f0f1115 before migrations/worker coordination. Runtime logs
confirmed User P2022 on /admin/users, /api/preferences and /api/sidebar-stats.
After explicit rollback approval, production returned to 8efe5fc at 16:28 UTC.
No database migrations or worker changes were made. Authenticated admin recovery
has not been independently exercised. Preview f0f1115 still reports Node 24.21.0
at 16:32 UTC; do not promote it until the runtime security gate passes.

Runtime endpoint verified using authorized Neon CLI metadata:
project curly-silence-16024948, branch br-aged-band-al1r48g9, database neondb,
endpoint ep-gentle-butterfly-aljrsiuw (Frankfurt). The configured DIRECT_URL
points to another project in us-east-2; never use it for migration. No credentials
were exported or changed. Use explicit project/branch selection and validate the
resolved endpoint for each operation. Read-only schema checks are repeatable with
scripts/release/preflight-readonly.sql through neon psql; they do not prove host
quiescence or inspect external provider activity.

The four migrations are nullable column additions or new empty tables/indexes.
They preserve legacy rows and trial markers and are structurally compatible with
the old worker. This is NOT behavioral compatibility for the new trial cohort:
the old worker must not process new activations before its coordinated upgrade.

Remaining execution gates, in order:
1. Verify a patched web runtime. Do not take production offline while this gate
   has no completion path. Verify restore availability before DDL; configured
   six-hour retention is not a tested restoration.
2. Arrange a bounded maintenance window: hold production requests and scheduled
   producers, wait for already running functions, and fence any preview/direct
   deployment URLs that can use the same provider/database. Vercel project pause
   covers production traffic only; it is not proof that every preview is held.
   Existing cron invocations continue through deployments. Inventory GitHub cron
   callers and other account senders too. Never attest quiescence from a pause
   setting alone. Authentication mail/webhooks may be temporarily unavailable.
3. Verify old worker current jobs, provider attempts and admission are idle, then
   stop the old worker explicitly and confirm zero running replicas before
   starting the replacement. Ordinary Railway redeploy can overlap processes;
   default termination grace can be zero. Do not rely on old SIGTERM handling.
   Never reset the seven historical claimed queued rows observed during preflight.
4. Apply reviewed migrations with bounded lock timeout and migration-history
   checksum verification on the confirmed runtime database, using the repository
   migration tooling. Do not db-push or mark a migration applied without execution.
5. Deploy compatible web/worker with SENDERS_PAUSED=true; verify exact SHA, runtime,
   pause reporting and no old process. Preserve existing plans and communication
   choices. Do not let old claimed rows become eligible through recovery at start;
   review the historical admission cutoff before any resume, without resetting rows.
6. Obtain a fresh provider observation AFTER quiescence. Last reported consumption
   was 100/100 daily and 663/3000 monthly, NOT a usable current initialization input.
   Daily reset was 2026-10-24T00:00Z; monthly reset must be re-read, not assumed to
   be the first. Initialize the conservative baseline atomically and read it back.
7. Validate schema, holds, worker logs and all prerequisites while held; then resume
   only fresh authorized work. No synthetic real sends, historical replay, trial
   grants or quota increases. If any gate fails, keep dispatch held and retain
   schema/evidence. No silent automatic fallback to an old sending worker.

Official operational references:
- https://vercel.com/docs/cli/project (pause covers production traffic)
- https://vercel.com/docs/cron-jobs/manage-cron-jobs (running cron jobs continue)
- https://docs.railway.com/deployments/deployment-teardown (overlap and drain)
