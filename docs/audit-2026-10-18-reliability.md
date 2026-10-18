# Reliability & measurement audit — 2026-10-18

Scope: application model/statuses, worker (`src/lib/application-worker*.ts`, `auto-apply-cron.ts`, `application-claim.ts`),
submission evidence, analytics/admin metrics. Code-level audit of `main` at c3bc001. No production database
was read or written for this note; figures quoted from earlier reads are marked as such.

## 1. Status model (observed in code)

- `Application.status` is a free-text string. Values written today: `queued`, `optimizing`, `ready_to_apply`,
  `applying`, `submitting`, `answers_claimed`, `awaiting_consent`, `needs_answers`, `needs_session`, `needs_2fa`,
  `success`, `failed`, `cancelled`, `diagnostic`.
- The real outcome is spread across 4 more places: `submitConfirmation` (`NOT_SUBMITTED`, `SUBMISSION_STARTED`,
  `UNCONFIRMED`, `DETECTED_*`, `EMAIL_SENT`, `CAPTCHA`, `JOB_CLOSED`, `DRY_RUN`, `MANUAL`), `submittedVia`,
  `submissionReceiptJson` (verified ATS receipt, parser in `submission-receipt.ts`), and `ApplicationEmailAttempt`
  (+ `EmailProviderEvent`) for the email channel.
- `ready_to_apply` alone means six different things: prepared and about to be sent; captcha hand-off; submit clicked
  without receipt (`UNCONFIRMED`); held by the global daily cap; unsupported portal (manual); ATS destination not
  correlatable. `failed` can also carry `SUBMISSION_STARTED`, i.e. *possibly sent*.
- `form_not_found` on an ATS-sourced job ends as `failed` + `NOT_SUBMITTED` but the stored message says
  "Esito da verificare prima di un altro tentativo", which reads as "maybe sent". It was not sent.
- Strong points already in place: per-user advisory lock + row locks before any delivery boundary
  (`withLockedApplication`), `SUBMISSION_STARTED` fence persisted before external calls, no replay of ambiguous rows
  (`recoverStuckApplications` turns them into `UNCONFIRMED`), global UTC-day reservation ledger with an opaque
  per-user+job idempotency key (`submissionSubjectKey`), creation dedup on `userId+jobId`, verified-receipt parser
  that rejects forged/other-provider receipts, email delivery events that never downgrade.

## 2. Gaps found

| # | Gap | Impact | Addressed |
|---|---|---|---|
| G1 | No single explicit status; UI and admin each re-derive from raw columns | Inconsistent labels; "possibly sent" sometimes shown as failed | PR: `application-lifecycle.ts` + `GET /api/applications/lifecycle` |
| G2 | Cross-row duplicate check only for Greenhouse/Recruitee; Ashby/Lever/Workable/email can be sent twice when the same posting exists as two `Job` rows (board listing promoted to ATS URL, URL variants) | Double applications to an employer | PR: `postingAlreadyClaimed()` in `beginApplicationSubmission`, all channels |
| G3 | Retry policy implicit (self-heal keyword match, now fully disabled by `historicalRetriesBlocked()`) | No documented rule for when a retry is safe | PR: pure `automaticRetryDecision()`; retries stay OFF |
| G4 | `/admin/delivery` counts `DETECTED_*` without a verified receipt and `EMAIL_SENT` (provider accepted, not delivered) as "proven" | Delivery rate overstated vs strict evidence | Metrics PR: strict rate on `/admin/reliability`; old page unchanged (flag) |
| G5 | `/admin/delivery` and `/api/public/stats` include internal accounts; the stats regex misses `umbertogeraci0+…@gmail.com` aliases | Owner's ~2.9k test rows (Oct 17 read) dominate delivery charts; public user count inflated | Metrics PR: `isTestAccount()` everywhere touched |
| G6 | No AI token/cost logging anywhere | Cost per completed application unknown | Metrics PR: `AiUsageEvent` (additive table, tokens only) |
| G7 | No activation / time-to-first-useful-application / D7-D30 / cancellation view | Can't measure the funnel that matters | Metrics PR: `/admin/reliability` + JSON endpoint |
| G8 | PostHog is **not on `main`** (`feat/posthog-analytics` never merged); `trackEvent` only posts first-party `ConversionEvent`s | No product analytics events server-side | Not addressed (decision for the owner) |
| G9 | Ashby filler returns `form_not_found` since Oct 13 (selector waits for name input after clicking "Apply") | All Ashby jobs fail; they now read `failed / ats_form_unsupported` | Not addressed: needs a live, non-submitting browser repro |
| G10 | Resume-after-answers only for Recruitee/Greenhouse | Ashby/Lever/Workable questions dead-end in `needs_answers` | Not addressed |
| G11 | Held `queued` rows depend on `held-application-release.ts` patterns; `awaiting_consent` (auto mode, no route) re-enters the same no-route path after consent | Rows can loop between approve and no-route | Lifecycle shows them; behaviour unchanged |
| G12 | `scripts/test-application-worker-postgres.ts` fails on `main` (its 21 fixture apps share one Greenhouse URL, which `destinationIsUnique` already blocks); it is not in CI | Stale integration test | Not changed; noted |

## 3. Evidence available per channel

- ATS portal: `submissionReceiptJson` v1 (`kind: http` with 2xx + `application_id/accepted/receipt_message`, or `kind: dom` with
  `new_receipt_and_form_removed`), provider-scoped endpoint host check. Screenshot URLs only exist in `canaryLog` when
  `CANARY_DEBUG=1` (they show a filled form: internal-only).
- Email: `ApplicationEmailAttempt.status` (`accepted` → `delivered`/`bounced`/`complained`), `providerEmailId`, `lastEventAt`.
- Replies/interviews: `ApplicationReply` (inbound reply address, `isHuman`, `kind`) and `GmailMessage` (linked Gmail,
  `isHuman`, `kind`). Classification is automatic; metrics count only these rows.

## 4. Analytics (observed)

- First-party: `ConversionEvent` (signup, checkout, purchase, application_created, first_application_delivered…),
  `PageView` (with `userId` when signed in), `SubscriptionEvent` (cancel/pause/resume with reason).
- `loadAdminGrowthMetrics` already excludes test users via `isTestAccount`; other admin pages (`/admin`, `/admin/jobs`,
  `/admin/automation`, `/admin/users` counts) still count every account.
- Meta Pixel `CompleteRegistration` with consent (PR #50) is client-side and out of scope here.
