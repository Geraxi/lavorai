# Product analytics

Set `NEXT_PUBLIC_POSTHOG_KEY` to the PostHog project token and optionally
`NEXT_PUBLIC_POSTHOG_HOST` (default `https://eu.i.posthog.com`). Public variables
must be present at build time. No key means no initialization, requests or errors.
Browser ingestion uses `/ingest` Next rewrites; static SDK assets use the EU asset
host. Enable session replay for the project in PostHog.

The existing `lavorai-cookie-consent` banner controls capture. Only `accepted`
enables PostHog; essential-only, missing consent and unavailable storage disable
capture. The browser mirrors the choice to `lv_analytics_consent` for request-time
checks. Authenticated consent is stored as a `posthog_consent` row in the existing
ConversionEvent table, using one upserted `posthog-consent:<userId>` key. This lets
workers and Stripe webhooks check consent without a browser request or a schema
change. This consent row is internal and is never sent to PostHog. A revoked
choice stops replay, opts out and clears the PostHog identity; the provider syncs
revocation to the server and across open tabs. An unavailable consent store fails
closed. Signup's required privacy checkbox is not analytics consent.

Authenticated users are identified by internal user ID and plan only; logout
resets identity. Autocapture, automatic page views and automatic exceptions are
disabled. Replay masks all inputs and CV/cover-letter containers. Explicit error
capture sends a generic exception with a static route label for API errors,
never the original message/stack, which may include candidate or provider data.
No emails, CV text, letter text, job titles or arbitrary business payloads are sent
as event properties. Events that occurred without consent are not buffered.

| Event | Trigger | Properties |
| --- | --- | --- |
| `signup_started` | Signup screen shown | — |
| `signup_completed` | Account created (email or OAuth), server | `plan` |
| `plan_selected` | Pricing, membership or paywall plan chosen | `plan` |
| `card_setup_started` | Stripe checkout session created, server | `plan` |
| `card_setup_completed` | Verified saved card or valid subscription, Stripe webhook | `plan` |
| `application_preview_viewed` | Tailored preview displayed | — |
| `application_sent` | Proved submission committed, server/worker | `plan`, `free_remaining` |
| `free_quota_exhausted` | Last Free send committed or quota rejection, server | `plan`, `free_remaining` |
| `upgrade_wall_viewed` | Upgrade wall displayed | — |
| `upgrade_clicked` | Upgrade action chosen | `target_plan` |
| `subscription_started` | Valid active/trialing subscription, Stripe webhook | `plan` |

Server SDK clients always await shutdown, including on failure. Stable
`$insert_id` values deduplicate subscription lifecycle/webhook retries and sent
applications. `application_sent` means proved portal submission or provider email
acceptance, not verified delivery to an inbox. `free_remaining` is the remaining
lifetime Free allowance, including for paid accounts; it is not a paid quota.

Validation: `npx tsc --noEmit`, `npm test` (includes PostHog regression tests).
For deployment smoke testing, use a test project key, accept/reject consent and
inspect `/ingest` requests, replay masking, login/logout identities and the event
table in PostHog. Production keys are not needed by the automated tests.
