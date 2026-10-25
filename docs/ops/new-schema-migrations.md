# (B) New schema migrations

This document is (B) only. It is not the 24/10 history procedure.

**(A) Migration-history reconciliation** — seven `_prisma_migrations` rows
from 24/10. Those rows change no schema. Procedure:
`docs/ops/migration-history-resolution-20261024.md`.

**(B) New schema migrations** — additive objects in the new PRs. Listed
here. Do not treat (A) as a prerequisite of (B) unless a deploy or apply
path runs a Prisma migrate command that walks pending history.

REVIEWED, NOT APPLIED. Every write is pending approval.

## Inventory

| Migration | PR | Schema change | Required for the one owned-destination email test |
|---|---|---|---|
| `20261025140000_email_test_attempt` | #104 | `EmailTestAttempt` table and unique `(runKey, destination)` | **Yes. This is the only (B) migration required.** |
| `20261025020000_application_release_budget` | #104 | `ApplicationReleaseBatch` / `ApplicationReleaseGrant` | No. The email-test one-time key does not use these tables. |
| `20261025150000_email_log_outcome` | #105 | `EmailLog.outcome` / provider-id columns | No. #104 `sendWithinQuota` does not write those columns. |

#106 (CV-log redaction) has no schema migration.

`20261025140000_email_test_attempt` is already a separate file from
`20261025020000_application_release_budget`. The release-budget
migration is not a prerequisite of the email test.

## Is (A) required for the one email test?

**(A) is not required.** `vercel.json` `buildCommand` is
`prisma generate && next build`. That deploy path does not run
`prisma migrate deploy`, `prisma migrate resolve`, or any other Prisma
migrate command.

(A) would be required only if an apply path ran a Prisma migrate command
that walks pending directories. `prisma migrate deploy` would see the
seven 24/10 folders as pending and try to re-apply objects that already
exist on EU. That command stays prohibited until (A) is resolved for
its own reason. Do not make the seven history rows a prerequisite of
the email test. Do not make unrelated (B) migrations prerequisites.

## Apply only the required (B) migration (pending approval)

After the owner approves this one write, and only this one:

```bash
set -euo pipefail
# Load DIRECT_URL and DATABASE_URL without printing them:
#   printf 'DIRECT_URL: '; read -rs DIRECT_URL; printf '\n'
#   printf 'DATABASE_URL: '; read -rs DATABASE_URL; printf '\n'
#   export DIRECT_URL DATABASE_URL
./scripts/ops/assert-eu-target.sh
npx prisma db execute --file prisma/migrations/20261025140000_email_test_attempt/migration.sql --schema prisma/schema.prisma
```

The guard is fail-closed. A non-zero exit aborts the shell before the
write. Do not apply `20261025020000_application_release_budget`. Do not
apply `20261025150000_email_log_outcome`. Do not run
`prisma migrate deploy`. Do not resolve the seven (A) names.

After the table exists, the one-time key is
`EmailTestAttempt.(runKey, destination)`. Optional and still (B) only:
record that one history row so a later `migrate deploy` (once (A) is
done for its own reason) does not try to create the table again.

```bash
set -euo pipefail
./scripts/ops/assert-eu-target.sh
npx prisma migrate resolve --applied 20261025140000_email_test_attempt
```

## One owned-destination email test

Customer applications stay paused. Do not set `APPLICATIONS_PAUSED=false`.
Leave `ATS_TEST_REAL_SUBMIT` and `APPLICATION_RECOVERY_RELEASE` unset.

1. Deploy #104. #105 and #106 are not required for this test.
2. Apply only `20261025140000_email_test_attempt` as above.
3. `POST /api/admin/email-test-send` with `X-Admin-Key` equal to
   `ADMIN_SYNC_KEY` (never log the key) and body:

   ```json
   {
     "destination": "reply+release_canary_email_20261013_owner@inbound.lavorai.it",
     "runKey": "20261025-owned-inbound-1"
   }
   ```

4. The JSON records the sanitized provider result (`accepted`, `emailId`
   or `errorName` / `statusCode` / `message` with secrets redacted) on
   `EmailTestAttempt.providerResult`. A durable
   `ApplicationEmailAttempt` is also written before the provider call.
5. `GET /api/admin/email-test-send?runKey=20261025-owned-inbound-1&destination=reply%2Brelease_canary_email_20261013_owner%40inbound.lavorai.it`
   with the same admin header. That read returns delivery evidence
   (`provider_accepted`, `inbound_received`, bounce/complaint, or
   `not_sent`). It does not send again.

`runKey` must be unique per destination. A repeat of the same pair
returns 409 (`email_test_duplicate_key`).
