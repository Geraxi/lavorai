# Feedback and bug reports — local candidate

Based on `aaf09bb9b5e0dfa36c1e0cdebd499869debac125`. Local branch:
`codex/feedback-reports`. Nothing has been pushed, deployed or migrated in production.

## Product behavior

- `/feedback` is linked from the existing profile navigation (also reachable via
  the mobile “More” menu). Users choose feedback or bug, enter a subject and
  description, and optionally select a named section. Italian and English copy.
- The private history is paginated in batches of 20 and shows each report's
  current status. Expand a report to read its original text.
- `/admin/reports` is linked in admin navigation. Admins can filter by category
  and status, inspect the reporter, text, selected section and language, and set
  New / In review / Resolved / Closed. These statuses are visible to the owner.
- The desktop form and list fit the viewport. The form body, report history and
  admin details scroll internally when needed; mobile stacks the panels.
- Reports explicitly warn against submitting passwords, payment information,
  CVs and other sensitive information. No attachments, emails, notifications to
  external services, automatic page/referrer URLs, diagnostics or session data.
  Free text remains user-provided and is rendered as plain React text.

Existing `AdminPopup` / `PopupResponse` supports one answer per admin survey; it
cannot represent repeated user-initiated reports or independent triage. The new
model deliberately leaves that existing campaign/survey behavior alone.

## API and safeguards

`GET /api/feedback` returns only the authenticated database user's own reports.
`POST /api/feedback` accepts exactly `category`, `subject`, `description`,
`pageContext` and `locale`; identity and initial status are server-owned.
`GET /api/admin/reports`, `GET /api/admin/reports/:id` and
`PATCH /api/admin/reports/:id` require the existing admin allowlist. PATCH accepts
only `status`. Normal users cannot discover or update another user's report.

The new feature calls existing Auth.js directly (no development demo-user
fallback), re-reads the database identity and suspension, and uses the existing
card/trial entitlement functions. Page routes remain under the unchanged app
layout gates. No authentication, onboarding, billing, worker or proxy code was
modified.

Mutations require Origin/Referer validation, including in development. JSON
input is bounded to 24,000 bytes while streaming, before parsing. Subject is
trimmed and limited to 3–120 UTF-16 units; description to 10–4,000. Control
characters are rejected, with line breaks allowed only in the description.
Category, section, status and locale use fixed allowlists. Unknown keys fail
validation. Section context is empty by default; no pathname is inferred.

A PostgreSQL transaction takes a per-user transaction advisory lock before
checking persisted report timestamps and inserting. It accepts at most 5 reports
in a rolling hour and 20 in a rolling 24 hours, across instances and restarts.
Rejected attempts do not add rows. A 429 carries `Retry-After`. Database failures
return 503 rather than bypassing limits. The transaction uses Read Committed so
a waiter sees the previous submission after acquiring the lock. Reference:
[PostgreSQL transaction advisory locks](https://www.postgresql.org/docs/16/functions-admin.html#FUNCTIONS-ADVISORY-LOCKS).

Responses use `Cache-Control: private, no-store`. Errors do not echo report
content, database messages or account information. SQL parameters are bound by
Prisma. The client keeps the unsent draft after failure. No new request logging
or persistent browser storage was added.

## Migration — prepared, NOT applied remotely

`prisma/migrations/20261015120000_feedback_reports/migration.sql` creates:

- `FeedbackReport`: cuid ID; user foreign key; bounded category, subject,
  description, selected section, locale and status; created/updated timestamps.
- Indexes on `(userId, createdAt)`, `(status, createdAt)` and `(createdAt, id)`.
- A foreign key to `User(id)` with `ON DELETE CASCADE`, so account deletion also
  removes associated reports.
- CHECK constraints for categories, statuses, locale, section and minimum text
  lengths. Prisma does not represent these checks in its schema; preserve the
  checked-in migration rather than substituting `db push`.

No existing column is changed and no reports are backfilled. The local migration
suite creates the pre-change schema, inserts synthetic users, applies the exact
SQL, and verifies that all prior user fields remain identical.

Before a separately authorized release:

1. Verify the intended runtime target: Neon project `curly-silence-16024948`,
   branch `br-aged-band-al1r48g9`, database `neondb`, Frankfurt. The previously
   known `DIRECT_URL` points to an older US project; do not use it blindly.
2. Obtain and verify a direct connection to that same intended branch. Do not
   change production config as part of this local candidate.
3. Inspect migration history first. This repository has incremental migrations
   without a full committed baseline (see `prisma/migrations/README.md`). Do not
   blindly run all pending migrations or reset a populated database. Test this
   additive migration on an approved isolated schema-compatible environment.
4. Apply only the reviewed new migration with the correct migration bookkeeping,
   regenerate Prisma, then release the code and verify authenticated user/admin
   flows. Production migration and release need separate authorization.

The feedback API returns a generic availability error if its table is missing.
This is not a substitute for applying the schema before the feature release.

## Reproducible local verification

- `npx tsc --noEmit`
- `npm test` — repository security, auth, billing/onboarding, worker, delivery,
  manual-rollout and workspace regressions; no new external calls.
- `npm run test:feedback-postgres` — ephemeral PostgreSQL using Homebrew 16 by
  default. Set `FEEDBACK_TEST_PG_BIN` to another PostgreSQL bin directory if
  needed. Creates its own localhost database and overrides both connection URLs.
  No production credentials or `.env` files are needed. Covers migration,
  actual route handlers with real SQL, user/admin authorization, suspension and
  billing gates, CSRF, validation, large/chunked body bounds, ownership, concurrent
  quotas, durable limits, expiry, pagination, database checks and deletion cascade.
  Only the authenticated session identity is mocked at the route boundary.
- `npm run test:feedback-browser` — separate headless Chrome and localhost fixture
  server, real UI and shell, synthetic API responses, no login or DB connection.
  All external browser requests are blocked. Checks IT/EN at desktop 1440/1280
  and mobile 390/320 widths, desktop viewport fit, success/error/draft retention,
  optional context, safe rendering, filters/status updates, pagination, keyboard
  interactions, mobile navigation and light theme. This is fixture QA, not a
  live authenticated production smoke test.

Browser screenshots and machine-readable results are generated under
`output/playwright/feedback/` and are not committed.

## Integration with concurrent tasks

Shared changes are deliberately small:

- `src/components/design/sidebar.tsx`: one user link and one admin link.
- `src/components/design/app-shell.tsx`: add `/feedback` to the existing
  `reference-workspace` route list, reusing the published tokens and sidebar.
- `src/components/admin-topbar.tsx`: one title-map entry.
- `prisma/schema.prisma`: one User relation plus the new model.
- `package.json`: two dedicated local QA commands.

All layout CSS for this feature is in `src/components/feedback.css`. No changes
to the five existing page layouts or the auth task's files. During integration,
retain the visual correction task's app-shell structure and carry over only the
feedback route addition. No locks, env files, credentials or production config
were changed.
