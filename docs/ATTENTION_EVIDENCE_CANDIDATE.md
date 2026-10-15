# Attention and evidence candidate

Local, unpublished implementation of the six approved improvements. Isolated clone:
`/Users/umbertogeraci/Documents/Codex/2026-10-15/task-10/lavorai-improvements`, branch `codex/attention-evidence`.

Base: `9b308d57a373e8662a52237ebdb48f54bd7efd38`. The release task reported that exact SHA live, with the two prior migrations applied and existing records preserved. This task did not deploy, change production data/configuration, sign into a customer account, access credentials, send email, grant OAuth scopes, upload analytics, push Git, or upload review artifacts.

## Implemented scope

1. **One next action and shared attention queue.** The dashboard prioritizes recruiter correspondence needing review, then blocked/prepared applications, then incomplete email/CV/preferences setup. It links to the existing Questions, Applications and Inbox flows. The existing opportunity map remains available in a collapsible section; one selected opportunity and the existing interview/readiness features remain secondary. Checklist moves ahead of interview activity. Read failures produce a retry state, not an empty queue.
2. **Evidence timeline in application details.** Four separate steps show materials available, recorded submission, verified receipt/delivery and recruiter-classified response. ATS timestamps come from validated receipts, email acceptance from the provider-attempt row, delivery dates from the provider event journal, and response dates from human-classified source rows. The UI explicitly says a material's preparation time or delivery timestamp is unknown when it is missing. Manual states, open pixels, unknown submissions, demos and diagnostic records do not establish delivery. A later failed/bounced state cannot be masked by a historical delivery timestamp. No events or successes are backfilled.
3. **Explainable matching and reversible exclusions.** Discover explains exact CV skill mentions, quotes up to three explicit requirement passages, and identifies a conservative list of technical requirements lacking CV text evidence. It never claims the person lacks a skill and does not use protected attributes. Existing scores and preference values are retained. “Not relevant” explicitly excludes only that listing from Dashboard/Discover; no role/company/profile inference occurs. Recent exclusions can be restored in Discover. The existing manually searched Job board remains available. Old browser-wide skip IDs are not imported as account preferences.
4. **Communication loop.** Existing durable drafts remain the composer source. Dashboard shows recent unread and saved-draft counts. Inbox persists local read state, explicit handled/reopen choices and a 24-hour in-app reminder. Reading does not mean answering. Only a recorded accepted/delivered/delayed user reply can clear an application-message action; ambiguous/failed sends cannot. Gmail remains read-only, with external replies unknown until the user marks the item handled. No scheduler, automatic sender, email reminder or permission expansion was added.
5. **Checklist separate from payment access.** Email verification, uploaded CV and explicit role preferences are separate profile items. Card verification uses a new minimal server-only observation of an actually expanded, owned card with completed setup; no subscription/tier shortcut creates card evidence. Missing card history is unknown. Current plan access is shown separately and uses the existing billing rules. First-application success is no longer inferred from creating an application row.
6. **Admin activation evidence.** Admin Product shows successive intersections of the signup cohort (email, CV, preferences, confirmed application, classified response), with counts lacking evidence at each step. The page explains these are current cohort snapshots, not reconstructed abandonment history. It also shows independently counted users with confirmed applications/responses, unknown legacy outcomes, card observations, and observed Google launch/callback errors. Test users are excluded from the cohort. Google counts are explicitly incomplete browser observations, including possible anonymous/test attempts, with no invented failure rate. The public analytics collector cannot forge the server-only card/subscription/purchase/first-delivery events. Existing admin delivery totals now use the canonical evidence validator instead of raw success strings.

## Access and data minimization

New mutations require an authenticated owner loaded from the server, exact same origin, JSON payloads bounded to 1 KiB, strict schemas, current billing/access gates and a suspension check. IDs never supply ownership. Foreign message/evidence IDs return 404; user-supplied owner fields are rejected. Dismissals are idempotent per user/listing and cascade with deletion. Admin aggregation checks authorization before reading data. The evidence endpoint returns only step/state/source/timestamp, not message bodies, email addresses, file paths or provider identifiers.

Inbox/attention reuse the existing security-message filtering and repository. Attention renders metadata only, never mail bodies. Existing message classifiers remain estimates. No new third-party analytics pipeline exists; Google observations go directly to the existing first-party endpoint without raw errors, identities or OAuth URLs.

## Pagination regression coordination

A separate task (`01a1418f-6c08-7571-ad80-b4d335b75026`) owns the newly reported live pagination issue. This candidate deliberately leaves these files byte-identical to the base:

- `src/lib/application-list.ts`
- `src/app/(app)/applications/page.tsx`
- `scripts/test-application-pagination.ts`

Evidence is fetched through `GET /api/applications/[id]/evidence` only when `DetailDrawer` opens. No event/reply relation reads were added to list scans. Other potential integration overlaps: `src/components/design/detail-drawer.tsx`, the shared delivery presentation helpers, and `scripts/test-user-workspace-browser.mjs`. Review/cherry-pick those intentionally after the regression fix; do not overwrite that task's work. This candidate does not claim to fix the live pagination regression.

## External proposal boundaries

The coordinating task reported PR 33 (`85105bf25728ba3f38da79845be0013fb16a2077`) as a PostHog proposal targeting `feat/free-plan-5-apps`, and PR 32 (`45652bcd3bc2950d9282157d6d0d0b721afaf398`) as a conflicting billing-policy proposal. Neither was fetched, merged or adopted. This clone adds no package or lockfile dependency and no analytics vendor. Pricing, trial and entitlement behavior remain from the approved base.

Potential ownership overlap to review later: this candidate adds first-party event names/collector restrictions and a server-only card observation inside the existing Stripe webhook. It does not change subscription synchronization or grant rules. Any future merge of those external proposals needs a separate policy and analytics review; their reported CI/conflict problems were not independently investigated here.

## Migration and release requirements

New additive SQL: `prisma/migrations/20261016090000_attention_and_job_dismissals/migration.sql`.

- `ApplicationReply`: nullable read/handled/reminder timestamps plus `attentionTrackedAt`.
- `GmailMessage`: nullable handled/reminder timestamps; the existing local read flag is reused.
- `JobDismissal`: composite user/job primary key and cascading ownership relations.

Historical application replies retain null `attentionTrackedAt`: the migration adds the nullable column before setting its default for future rows. No historical read status is manufactured. The exact SQL passed against a populated temporary localhost schema derived from the published base, with zero Prisma schema diff. The complete three-migration chain also passed on a separate temporary localhost database. No production baseline, migration-history repair, reset, push or deployment command was executed.

The new migration must be reviewed and applied before deploying this candidate. Reconcile with the pagination fix and its verified release SHA first. The known stale production `DIRECT_URL` was not read or used here. No live Stripe, Gmail, Resend or OAuth test was performed.

## Deliberate limits

- Attention is a bounded recent selection (up to 50 blocked applications, 200 messages per source plus saved-draft parents, 200 recent outgoing replies). The UI labels that scope; older correspondence may require opening Inbox/Applications. A truncated reply window is not proof a person never answered.
- Reminders reappear only in LavorAI after the stored time, when the user opens/refreshes the dashboard. They are message reminders, not a general calendar or email scheduler.
- The dismissal manager exposes up to 50 recent exclusions at a time; restoring entries makes older exclusions eligible for the next refresh. This first pass does not learn broader role preferences automatically.
- Matching is deterministic text comparison, not a full qualification audit, AI inference, eligibility assessment or hiring probability. Missing/unparseable profile and requirement data stays unknown. The fixed technical vocabulary is intentionally limited.
- Material preparation timestamps do not exist in historical records. They are shown as unknown; no creation/completion timestamp is substituted.
- Google observations cannot measure callbacks where the browser never returns. No complete historical login-failure denominator exists. Card observations start with this implementation; they do not inventory current cards or prove a payment occurred.
- Cohort metrics are current stored state, not event-by-event historical conversion or causal dropoff. A response is classifier evidence, not certainty about sender intent. No new customer-facing promise of successful delivery is introduced.
- Verification uses synthetic identities/data and mocked providers. It does not prove live OAuth/provider availability or production-data-specific rendering.

## Review artifacts and checks

New local review page: `output/review/attention.html`. New synthetic screenshots: `output/playwright/attention/`. No previously denied Applications images were retried, reused or repackaged.

Verification logs are under `output/verification/`:

- `npm-test.log`: full existing regression chain plus the new attention/evidence tests.
- `attention-unit.log`: evidence ambiguity/timestamps, incomplete setup/payment separation, missing profile/requirements, unread/handled/reminder semantics, suspension/auth/CSRF/ownership/outage boundaries, public event spoof prevention and admin denial.
- `attention-postgres.log`: exact additive migration, old null/new unread defaults, preserved records/schema parity, real ownership/queue behavior, reminder expiry, admin evidence, concurrent dismissals, restore isolation/deletion cascade and private detail-only evidence route.
- `integrated-postgres.log`: complete migration chain plus existing Inbox recipient/threading, concurrency/idempotency, unknown retry, quota/pause, racing/out-of-order events and security-code regressions with mocked provider.
- `attention-browser.log` and `output/playwright/attention/attention-qa.json`: real view components at 1366×768, 1440×900, 390×844, 320×740, IT/EN, queue bounds, checklist, error recovery, local handled/reminder state, dismissal failure/restore, evidence drawer, admin unknowns; zero external browser requests.
- `inbox-browser.log`: existing 56-message pagination/draft/quota/send-identity/Gmail fallback and mobile regression suite.
- `typecheck.log`: TypeScript.
- `build.log`: credential-free production build with telemetry disabled. Expected missing-DATABASE_URL static fallback warnings are not evidence of any live DB connection.

Central billing/trial/prices, Google identity rules, Gmail grants, application workers/producers, manual-only rollout/global cap/cutoff and saved user preference values are unchanged.
