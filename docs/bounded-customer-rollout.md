# Bounded Recruitee rollout (inactive on release)

This release does not authorize customer sending. Keep APPLICATIONS_PAUSED=true,
USER_NOTIFICATIONS_HOLD=true and ATS_TEST_REAL_SUBMIT=false; remove all
ORDINARY_VALIDATION_* variables. Leave CUSTOMER_ROLLOUT_ENABLED and
CUSTOMER_ROLLOUT_MANIFEST absent until the exact cohort is separately approved.
No schema migration is introduced. Existing ApplicationReleaseBatch and
ApplicationReleaseGrant tables are required; the consolidated admin report checks columns, defaults, validated CHECKs, primary/foreign
keys and the grant index against the real migration. It does not fabricate migration history.
An incompatible result blocks activation; no production migration is performed by this release.

## Activation prerequisites and configuration

Recommend a first batch of ONE eligible, fresh, never-attempted queued application,
15 minutes maximum. Support is limited to canonical https://<tenant>.recruitee.com/o/<slug>.
Custom domains and other adapters are excluded. Up to five exact applications and
five attempts are supported, with a hard maximum 30-minute window. No general queue
scan, automatic matching producer, historical replay, account seeding or consent
change is enabled. If no eligible fresh queued row exists, selection/preparation
needs separate review; do not manufacture consent or reset quota to fit the cohort.

Before approval, read each exact user/job/application binding, actual routing email,
CV readiness, job validity and ordinary consent/preferences/verification/billing/quota.
Confirm receiving ownership where normal routing requires it. The worker repeats
ordinary checks; a manifest never supplies missing consent, answers or entitlement.
Confirm no old worker/version is running with different controls. Notifications remain held.

CUSTOMER_ROLLOUT_ENABLED=true plus CUSTOMER_ROLLOUT_MANIFEST JSON:

```json
{
  "batchId": "approved-unique-batch",
  "startedAt": "2026-10-26T18:00:00.000Z",
  "expiresAt": "2026-10-26T18:15:00.000Z",
  "notBefore": "2026-10-26T17:45:00.000Z",
  "maxAttempts": 1,
  "applications": [{
    "applicationId": "exact-application-id",
    "userId": "exact-user-id",
    "jobId": "exact-job-id",
    "createdAt": "2026-10-26T17:50:00.000Z",
    "url": "https://employer.recruitee.com/o/approved-role",
    "recipient": "verified-candidate@example.test"
  }]
}
```

Example only; never deploy these placeholder values. Creation must be within the
explicit cutoff and before start; cutoff cannot exceed 24 hours before start.
Invalid, disabled, expired or malformed configuration fails closed and keeps general
producers paused. Activation requires a coordinated deployment and verification of
live version/holds/configuration. The authenticated existing cron drain is the only
scheduled cohort consumer; no diagnostic endpoint or test bypass is involved.

## Budget, monitoring and stop

A PostgreSQL transaction consumes a unique application grant and shared batch budget
with the ordinary work lease. Failed preparation still consumes a grant. No refund,
new invocation, continuation or ambiguous-result retry is permitted for stamped rows.
A later general reopening cannot replay a stamped attempt. Concurrent invocations
share the cap; a batch may have multiple in-flight members up to that cap.

Use /admin/customer-rollout in the existing admin session: Read current status is
read-only; Stop this batch is authenticated and origin checked. GET
/api/admin/customer-rollout returns selected application outcomes, budget and holds,
without CV contents. Stop atomically writes a separate `customer-stop:<batchId>` zero-budget tombstone,
using the same advisory lock as grant admission. The original maxCount/usedCount and
all grants remain unchanged, preserving the SQL CHECK usedCount <= maxCount.
The tombstone is checked before every new grant and submission recheck; it cannot
be reopened by the same manifest or by a restarted drain. Stop also works before the first grant. The same-origin POST accepts
{"action":"stop","batchId":"exact-batch-id"}. It cannot activate or send.

Monitor persisted status, submitConfirmation, submittedAt and sendFailureReason;
HTTP cron success alone is not application acceptance. Stop on an unexpected
recipient/provider, lost hold, error, refusal or uncertain submission. The drain
automatically stops the batch after an unsuccessful granted attempt or thrown error.
Other concurrent attempts may already be in flight. Stop/expiry is checked before
submission but cannot recall a request already sent or eliminate the final
check-to-network race. A verified late provider acceptance is still persisted.

After completion/expiry, remove both CUSTOMER_ROLLOUT_* variables, deploy and verify
holds and status. Retain grants/receipts for audit. Never retry uncertainty, reset
usedCount, delete grants or reuse stopped batch IDs. Notifications remain held;
provider acceptance, delivery and actual replies are separate evidence.

Rollback of code is safe only with all holds retained and cohort configuration
removed. Do not run an older worker against active cohort configuration. This
release alone is not authorization to activate, unpause or contact anyone.

## Consolidated read-only prerequisite report

Open /api/admin/customer-rollout once in the existing admin session (or press Read
current status on the admin page). No preparation or activation occurs on GET.
The report checks the actual release-table metadata and examines up to 20 fresh
queued Recruitee rows from the preceding 24 hours, newest first. A truncation flag
means this is not a complete inventory. Founder/admin and internal/test accounts
are excluded. No customer consent or settings are changed.

For each row it returns exact IDs/time/offer, actual ordinary policy and admission
results, quota snapshot, duplicate/reservation checks, profile/CV presence and
resolved candidate recipient. Only inbound metadata (receipt time and presence of
a provider ID) is included, never email bodies, CV contents or secrets. Stored
user/application routing and provider-received evidence are distinguished from
verified account-address ownership; none is silently treated as a successful ATS
receipt or current proof that a mailbox works.

Rows without recorded blockers remain `requires_review`, not authorized/ready:
review actual current offer liveness/required fields, readable CV selection and
receiving evidence. Those checks must not be manufactured by the platform owner
on behalf of the candidate. Transactional worker checks repeat at execution.
If no suitable fresh rows are available, do not release old backlog, change consent
or create synthetic customer eligibility to make the report pass.
