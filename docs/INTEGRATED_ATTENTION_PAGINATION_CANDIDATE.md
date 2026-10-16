# Integrated attention and pagination candidate

Local integration branch: `codex/integrated-attention-pagination` in
`/Users/umbertogeraci/Documents/Codex/2026-10-15/task-10/lavorai-improvements`.

## Source and scope

- Attention/evidence candidate: `2706e0a7f1bdce2c8ab40a54daec9657c85b1e3e`.
- Pagination candidate: `940c70dffd73ab24ff27d89bd269c10d57007c71`.
- Shared verified base: `9b308d57a373e8662a52237ebdb48f54bd7efd38`.
- Clean local merge commit: `08a197e107274b43fe943de3057b26144d78530d`.

Both original branches remain at their original SHAs. The pagination checkout was
read only. The only overlapping files, `package.json` and
`scripts/test-user-workspace-browser.mjs`, merged without conflict. The integration
adds verification cases and this report; it does not add further product scope.
The six-feature and pagination details/limits remain in
`ATTENTION_EVIDENCE_CANDIDATE.md` and `PAGINATION_REGRESSION_CANDIDATE.md`.

The index fingerprint includes every input affected by the attention candidate’s
delivery-rule refinements: status, submission channel, confirmation, receipt and
latest email status/provider ID. New combined PostgreSQL parity cases exercise
provider ID removal/restoration, dry runs, unknown submissions, non-success ATS
records and demo channels against a warm index. Evidence timeline reads remain
on the authenticated detail-only endpoint, outside list/pagination scans.

No indexing-task changes or PR 32/33/34/35 changes were imported. Billing, prices,
trials, identity/OAuth grants, manual-only/global-cap/cutoff safeguards, application
producers and stored preference values retain the approved behavior. Google
observations use existing first-party storage; no analytics vendor was added.

## Combined validation

All runs use this checkout, synthetic fixtures and mocked external providers.
Regressions, PostgreSQL, browsers, TypeScript and the production build run
sequentially. Disk inspection before integration found 14 GiB free at 94% capacity;
no existing files were deleted. The indexing task’s recent activity is checked
read only before the build to avoid overlapping heavy builds.

- Full `npm test`: passed, exit 0.
- Exact attention migration over populated `9b308d57` schema: passed, exit 0;
  historical read state remains null, existing records preserved, zero Prisma drift.
- Complete three-migration chain and Inbox PostgreSQL suite: passed, exit 0;
  ownership, CSRF, concurrent sends, unknown outcomes, quota/pause, event ordering
  and security-code exclusions use mocked providers.
- Pagination PostgreSQL suite: passed, exit 0; owner isolation, all lane pages,
  filters/ranges, evidence parity/invalidation, concurrency and 723/3,258-row fixtures.
  Performance measurements are synthetic/local, not production latency claims.
- Attention browser: passed, exit 0; 32 layout cases (IT/EN at 1366×768, 1440×900,
  390×844 and 320×740), dense/empty/error states, read/handled/reminders,
  dismissal/restore, pending-consent wording and evidence details.
- Pagination browser: passed, exit 0; Strict Mode, rapid pointer/keyboard actions,
  cached pages, cancelled stale requests, per-column state, deep links, 503/retry,
  empty/deleted pages, CSV, keyboard focus and desktop/mobile bounds.
- Inbox browser: passed, exit 0; pagination/drafts/quotas/send identity/Gmail
  external-reply fallback. Browser fixtures made no external requests.
- Explicit TypeScript: passed, exit 0.
- Credential-free production build: passed, exit 0, 2026-10-16 09:19:11–09:19:33 UTC. The process check found no other npm/Next build before launch; the indexing task’s last observed work was its URL audit. No other validation from this task ran concurrently. This fresh combined build supersedes the unrecovered exit-code gap in the earlier attention-only notes.

All checks completed without a remaining local validation blocker. Production/provider behavior is still outside these synthetic checks.

Machine-readable exit statuses and logs: `output/verification/integrated-20261016/`.
Screens: `output/playwright/integrated-attention-20261016/` and
`output/playwright/integrated-pagination-20261016/`. These are new local synthetic
artifacts; nothing was uploaded. They do not prove live OAuth/email availability.

## Additive migration review

Only one new production migration is needed above the verified base:
`20261016090000_attention_and_job_dismissals`.

1. Adds nullable `attentionTrackedAt`, `readAt`, `handledAt`, `remindAt` to
   `ApplicationReply`, setting the tracking default only after adding the nullable
   column. Existing rows stay unknown; future rows can be unread in LavorAI.
2. Adds nullable `handledAt`/`remindAt` to `GmailMessage`; reuses its existing local
   read flag. No Gmail permissions or external state writes are introduced.
3. Creates `JobDismissal` with `(userId, jobId)` primary key, creation timestamp
   and cascading owner/job references. Uniqueness and owner-scoped restore/cascade
   behavior passed real PostgreSQL tests.

The SQL contains no drop, delete, historical update, billing change or success
backfill. It still needs normal migration lock handling: nullable/additive does
not mean lock-free. Do not deploy code that reads the new fields before the
migration succeeds. Application rollback can retain the new columns/table and
user actions; no destructive down-migration is required for a code rollback.

## Publication checklist — not executed

1. Review the final integration SHA and this diff. Recheck remote `main` and the
   intended release baseline. If another candidate has landed, reconcile it and
   rerun affected checks. Keep the indexing fix and unrelated landing/billing/
   analytics proposals outside this release unless separately approved.
2. Obtain publication authorization for this exact candidate and its one additive
   migration. Confirm the deployment/rollback owner and previous live SHA.
3. Resolve the approved Frankfurt target through the normal release environment
   (`curly-silence-16024948`, `br-aged-band-al1r48g9`, `neondb`); verify the actual
   connection target without exposing credentials. Do not use the known stale US
   `DIRECT_URL`. Inspect migration history and schema first: the two earlier
   consistency migrations were reported applied and must not be replayed blindly.
4. Confirm the existing recovery/backup point. Apply the new additive migration
   once, with the release process’s lock/statement timeout and failure handling.
   On any failure, inspect the actual state before retrying; do not reset or
   improvise a production schema repair. Verify old read history remains null and
   the new table/constraints/defaults match Prisma.
5. Deploy the reviewed candidate only after schema verification. Preserve all
   pricing/trial/card policies, manual-only controls, global cap/cutoff, OAuth
   grants and provider configuration. This task did not push or deploy anything.
6. Check application health and the approved test identity’s dashboard, pagination,
   evidence drawer, Inbox local attention controls and dismissal restoration;
   verify owner/admin boundaries. Confirm empty/unknown/error states stay honest.
   Do not send emails or create real applications as an implicit smoke test.
   A live provider/send canary requires its own existing authorization.
7. Check errors and pagination behavior, and record the actual deployed SHA and
   migration result. If rolling application code back, retain additive schema and
   user-created read/reminder/dismissal data. Report live provider limitations
   separately from these synthetic checks.

No publication, production database action, external message, analytics upload,
customer sign-in, new spending or credential/OAuth change was performed here.
