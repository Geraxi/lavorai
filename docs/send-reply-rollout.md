# Verified application delivery and reply rollout

## What changes

- Matching is enforced on both discovery passes and again against current user intent before submission. Existing rounds retain their explicit role intent. Unknown geography or eligibility is not invented.
- Job availability is checked before preparation and before the final submit. Temporary blocking/errors are `unknown`, not proof that a job closed. A stopped/ambiguous submission is never silently replayed through another channel.
- Recruiter email delivery requires fresh, literal application instructions on a matching employer job page, plus destination checks. Cached or AI-invented addresses cannot authorize a send. The exact destination and provenance are frozen in the durable attempt.
- Before a provider transmission there is a unique database attempt and durable application fence. The provider idempotency key is stable. API acceptance, server delivery, bounce/complaint, and unknown outcomes are distinct.
- ATS submission requires a job-linked structured receipt, or a newly appearing confirmation with the actual form removed. Generic HTTP 200, an upload, a URL change, or stale success text is not proof. There is no second force-click or automatic cross-channel retry after ambiguity.
- Required factual/consent answers are based on explicit user answers or appropriate direct CV/profile facts. Unknown legal commitments, eligibility, sensitive declarations and other meaningful answers are requested from the user. Explicit form answers are scoped to the exact application/question/options; a generic historical “I agree” cannot authorize another employer’s terms. AI-generated narrative is restricted to supplied CV facts.
- Signed provider events are journaled and deduplicated. They bind to the exact provider ID; crash-gap recovery also requires a signed attempt tag and the exact immutable recipient. Late acceptance can finalize bookkeeping once, without sending again.
- Inbound mail and matched Gmail records are persisted atomically with reply projections. Forwarding has a frozen payload, stable idempotency key and lease. Retries stop before the provider's 24-hour idempotency window expires. Unresolved forwarding remains visible for manual review.
- The inbox displays persisted inbound replies without requiring Gmail. Security codes stay out of the human inbox/counters. Body content is rendered as text; no email-supplied image/link is loaded. Sender/source labels and classifiers are heuristic, not proof of a human.
- Historical weak success markers remain historical and unverified. Customer-facing proof/analytics distinguish accepted emails, delivered emails, confirmed ATS receipts, delivery failures and unknown outcomes. Neither an email open nor delivery guarantees a recruiter response.

## Local validation

All provider requests were intercepted with synthetic responses. PostgreSQL tests use an ephemeral localhost database and generated fixture accounts only. No employer, customer, production database or live provider received a test application.

Relevant commands:

- `npm run test:send-reply`: provider-proof, factual-answer, webhook/outbox, Gmail, inbox, liveness/provenance, public-proof/analytics and send-fence regressions.
- `npm run test:send-reply-postgres`: actual additive migration on populated old-schema fixtures, concurrent attempt/event/reply deduplication, provider-accepted database-write crashes, signed webhook processing, exact-recipient tag recovery and late sender/reconciliation races. Uses an installed `embedded-postgres` (optionally located by `WORKER_TEST_EMBEDDED_POSTGRES`) or an explicitly supplied empty localhost fixture database through `SEND_REPLY_TEST_DATABASE_URL`. The latter requires a `lavorai_send_reply_test` database name and is wired into CI using the existing PostgreSQL service.
- Existing credit-retry, worker-gates, quality, registration/trial, authentication, OTP, lifecycle and MCP suites must remain green.
- `npx tsc --noEmit` and a production build must pass with synthetic build-only configuration. Offline font mocks were used locally; no live database is needed for build validation.

## Deployment approval and order

This patch does not deploy code, migrate production, change provider credentials/webhooks/MX records, or authorize real application tests.

1. Confirm the authorized pause is effective for every producer and consumer. A web health response does not establish the Railway worker is paused or healthy. Preserve already-started/unknown attempts; do not reset their claims.
2. Inventory the current production schema, migration history and deployed web/worker versions using read-only metadata. Confirm backups and an agreed restoration plan. This repository has no committed baseline migration: establish/resolve a reviewed baseline against the actual schema first. Never use `migrate reset` or an indiscriminate schema push on populated production.
3. Obtain explicit approval for the reviewed additive SQL target. Apply the local migration `20261013161000_application_delivery_replies` only after the baseline and database target are verified. It adds nullable proof/consent/application-answer fields and durable event/attempt/outbox tables; old rows are not relabeled, granted consent or re-forwarded.
4. Deploy the matching Prisma client and reviewed web/worker versions together while sending remains paused. Old readers tolerate the added schema, but old senders must not run alongside the new safety logic.
5. Verify existing inbound-domain/MX routing, receiving API capability, webhook subscriptions and signing-secret presence using non-secret metadata. Required delivery events include sent/delivered/delivery_delayed/bounced/complained/failed (and supported suppression events); received events need body retrieval. Any provider authentication/configuration or persistent-access change needs its own exact approval. Never print or export credentials.
6. Use an explicitly approved provider sandbox or controlled self-owned mailbox/ATS fixture to prove receipt, inbound body retrieval, webhook signatures, delivery/bounce mapping, visible inbox reply and forwarding. The local mock suite is not evidence that live provider setup works. Do not test against real employers or upload customer CVs.
7. Resume only the explicitly approved bounded cohort after these checks. Keep trial, plan, consent, matching, liveness and round-cap gates. No bulk retry of unknown, historical or prior-sent applications. Diagnose legacy unverified records without inventing confirmation or changing their meaning.
8. Monitor accepted-versus-delivered counts, delivery failures, unknown attempts, webhook non-2xx, forward `needsReview`, reply source deduplication, and round counters. A provider email accepted but not delivered is not counted as a recruiter outcome. A reply classifier is not a verified human-response rate.

## Rollback

Pause all producers/consumers before rollback. Leave additive columns/tables and all durable attempts/events/outbox payloads intact. Do not replay or drop records. Rolling back to the old sender can reintroduce unsafe retries and false success claims, so keep sending paused until a compatible guarded version is restored. Preserve the new durable webhook receiver/outbox path during a UI rollback: the legacy receiver can acknowledge events without durable processing and can forward duplicates. If receiver rollback is unavoidable, agree a provider-supported event retention/replay plan before the change; do not assume a disabled endpoint retains events indefinitely. Restore application and migration metadata only under a separately approved recovery plan. Historical messages default to forwarding skipped, and no historical backfill/send is part of this patch.

## Remaining boundaries

- Real employers decide whether and when to respond. No implementation can guarantee that outcome.
- Actual provider credentials, DNS/MX, subscriptions and external ATS behavior were not verified by local tests. New or changed ATS response formats fail closed to review.
- Inbound routing can capture only messages sent to the configured alias; direct mail to a candidate's personal address still requires their existing Gmail connection or deliberate forwarding. Ambiguous forwarded messages remain unmatched rather than attaching to the newest job.
- Email server delivery is stronger than API acceptance but does not prove placement in a person's inbox or reading. Bot/proxy opens remain low-confidence signals.
- Exact domain/brand/geography uncertainty can hold otherwise legitimate jobs for review. No inferred work-authorization, citizenship, residence, or new customer preference is introduced to increase volume.

## Provider contract references

Checked against Resend's public documentation on 2026-10-13; these establish API contracts, not this account's live setup:

- [Delivery event payload](https://resend.com/docs/webhooks/emails/delivered): exact email ID, destination and tags; delivery means acceptance by the recipient's mail server.
- [Event types](https://resend.com/docs/webhooks/event-types): provider API acceptance is a different event from delivery, failure, bounce and complaint.
- [Retrieve received email](https://resend.com/docs/api-reference/emails/retrieve-received-email): the receiving endpoint supplies text/HTML body content.
- [Idempotency keys](https://resend.com/changelog/idempotency-keys): provider retention is 24 hours. The forwarding outbox stops automatic replay at 23 hours; it never treats an expired key as safe to resend.
