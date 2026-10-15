# Card-required Free plan rollout

Free saves a card through Stripe Checkout in `setup` mode. It creates no
subscription, invoice, charge, trial, or automatic upgrade. Pro and Pro+ use
subscription Checkout without trial parameters. Existing Stripe trials and stored
trial deadlines remain unchanged.

## Environment and Stripe configuration

Set these on the web application in the correct Stripe environment (sandbox/test
and live have different IDs and webhook secrets):

- `STRIPE_SECRET_KEY`: existing server-side Stripe credential. Prefer a restricted
  key with the Customer, Checkout, SetupIntent, subscription and billing portal
  permissions used by the existing integration.
- `STRIPE_WEBHOOK_SECRET`: signing secret for `/api/stripe/webhook`.
- `STRIPE_PRICE_ID_PRO`: a **new EUR 19.99 recurring monthly Price** for Pro. Stripe
  Price amounts are immutable: create a new Price rather than editing the old one.
  Existing subscriptions keep their existing Price and trials; this patch does not
  migrate or cancel them.
- `STRIPE_LEGACY_PRICE_IDS_PRO`: comma-separated former Pro Price IDs, when any
  existing subscriptions/trials still use them. Existing linked subscriptions
  also retain their known tier when the stored subscription and Price both match.
- `STRIPE_PRICE_ID_PRO_PLUS`: existing Pro+ EUR 39.99/month Price, unchanged.
- `STRIPE_CARD_PAYMENT_METHOD_CONFIGURATION`: **required**, a `pmc_...` Dashboard
  payment-method configuration with Cards enabled and non-card methods disabled.
  Checkout fails closed if this is absent. Card-backed wallets remain available
  according to Stripe/device eligibility. No Free Stripe Price is needed.
- `NEXT_PUBLIC_SITE_URL`: the application's public origin for Checkout redirects.
- `DATABASE_URL` and `DIRECT_URL`: existing PostgreSQL runtime/direct connections.

In Stripe Dashboard, subscribe the endpoint to `checkout.session.completed`,
`checkout.session.async_payment_succeeded`, `customer.subscription.created`,
`customer.subscription.updated`, `customer.subscription.deleted`,
`invoice.payment_failed`, and `invoice.payment_succeeded` (retain existing event
subscriptions). Setup checkout completion is verified by retrieving the completed
session and its succeeded SetupIntent, checking card type and customer ownership.
The return URL never grants access. The saved card is attached to the same
Customer and set as its invoice default. An explicit paid upgrade reuses that
Customer in Checkout; Free usage never triggers a charge.

Review the additive SQL in
`prisma/migrations/20261015170000_card_required_free_plan/migration.sql` before
release. Apply it to the production database using the repository's established
migration procedure **before** deploying the application or worker. This repository
has no historical migration baseline; follow `prisma/migrations/README.md`, do not
reset production or blindly initialize migration history. The migration preserves
trial/subscription fields (freezing any still-active implicit legacy deadlines), adds verified-card state, previews and durable usage,
and backfills usage from real historical successful submissions (not queued,
failed, manual imports or mock sends). Deploy the web application and worker from
the same commit. No production migration or Stripe Dashboard change was performed
as part of this task.

## Quota and preview behavior

Free has 5 lifetime submissions. Failed preparation, preview generation and proved
no-send outcomes do not consume usage. Concurrent ATS/email sends reserve capacity
under the existing per-user PostgreSQL lock; uncertain sends keep a temporary slot
to prevent a sixth send while their outcome is unknown. Usage increments once in
the same transaction that records a confirmed submission. Deleting application
history or resetting monthly credits does not refund lifetime usage.

Free single and batch requests require a server-owned, user/job-bound preview
approved by the user. The worker sends the reviewed CV/cover-letter content rather
than making a second AI rewrite. A batch reviews each position separately before
submission. Free automatic discovery does not send unreviewed positions. Existing
operational rollout/pause restrictions continue to apply to all plans.

The dashboard shows remaining lifetime applications. At zero, sending returns a
402 upgrade wall; the user can choose Pro at EUR 19.99/month. The rest of the
application remains accessible.

## Validation

- `npm run typecheck`
- `npm test` (includes `test:free-plan` and expanded Stripe/card fixtures)
- `FREE_PLAN_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:5432/lavorai_free_plan_test npm run test:free-plan-postgres`

The PostgreSQL test requires a dedicated localhost database initialized from the
current schema. It uses synthetic rows and tests concurrent mixed-channel sends,
failed sends, duplicate completion, exhaustion, deletion/reset resistance and
existing trial access. Stripe tests use signed offline fixtures; live Stripe
Checkout still needs a sandbox end-to-end check with the configured keys, Price
and card-only payment configuration before release.
