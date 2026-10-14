# Temporary manual-only producer controls

This build has no enabled automatic application mode. `automaticApplicationsBlocked()` deliberately returns true even when the manual rollout is correctly configured. User preferences are not rewritten to implement the hold.

## Admissions

- New explicit `/api/applications/apply` and `/api/applications/apply-batch` requests require the configured manual rollout to be open. They stamp creation and immediate per-application consent with the same server timestamp. Single apply rejects any existing application for that user/job; batch retains its existing deduplication. Worker admission independently blocks repeat user/job attempts.
- `/api/applications/consent` only releases the current user's untouched `awaiting_consent` applications created strictly after the rollout start. Historical rows cannot become eligible by receiving new consent. Attempted, retried, previously claimed and evidenced rows remain unchanged.
- Queue publication and both DB/BullMQ claims check new creation, fresh explicit consent, no prior attempt evidence and zero retries. Claims require `startedAt = null`; stale ownership is never stolen. Polling is read-only and does not run recovery.
- Atomic worker submission-budget reservations enforce the global UTC daily ceiling across workers and delivery channels. Queue notification or application creation is not a budget reservation. A queued application is not proof of delivery.
- Manual record-only import remains independent of rollout admission; it records an application the user already sent outside the service and never queues a send.

## Suspended paths

Automatic cron/onboarding/admin producer calls, both self-heal helpers, claim recovery/reset, the dormant trial reset helper, CAPTCHA/credit/stuck retries, admin application repair/reset/test replay, session backfill and corresponding operational reset scripts cannot run live. Credit-failure preview remains read-only. New BullMQ jobs have one attempt and no stalled replay.

The one-click activate-auto link does not update preferences or release old rows. Dashboard/applications controls show the server-derived paused or manual-only service state instead of implying that a saved automatic preference is currently active; the saved preference is unchanged. Question history can still be read; the question-answer POST is temporarily blocked because its existing workflow also resumes applications. Session listing performs no automatic archival, and selecting an existing round does not rewrite its label or timestamp. Completing a newly submitted application may legitimately update that selected round's progress.

## Configuration and release safety

The shared rollout configuration requires `APPLICATION_ROLLOUT_MODE=manual_only`, an approved exact UTC ISO start timestamp, and an explicit positive daily cap of at most 10. Missing, invalid, future or unknown settings fail closed. The existing `APPLICATIONS_PAUSED` hold takes precedence. Do not invent a start timestamp, rewrite old application timestamps, backfill consent, run reset scripts or enable a deployment as part of a preview.

Web and worker must use the same reviewed build and approved configuration. The required submission-budget migration, environment changes and removal of any operational hold are separate release actions and require the applicable approval and independent review. This document does not authorize them.

## Global budget and operations

`ApplicationSubmissionReservation` is an append-only safety ledger. The shared PostgreSQL advisory transaction lock serializes every account and email/ATS channel. The database clock is read after that lock. Reservation and `SUBMISSION_STARTED` are committed in the same transaction before any employer data transmission. An in-flight attempt crossing UTC midnight must also consume a slot on the new day before final submission. Rejected, abandoned, uncertain and known-no-send attempts are deliberately not refunded during this rollout. Rechecks cannot change the application, worker token, destination channel or rollout cutoff. Lowering a cap below consumed reservations blocks subsequent final gates.

No foreign-key cascade removes the ledger. Its hashed user/job scope prevents deleting and recreating an application from enabling a repeated attempt; it stores no CV, applicant name or contact address. Keep this ledger when rolling back code/configuration. Never drop it to reset usage, and never reset historical application state or consent.

This counts conservative customer-submission attempts, not only confirmed deliveries. Provider delivery, inbound reception and reply-forwarding capacity are separate. No budget reservation is used for an inbound message or customer notification. Existing per-user creation quotas and round caps still apply.

An attempt held at the budget/eligibility gate is not automatically retried the next day. Crashed preparation, unanswered forms, CAPTCHA and uncertain outcomes remain held for explicit review; the temporary rollout does not introduce a browser-session handoff or question-answer resumption. These held rows also retain a round-capacity slot until manual review or completion, even after the global day resets. This is intentionally conservative.

Deployment order: maintain `APPLICATIONS_PAUSED=true` on both runtimes; apply and verify the exact additive migration; deploy the same reviewed commit to web and worker; configure `APPLICATION_ROLLOUT_MODE=manual_only`, `APPLICATION_ROLLOUT_DAILY_CAP=10` and the same approved fixed `APPLICATION_ROLLOUT_START_AT` in UTC on both. Unset `LAVORAI_RELEASE_CANARY` so the consumed fixture cannot replace the ordinary worker. Preserve its durable attempt/reply records. Restore the normal worker command `node --import tsx worker.ts` (equivalent to Docker's `npx tsx worker.ts`) while still paused. Confirm configuration and zero unintended sends, then remove only the global hold under the release owner's authorization. Automatic producers stay blocked in code; customer preferences and existing scheduler times are unchanged.

Credential-free verification: `/api/health/application-pause?nonce=<32 lowercase hex>` retains its exact five-field fresh/noncached body. Version is `delivery-replies-manual-rollout-20261014-v2`. Headers `X-Lavorai-Rollout-Mode`, `X-Lavorai-Rollout-Cap`, `X-Lavorai-Rollout-Start` and `X-Lavorai-Automatic-Producers` report only validated nonsecret policy. Closed/invalid configuration reports `closed`, `0`, `unavailable`, `blocked`. The ordinary worker logs one bounded `manual_rollout_configuration` JSON record with validated mode/cap/start, pause state and automatic-producer hold. Neither output reads or exposes credentials.

## Hermetic verification

Run `npm run test:manual-rollout` for configuration, producer and service-visibility coverage. It uses actual source modules with isolated service boundaries, exercises automatic/retry/reset blocks and fresh explicit admissions, and asserts that blocked entrypoints never touch a database, provider or queue. Existing legacy algorithm tests retain explicitly mocked gates solely for regression coverage; those mocks are not runtime configuration or a production bypass.
