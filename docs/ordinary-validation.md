# Bounded ordinary-path validation (not activated)

Base: b761afcb51cc28c22d391563e0dbf638ca16e7f0. Local preparation only.

The admin POST /api/admin/ordinary-validation accepts only the configured applicationId.
It calls the ordinary worker without diagnostic authorization, gate overlays or force flags.
Authentication and same-origin checks are required. It never creates or resets a row.
Ordinary eligibility, consent, billing, quota, preparation, lease, submission-budget,
pre-submit checks and completion remain in effect.

A valid scope requires APPLICATIONS_PAUSED=true, USER_NOTIFICATIONS_HOLD=true,
ATS_TEST_REAL_SUBMIT=false, and all ORDINARY_VALIDATION_* fields:
APPLICATION_ID, USER_ID, USER_EMAIL, JOB_ID, RECIPIENT, OFFER_URL, STARTED_AT, EXPIRES_AT.
Maximum window: 30 minutes; propose 15 minutes. Only a fresh row created within the
window qualifies. Account email and the actual normally routed ATS recipient are
separate exact constraints. Only a canonical HTTPS tenant.recruitee.com/o/slug is
supported. Invalid or expired scope closes execution; presence of the application
scope also keeps general producers paused even if the global pause is misconfigured.
Only portal_recruitee may cross the submission boundary in this mode.
This is a narrowly scoped exception to the global pause, not to ordinary gates.

The route refuses previously attempted rows. Concurrent requests meet the existing
ordinary DB claim, lease and submission fences. Unknown provider outcomes retain
the existing no-replay state. Expiry is checked again before submission; it does not
cancel a request already accepted by the provider. Never retry an uncertain result.

## Local evidence

The ordinary PostgreSQL suite uses disposable data and fake providers, exercising
the actual admin handler, worker, gates and Recruitee adapter. Concurrent selected
requests produce one simulated candidate POST; unrelated direct worker calls,
cron and queue drain remain held, and customer notification count does not increase.
It also checks invalid account, missing consent, wrong origin/admin/application,
expiry and attempted-row refusal. Existing ordinary tests cover quota concurrency,
CV refusal, ambiguous outcomes and truthful receipts. These tests do not establish
production AI/storage credentials, real CV preparation, receiving DNS or mail delivery.

## Exact next approval bundle

1. Publish this patch after final CI, with all existing production holds unchanged.
2. Approve ONE fresh synthetic ordinary user/profile/CV/job/application fixture,
   owned Recruitee offer and exact normal routed recipient. Record the concrete IDs,
   URL and recipient before activation. No customer data or entitlement shortcuts.
   If current ordinary policy cannot admit the synthetic fixture, stop for a policy
   decision rather than granting a plan, changing consent or bypassing eligibility.
3. Approve a 15-minute scope configuration and one authenticated admin invocation.
   Capture candidate/mail baseline first; coordinate a single operator. The prior
   diagnostic offer/candidate is not authorization for another submission.
4. Remove scope after completion/refusal/uncertainty, retain both holds and real-test
   flag false, and verify technical receipt, candidate count and dashboard state.
   Provider auto-confirmation to the owned recipient is possible; notifications
   from LavorAI remain held. No retries, replay, customer rollout or billing changes.

No migration is required. No live invocation or configuration change was performed
while preparing this patch. This validates ordinary worker preparation and completion;
paused automatic admission producers are tested in isolation, not opened in production.

## Read-only owner preflight

GET /api/admin/ordinary-validation/preflight requires the existing admin session,
accepts no parameters, and is fixed to internal account cmvnz41b9pvoty0ufujkkx0zw
and the ProduzioneWeb ordinary-validation posting. It reads metadata and quota
counts only; it never creates a fixture, verifies consent, reserves quota, calls a
provider, or executes an application. Missing fixture and mailbox ownership remain
unknown, even when recorded account checks pass. No CV contents are returned.
Daily quota is informational; shared ordinary billing/weekly usage and existing
application-policy calculations are reused. Snapshot counts are not reservations.

## Complete owner flow

/admin/ordinary-validation is admin-session protected. Page load is inert.
Prepare requires the owner to enter the approved phone and explicitly accept
privacy processing and this application. A per-user transaction creates the
missing synthetic profile, one source PDF/document and one deterministic ordinary
application; existing profile/CV or conflicting posting rows are not overwritten.
Repeated prepare is idempotent; a closed fixture cannot reopen. Consent uses the
actual click time; actor and notice URL are retained with fixture provenance.
The source PDF is a bounded inline database object, avoiding public source uploads.
Generated application documents still follow the existing ordinary storage path.

The internal account remains Free; no trial, subscription or quota reset occurs.
Only mode manual is enabled; autoApplyOn remains false and all global holds remain.
Recipient attestation is a distinct explicit owner action with existing receiving
evidence. It is owner-provided evidence, not an independent delivery probe.

The operator then configures the existing exact scope for 15 minutes, using the
prepared application ID/job/user/email/recipient, and ORDINARY_VALIDATION_CREATED_AT
equal to the returned preparation timestamp. STARTED_AT is the activation time,
not backdated preparation. No configuration/credential API is exposed in the UI.
The owner can then invoke exactly once. A durable transaction marks the fixture
running before calling the ordinary worker without diagnostic options. Worker
claims for this fixed fixture require that marker. Concurrent attempts are refused.

Run always closes in finally after the worker returns or throws; close sets mode
off and marks the fixture permanently closed. The close button is also available
for abandonment or a disconnected request; it does not send. If the runtime is
killed before finally, use close and inspect existing outcome, never run again.
Closing does not cancel a request already accepted by the provider. The operator
removes all ORDINARY_VALIDATION_* configuration afterwards and verifies holds.
Expiry/closed marker/mode-off independently prevent new work. No GET performs setup.
