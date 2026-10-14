# Factual answers and safe application continuation

Reviewed locally on 2026-10-14. Base: `47f37a91421b19a5713b4ce793053d98eee757cf` (fetched after the initial `2471ee4` base). Branch: `fix/factual-answers-safe-continuation`. This candidate has not been pushed or deployed. No production database, credentials or settings were changed, and no real applications were submitted.

## Result

- `candidate-facts.ts` is the shared deterministic mapper for suggestions and ATS questions. It retains the source and reference for CV, profile, explicit preferences and verified historical user facts. Historical answers need `source=user`, an answer, a valid `answeredAt`, and valid stored choices where applicable. Generated/assumed answers remain application audit data only.
- City/residence, current versus previous employment, phone prefixes and asynchronous option loading use the same fact resolution. Desired job location is not residence. Empty employment end dates are not proof of current employment. Ongoing studies do not establish a completed degree. Conflicting sources or conflicting exact scoped answers require candidate input.
- No WhatsApp consent, public-official/family declaration, prior affiliation or country-specific work eligibility is inferred. Coarse `workAuthEU` cannot establish a country's work authorization or sponsorship answer. Such declarations require the candidate's exact application/question/ordered-options fingerprint.
- Saving answers is authenticated, owned, scoped and compare-and-set protected, and never queues work. A separate candidate confirmation binds the current server proof, scoped answers and factual sources. Unsaved local changes disable confirmation; changes in another tab invalidate it.
- Only a **new consented Recruitee attempt** paused by the audited worker wrapper before its sole candidate POST can obtain a continuation proof. Browser adapters can upload/autosave before discovering unanswered questions, so their `NOT_SUBMITTED` marker alone never permits continuation.
- Queue, claim, worker preparation, pre-transmission and final-send gates all validate the proof. The work token rotates to fence stale workers and audit callbacks; the immutable reservation retains its original attempt token, channel, subject, cutoff and destination. A continuation can authorize the final send boundary once. Uncertain outcomes cannot resume.
- Duplicate checks include the internal user/job scope, existing email attempts, other application records targeting the same Recruitee host/posting, and retained reservations on duplicate imported Job records. All current account, billing, consent, session and job gates remain enforced.
- UI and notification email distinguish saving, confirming, queuing and actual delivery. Automatic producers and historical retry/reset routes remain blocked.

## Migration

File: `prisma/migrations/20261014210000_answer_continuation/migration.sql`

```sql
ALTER TABLE "Application" ADD COLUMN "answerContinuationJson" TEXT;
```

The field is nullable. There is no data backfill, reservation rewrite/refund/delete, cutoff reset or configuration change. The exact migration was applied to a populated disposable PostgreSQL baseline: existing application/user data was preserved and the existing application received only a null new column.

Before an approved release, apply the additive migration and generate the Prisma client for both web and worker artifacts. Deploy web and worker from the same reviewed candidate. Existing binaries tolerate the nullable column; the new binaries require it. Keep `manual_only`, the existing cutoff `2026-10-14T11:47:00.000Z`, and global daily cap `10`. The parallel Google Jobs task's nullable `Job.sourceEvidenceJson` addition is independent and can be integrated without changing this migration.

## Verification

All fixtures are synthetic; AI/provider boundaries were isolated. PostgreSQL suites create their own temporary localhost database and overwrite ambient connection URLs. Browser tests block external requests and use a temporary Chrome profile on the Mac.

| Check | Evidence |
| --- | --- |
| `npm run test:answers` | Shared provenance/conflicts, current/previous employer and residence, exact scoped declarations, ownership/auth, stale save races, async choices and phone prefix ambiguity |
| `npm run test:worker-gates` | Current eligibility, delivery evidence, reservation integration, no uncertain replay |
| `npm run test:manual-rollout` | Cutoff/consent/configuration, automatic producer and retry blocks, cap visibility |
| `npm run test:send-reply` | ATS receipt and missing-answer boundary, delivery/reply persistence, send/question flow and reporting regressions |
| `scripts/test-answer-continuation-postgres.ts` | Real route → queue → claim → worker wrapper/gates with Prisma/row and advisory locks; concurrent confirmations and claims; stale token/audit fencing; one final authorization; missing/changed proof; ownership, consent, historical/retry/uncertain/submitted/receipt/canary/email evidence; canonical duplicates; incomplete answers; queue-notification outage; exact cap and UTC rollover |
| `scripts/test-manual-submission-budget-postgres.ts` | Eighteen users/channels competing for ten global slots, persistence/rollback failures, no refund on failure/deletion, wrong token/channel/cutoff, and a transaction waiting across midnight |
| `npm run test:answers-browser` | Actual scanner/filler in Chrome: delayed city result, unrelated stale options, phone-country metadata, phone prefix different from residence, shared +1 ambiguity; zero external requests |
| `node scripts/test-scoped-question-ui.mjs` | Real QuestionsView desktop/mobile, independent employer declarations, save versus confirm requests, unsaved edits block confirmation, stale-save feedback, no overflow or browser errors |
| `node node_modules/typescript/bin/tsc --noEmit --incremental false` and `git diff --check` | Type and whitespace checks |

To run the PostgreSQL suites on this Mac without changing repository dependencies:

```sh
WORKER_TEST_EMBEDDED_POSTGRES=/tmp/lavorai-test-runtime/node_modules/embedded-postgres/dist/index.js node --import tsx scripts/test-answer-continuation-postgres.ts
WORKER_TEST_EMBEDDED_POSTGRES=/tmp/lavorai-test-runtime/node_modules/embedded-postgres/dist/index.js node --import tsx scripts/test-manual-submission-budget-postgres.ts
```

The embedded runtime is a temporary local test dependency; `package-lock.json` and production dependencies are unchanged. The test scripts can also use an independently installed `embedded-postgres` runtime through the same variable. Desktop/mobile screenshots remain local under `output/playwright/question-continuation/` and are not part of the commit.

## Records intentionally still held

According to the supplied production audit at 19:55 UTC (not refreshed or modified by this task), there were no queued or fresh consented untouched applications. The 1,290 historical `ready_to_apply` records without recorded consent stay excluded. The existing Doctolib and Stripe `needs_answers` records lack the new server proof and remain held even after saving facts. PostHog's uncertain failed outcome must not be retried. The three existing reservations remain consumed. No legacy row can be promoted into the new safe cohort by assigning `NOT_SUBMITTED` or answering questions.

New browser-ATS attempts also remain held after questions until their pre-transmission behavior has a separately defensible proof model. No live end-to-end submission was performed or is required to review this candidate. Publication and the unapplied additive migration remain the release steps. Release coordination also reported a pre-existing Vercel database-endpoint mismatch under read-only investigation; this task has not inspected or changed that configuration. Resolve the intended deployment/database target before releasing.
