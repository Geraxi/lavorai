# Release hold and one-owner fictional email check

## Hold customer applications

Set the server variable `APPLICATIONS_PAUSED=true` on every production web and worker runtime. Deploy the pause-compatible build and retire old processes before taking the backup or migrating. The flag does not cancel a request already transmitted by an old process. Unset/`false` allows ordinary operation; any other nonempty value fails closed.

The hold stops new application producers, queues, claim recovery, worker processing, portal submission and application notification email. Existing authenticated login, payment, requested CV optimization, signed receiving/delivery webhooks, Inbox and reply forwarding stay live. User preferences and consent are unchanged. Admin replay/reset routes return an authenticated 503 while held.

Deploy the full repair only after the additive migration succeeds. The full repair rechecks the hold at durable worker admission and immediately before the recruiter-email boundary. Do not remove the hold just because a provider accepted an email.

## One fixed fictional email

The worker image already includes `src/ops/release-email-canary.ts`. The entry runs exactly one attempt and then idles; it does not start `worker.ts` or retry. Configure only the existing worker runtime, with its existing injected credentials:

- `APPLICATIONS_PAUSED=true`
- `LAVORAI_RELEASE_CANARY=email-20261013-owner`
- Existing `INBOUND_EMAIL_DOMAIN=inbound.lavorai.it`
- Automatic `RAILWAY_GIT_COMMIT_SHA` must match the web runtime's automatic `VERCEL_GIT_COMMIT_SHA`; missing build identity fails closed. No shared credential is required.
- Start command: `node --import tsx src/ops/release-email-canary.ts`

The recipient and account must match the exact owner tuple pinned in source. Supply only the approved values as server-only `LAVORAI_RELEASE_CANARY_OWNER_ID` and `LAVORAI_RELEASE_CANARY_RECIPIENT`; different values fail closed. Do not put these values in source, public logs or committed documentation. The sender is fixed to `LavorAI <noreply@lavorai.it>`. The application is `release_canary_email_20261013_owner`, the job is `release_canary_job_20261013_owner`, and the single durable attempt key is `release-canary-email-20261013-owner-v1`.

Before any fixture/attempt write, the runtime performs a credential-free GET to the fixed HTTPS production `/api/health/application-pause` URL. It requires a fresh, noncached nonce-bound response with `applicationsPaused: true`, the exact repair version, and the same deployed commit as the worker. Missing build metadata, redirects, stale/cached or malformed responses, wrong versions, unpaused handlers and timeouts fail closed as `canary_web_pause_not_verified`. The public health handler only returns pause/build identity and probe freshness data; it never reads application records or authorizes privileged work.

There are no recipient, fixture or body CLI arguments and no HTTP endpoint that starts the canary. The fixture has fictional data only, a closed synthetic job, no CV attachment, no customer profile/document access, no AI calls, no application consent timestamp and no round/session. Payload keys are exact: CC, BCC, extra headers, attachments and different bodies are rejected. Fresh owner/fixture checks happen before quota work and after durable attempt persistence, immediately before the provider call. The same normal durable email-attempt function is used.

Quota is not increased or bypassed. If unavailable, the process logs `canary_not_sent` and idles. After the normal quota resets, the operator can restart this exact command. An existing attempt, including an uncertain or rejected one, is reported and never resent. Do not delete or reset the attempt fence.

## Verify before any resumption

1. Require one ApplicationEmailAttempt for the exact application/key and a genuine provider ID. API acceptance alone is not delivery.
2. Require a correctly signed production delivery webhook to mark that attempt delivered. Do not synthesize webhook events or change delivery status manually.
3. Verify the actual message arrived in the owner's mailbox; the subject labels it fictional.
4. Send the one approved reply to the message's fixed Reply-To alias, through the owner's verified mailbox.
5. Require the signed receiving webhook and ordinary body-hydration/routing path to persist ApplicationReply under this application. Verify the stored message appears in the owner's authenticated Inbox as `Test diagnostico`.
6. Confirm no other applications or attempts were created/sent during the hold. The diagnostic has status `diagnostic`, is excluded from daily/monthly customer application quota and public/performance delivery evidence, and its reply does not change employer-interest summary counters.
7. Remove the canary mode and restore the worker command while leaving `APPLICATIONS_PAUSED=true`. Any customer resumption is a separate operator decision. Do not infer permission to resume from canary success.

Logs contain IDs and bounded state/reason codes only, never email bodies, credentials or customer documents. Existing delivery/receiving verification remains unchanged.

## Local verification

`node --import tsx scripts/test-application-pause.ts`

`node --import tsx scripts/test-release-email-canary.ts`

`npm run test:send-reply`

`npx tsc --noEmit`

The new focused checks use mocks and do not send email or connect to production.
