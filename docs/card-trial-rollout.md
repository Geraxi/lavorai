# Card-upfront limited preview: local implementation and release checklist

Status: LOCAL REVIEW ONLY. Based on main `0abc6f1`; branch `task/card-upfront-trial`.
No commit, push, deployment, production migration, Stripe settings change, charge,
email send, live provider call, or credit purchase was performed.

## Contract implemented

- Only new accounts at/after the immutable rollout boundary join `card_preview_v1`.
  The first cutoff is stored in `CardTrialRollout`; each account is also marked in
  `CardTrialPolicy`. Removing/changing environment configuration cannot make those
  accounts legacy. Existing accounts retain their existing trial and paid terms.
- A verified email, available funded/configured provider, and card-only Stripe
  Checkout are required. The trial is **three days from completed checkout** via
  `subscription_data.trial_period_days = 3`, not from signup or webhook receipt.
- Stripe's actual `trial_start`/`trial_end` are persisted once. A verified card and
  a valid three-day trial unlock one saved CV and cover letter for one chosen job.
- Trial accounts stay on the technical `free` tier. No applications, profile AI,
  anonymous-API workaround, transcription pairing-code workaround, or other paid
  feature is enabled by `trialing`, `active` alone, or a success redirect.
- Paid access requires the current owned subscription, a positive paid invoice,
  a matching subscription/price recurring invoice line, and a current covered
  service period. The paid-through deadline comes from that invoice line, not a
  possibly advanced subscription period. Failed/paused/canceled/unpaid states are
  closed; a zero-value trial invoice does not enable applications.
- Pro stays EUR 19.99/month for 50 applications; Pro+ stays EUR 39.99/month with its
  existing unlimited/fair-use promises. No paid limits were repriced.
- Membership shows exact verified trial-end time (UTC), selected monthly price,
  automatic renewal, and management/cancellation. Verification email resend and
  status refresh are available without an onboarding redirect loop.
- Checkout repeats reuse the fixed attempt/session/tier. Confirmed-expired
  sessions can start a fresh attempt; incomplete unknown outcomes older than 23
  hours require reconciliation before Stripe idempotency keys can expire.
- New-cohort subscription mutations use the Stripe portal and the shared verified
  webhook reducer, preventing the old resume endpoint from writing Pro directly.

## Preview failure and concurrency rules

`CardTrialPreview` is keyed by user, with an immutable chosen job and atomic
reservation before the provider call. One-shot generation disables SDK retries
and provider fallback. Completed output is persisted and replayed after reload.

Definite rejected/no-output requests can retry the same job, up to three total
reservations. A failed attempt is not counted as a successful preview. A timeout,
unknown provider result, malformed/billable output, or uncertain database result
stays reserved for reconciliation; there is no time-based takeover or blind
regeneration. Uploading another CV never clears the new ledger. Saved output can
still be read during its trial window when the provider readiness switch is off.

## Additive schema, not applied to production

Review `docs/card-trial-schema.sql` and `docs/card-trial-preview-schema.sql`.
They create **six** tables and do not alter or add columns to `User`:

1. `CardTrialRollout`: singleton immutable launch timestamp
2. `CardTrialPolicy`: per-account policy marker
3. `CardTrialEnrollment`: checkout, verified card, subscription, and paid period
4. `CardTrialWebhookEvent`: event-ID deduplication in the entitlement transaction
5. `CardTrialPreview`: job-locked quota, reservation, retry count, saved JSON output
6. `CardTrialReferralReward`: frozen reward intent and atomic completion evidence

User-related rows use existing `User.id` foreign keys and cascade on account
removal. No generated Prisma models are needed; application queries are tagged,
parameterized SQL. Login/session selectors remain narrow and add only `id`, an
existing primary-key column. Legacy installations without these tables remain
compatible while rollout is disabled. Other database errors fail closed.

### Evidence needed before production migration

Obtain an authorized **schema-only** view of the intended production database:
confirmed environment/project/database identity, tables/columns/types/defaults/
constraints/indexes for `User`, `CVDocument`, `Job`, and relevant billing/profile
fields, plus migration history and the proposed new-table names. No customer rows,
password hashes, API keys, or connection strings should be pasted into a report.
Compare that schema against all touched routes. Existing production drift is not
resolved by these additive tables; do not use `db push`, destructive reset, or
assume the current Prisma schema exactly matches production.

## Safe rollout order

1. Decide new-cohort referral/promo policy and legal/trial disclosures first.
   Existing credits are preserved and not consumed by the new checkout. The new
   checkout does not silently accept a zero-price offer that the paid gate would
   refuse. New public referral wording explicitly says eligibility is under review.
2. Review backup/recovery and the exact database target, then apply the additive
   schema through an approved migration process. **This has not been authorized or
   performed here.** Never run the historical SQLite reset instructions.
3. Deploy code with rollout disabled, inspect legacy login/trial/paid behavior,
   and check all required old production columns independently.
4. Exercise Stripe **test mode** end-to-end: card collection, SCA/3DS, cancellation
   before end, pause/resume, declined/retried payment, webhook redelivery/order,
   expired checkout, portal return, and real invoice line shapes for the pinned
   Stripe API. Confirm portal cancellation is enabled and trial notices comply.
5. Fund OpenAI through an authorized owner action and verify the explicit
   `OPENAI_MODEL_STRONG`, key, one-shot JSON generation, latency and output quality.
   OpenAI credit balance was reported as **zero**; code does not fund the service.
6. Choose one future `CARD_TRIAL_COHORT_START` timestamp. Once first persisted,
   **never move it**. `CARD_TRIAL_PROVIDER_READY=verified` is a separate gate and
   also requires configured `OPENAI_API_KEY` and `OPENAI_MODEL_STRONG`. Set it only
   after funding and a successful authorized provider smoke test, with monitoring.
7. Check public IT/EN copy/metadata, selected plan prices, exact end date, emails,
   accessibility/mobile layout, and all setup/paid transitions before opening
   enrollment. Legacy trial/welcome/digest/recovery campaigns skip the new cohort
   rather than sending incorrect seven-day/no-card promises.

## Kill switch and rollback

- Remove/change `CARD_TRIAL_PROVIDER_READY` to stop new enrollments and costly
  preview generation. This does not erase paid entitlements, extend trials, or
  cancel subscriptions. Existing members retain billing/cancellation access.
- Existing trial subscriptions may still auto-renew at Stripe even if the provider
  goes down. Operational incident handling must identify affected enrollments and
  arrange authorized cancellation/refund/remediation before the promised preview
  is missed. Do not leave a readiness flag on while credits are exhausted.
- Keep both durable rollout/account policy and billing guards deployed. Rolling
  back to the old webhook/entitlement code would re-enable trial sending and is
  **not safe** after any new enrollment. Do not drop tables or remove policy rows
  as a rollback mechanism. Recover forward or keep the new policy fail-closed.
- Lost checkout results older than 23 hours and uncertain preview outcomes require
  operator reconciliation against Stripe/provider evidence; do not reset ledgers
  or create replacement charges blindly.

## Remaining product/operational limits

- A verified positive payment earns the existing promised referral reward even if
  the referred subscription has since canceled. Delivery uses a durable frozen
  reward intent; local credit and completion are atomic, Stripe delivery retries
  use fixed parameters/idempotency and never fall back after an unknown result.
  Pending Stripe rewards older than 23 hours require reconciliation. Already-marked
  legacy rewards are not retroactively guessed or changed. The old legacy helper
  itself is unchanged; its preexisting ambiguous-failure behavior is outside this
  new-cohort repair and should be reviewed separately.
- Fully canceled subscriptions may explicitly reactivate at the selected monthly
  price, charged immediately, without another trial. Observing Stripe cancellation
  atomically revokes stale paid access before creating the replacement checkout;
  original trial/preview/payment history remains intact.
- Whether newly earned referral credits or other fully discounted invoices fund
  NEW-cohort paid service remains undecided. Rollout stays disabled until that
  policy, checkout offers and entitlement rules are consistent. Existing legacy
  rewards and compensated access retain their promised terms.
- Repeat trials are blocked for the same account/customer and trial boundaries
  never reset. Cross-account/card-fingerprint fraud controls are not implemented;
  decide that policy separately rather than silently collecting new identifiers.
- New-cohort automatic lifecycle emails are not introduced. Existing mismatched
  campaigns are skipped. Confirm Stripe's trial/renewal reminder configuration,
  delivery and any required pre-charge reminder timing in test mode.
- No real provider output was generated or evaluated here, and production schema
  compatibility is a separate release gate.

## Verification matrix

| Stage | Result | Scope |
|---|---|---|
| TypeScript `tsc --noEmit --incremental false` | Passed | Whole repository |
| Existing auth/security/OTP/registration/lifecycle tests | Passed | Offline fixtures; legacy terms/selectors preserved |
| New billing behavioral/static groups | Passed (34 groups) | Actual source with mocked Stripe/database; static checks identified |
| Paid reactivation regressions | Passed (10 groups) | Cancellation race, abandoned checkout, no second trial, fixed attempt recovery |
| Referral fault injection | Passed (10 groups) | Frozen intent, atomic local credit, unknown Stripe response and completion retry |
| Preview tests | Passed | Concurrency, definite failure, unknown result, replay, CAS, parameterization |
| Server-page routing tests | Passed | Actual async membership/onboarding branches with isolated mocks |
| Copy/onboarding regression tests | Passed | IT/EN, disabled/future/persisted rollout, cost-path assertions |
| Native PostgreSQL 18.4 | Passed (17 scenarios) | Disposable DB; schemas, actual preview code, extracted checkout/webhook SQL locks/transactions |
| Chromium client fixtures | Passed (21 checks) | Actual client components + project Tailwind, mocked APIs/navigation, 375px layouts, visual screenshots |
| Full Next production build | Passed | Entire current Prisma schema plus additive trial tables on disposable PostgreSQL: 32 empty tables; compilation, TypeScript, 151 static pages, optimization and traces |
| Full Next + Stripe + DB + funded AI end-to-end | **Not run** | Requires authorized test configuration and provider funding |
| Production migration/deployment/charges | **Not run** | Not authorized |

Commands:

- `npm run test:card-trial`
- `npm run test:card-trial:browser`
- `CARD_TRIAL_DB_DEPS=/workspace/shared/card-trial-db npm run test:card-trial:postgres`
- `node node_modules/typescript/bin/tsc --noEmit --incremental false`
- `CARD_TRIAL_DB_DEPS=/workspace/shared/card-trial-db node scripts/test-card-trial-full-build.mjs`

The literal existing `npm test` wrapper was blocked before tests by tsx CLI's
Unix-socket `EPERM`; all six underlying existing test files passed via the
supported `node --import tsx` loader. `npm run lint` succeeds but is a documented
no-op; whole-repository TypeScript is the project's actual CI gate.

The full-build harness generates the current Prisma schema as SQL with
`migrate diff --from-empty`, applies it only to a disposable local database,
and then applies both review-only trial SQLs. It refuses local environment files
and whitelists build environment variables. No production migration occurs.
Build logs are local verification artifacts and are excluded from the patch.

The additive tables are deliberately accessed through parameterized SQL rather
than new generated Prisma models. Integrate their reviewed DDL into the canonical
production migration baseline before release; future schema tooling must not
mistake them for disposable/unmanaged tables and remove them.

PostgreSQL dependencies were isolated outside app `node_modules`; the disposable
server/data are shut down/removed by the test. Browser uses the already-installed
`@sparticuz/chromium` runtime. Initial system Chromium socket failure was tooling,
not an access denial; no OS/security setting was changed. Report/screenshots:
`/tmp/lavorai-card-trial-browser/` (temporary local verification artifacts).

Stripe source references used for implementation review:
- https://docs.stripe.com/payments/checkout/free-trials
- https://docs.stripe.com/billing/subscriptions/webhooks
- https://docs.stripe.com/webhooks
- https://docs.stripe.com/billing/subscriptions/trials/manage-trial-compliance
