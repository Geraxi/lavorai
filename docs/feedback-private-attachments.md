# Private feedback attachments and support access

Candidate branch: `feat/private-feedback-attachments`, rebased onto released main
`7770b24` (the independently merged landing-menu fix from PR #38). The Discover fix and application
repair are upstream. PR #39's mobile layout, default light theme, saved theme
preference and always-open globe are preserved exactly; its rebase had no conflicts.
No pending PR changes were imported. PR #38 landed during the approved release;
its landing CSS is preserved without modification. The earlier rebase
onto `3764315` only required combining test script entries. Pre-rebase candidates
are retained at `backup/private-feedback-before-main-3764315` and
`backup/private-feedback-before-main-6a2a15c`. The tested candidate `9491922`
was preserved at `backup/private-feedback-approved-9491922` before publication.
The user subsequently approved publishing the image-enabled update and its
two-table migration. No real reports, emails or applications are used for release checks.

Approved migration applied on 2026-10-16 at 17:28:40 UTC to Frankfurt project
`curly-silence-16024948`, branch `br-aged-band-al1r48g9`, database `neondb`, after
successful rehearsal on temporary branch `br-dry-breeze-al5m4knf` (now deleted).
Recovery snapshot: `snap-proud-pond-alaovkod`, expires 2026-10-23 20:00 UTC.
SQL SHA-256: `213d186f3e5a53dbbf348339f3ba37582e1d23e80ed5ffc929f3303a1db03329`.
Only its migration-history record was added; existing schema/history hashes and
counts (318 users, 4,293 applications, 54,207 jobs, zero feedback reports) were
unchanged. Production scanner settings remain absent, so PDFs remain disabled.

## Rollout without a scanner

**Yes: support access and image attachments can ship independently of PDF uploads.**
With neither `FEEDBACK_CLAMD_SOCKET` nor `FEEDBACK_CLAMD_HOST` configured:

- The picker accepts PNG/JPG/JPEG/WebP, and IT/EN copy clearly says PDF upload is
  unavailable. Selecting a PDF programmatically also produces a client error.
- The API independently rejects actual PDF inputs with 415 `pdf_disabled`.
  A forged client cannot enable them. No report or attachment from that submission
  is stored, including mixed image/PDF submissions.
- Text reports and validated, rewritten images work normally without a scanner.
- Images are labeled rewritten, never falsely labeled malware-scanned.

When a private scanner is configured, PDFs must pass structure validation and a
clean scanner verdict **before** report/file insertion. Scanner errors, outages,
timeouts and malware reject the upload; no new PDF enters quarantine. Existing
quarantined rows, if any, remain inaccessible and retain admin rescan/delete
support for compatibility. This candidate has not been deployed, so it has
created no production quarantined files.

## Access

`/feedback` lives in `(support)`, outside the paid app layout. Its server page and
every report/file handler require a real Auth.js session, an existing database
user and no `suspendedAt`. Free, card-unverified and expired-trial users can use
support. A genuine suspension still denies support, including allowlisted admins.

The support shell does not fetch paid sidebar stats, preferences or popups.
Sidebar/mobile links retain `/feedback`; localized links are added to membership,
trial-expired and onboarding screens. Returning to `/dashboard` still passes
through the existing billing gate. Billing entitlements, trial duration, prices,
application sending and shared app navigation/layout remain unchanged. Admin
report review/status changes and legacy PDF release remain allowlist-only.

## Validation, limits and lifecycle

- IT/EN picker, image previews, names/sizes, removal, progress, processing state,
  retryable errors and draft retention. Inputs are disabled during submission.
- At most 3 files and 3 MiB combined, before and after image rewriting. Multipart
  bytes are bounded while streaming to 3 MiB + 32,000 bytes, including requests
  with missing or dishonest Content-Length. JSON retains its 24,000-byte bound.
- 30 MiB of stored attachments per account at any time; removing saved files
  frees capacity. Text support remains usable at the storage cap.
- Extension, declared MIME and binary signature must agree. Sharp fully decodes
  and rewrites PNG/JPEG/WebP with a 16-million-pixel limit and 5-second timeout.
  Original metadata/appended payloads are discarded; animation and truncation
  are rejected. No DOCX, SVG, HTML or executable upload support.
- When enabled, PDF.js validates PDF structure in a worker with a 5-second
  deadline and 128 MiB old-generation V8 heap budget. No rendering/font evaluation;
  rejects encryption, forms, attachments, JS/actions and over 50 pages. This is
  conservative validation, not a malware scan or a hard process-memory sandbox.
- Two concurrent normalization jobs per server instance; overload returns a
  retryable 429. Existing durable report limits remain 5/hour and 20/day.
  Multipart attempts have a separate durable 20/hour and 60/day budget reserved
  before parsing, including invalid uploads. The same per-user advisory lock
  serializes quota accounting. One budget row per user, no content logging.
- Filenames become bounded ASCII basenames with validated extensions. They never
  control a storage path or inject a response header.

The existing generic file helper writes public Vercel Blob URLs; it is not used
or modified. Files use the existing private PostgreSQL database as BYTEA. There
is no new bucket, storage credential, grant or paid service. The tradeoff is up
to 30 MiB of database/backup growth per account, which should be monitored.

Bytes and metadata commit atomically with the report. Failed validation/quota/
transactions leave no staged objects. Report/account deletion cascades to file
bytes; explicit attachment removal deletes its row. Backup retention follows the
operator's existing database policy. Lists/details select metadata only.

`GET /api/feedback/:reportId/attachments/:id` checks both IDs and owner identity,
or a freshly authorized admin. Other users receive 404. Downloads are always
attachments with private/no-store, nosniff, sandbox, same-origin and no-referrer
headers; PDFs are never embedded. DELETE allows owner/admin removal with CSRF.
POST requires admin plus CSRF and rescans a legacy quarantined file. Clients
cannot supply verdicts; malware deletes the rejected file, errors never release it.

## Exact additive migration scope

File: `prisma/migrations/20261016120000_feedback_attachments/migration.sql`.
The existing FeedbackReport migration must already be present. This SQL creates:

1. `FeedbackAttachment`:
   - `id TEXT` primary key; `reportId TEXT` foreign key to `FeedbackReport(id)`
     with `ON DELETE CASCADE ON UPDATE CASCADE`.
   - `position INTEGER` constrained to 0–2; unique `(reportId, position)` index.
   - `filename VARCHAR(120)` constrained to safe ASCII basename characters.
   - `contentType VARCHAR(32)` constrained to PNG/JPEG/WebP/PDF MIME values.
   - `byteLength INTEGER` constrained to 1–3,145,728.
   - `data BYTEA`, with `octet_length(data) = byteLength`.
   - `scanStatus VARCHAR(16)` constrained to sanitized/quarantined/clean; PDFs
     cannot have the sanitized status.
   - `createdAt TIMESTAMP(3)` with `CURRENT_TIMESTAMP` default.
2. `FeedbackUploadBudget`:
   - `userId TEXT` primary key and foreign key to `User(id)` with delete/update
     cascades.
   - `hourStart TIMESTAMP(3)`, `hourCount INTEGER` constrained to 1–20.
   - `dayStart TIMESTAMP(3)`, `dayCount INTEGER` constrained to 1–60.

All columns are NOT NULL. There are no alterations to existing tables/columns,
no backfills, no existing-row updates, no new roles/grants, no extensions and no
object-storage changes. Prisma adds relations to User/FeedbackReport without
adding database columns to those tables. The PDF-capable schema can be used for
an image-only rollout; the server gate controls PDF admission.

Before a separately approved release, verify the actual Neon target and migration
history, apply only the reviewed additive SQL with correct bookkeeping, regenerate
Prisma and release. Do not trust an old DIRECT_URL or blindly apply all historical
migrations. The separately approved application of this migration is recorded above.

## Optional scanner configuration — not provisioned

Use `FEEDBACK_CLAMD_SOCKET` for an approved private local Unix socket, or
`FEEDBACK_CLAMD_HOST` with optional `FEEDBACK_CLAMD_PORT` (default 3310) for an
approved private trusted endpoint. Clamd TCP has no built-in authentication/TLS;
do not expose or use a public endpoint. Approve any network reachability/egress
changes separately. Maintain signatures and `StreamMaxLength` of at least 3 MiB.

The adapter uses `zINSTREAM`, accepts only exact `stream: OK`, bounds replies and
has an 8-second deadline. Local tests simulate clean/malware/error/disconnect
responses; they do not establish real antivirus effectiveness or production
connectivity. Configured scanner outages fail closed. With no scanner config,
images remain usable and PDFs stay disabled. No scanner environment was changed.

References: [ClamAV protocol](https://docs.clamav.net/manual/Usage/ClamdProtocol.html),
[ClamAV network guidance](https://docs.clamav.net/manual/Usage/Scanning.html),
[Sharp input bounds](https://sharp.pixelplumbing.com/api-constructor/).

## Verification commands and evidence

- `npx tsc --noEmit` and the normal `npm run build` in the candidate checkout.
  Build uses deliberately unavailable local DATABASE_URL/DIRECT_URL values.
- `npm run test:feedback-files`: synthetic formats/content/bounds/concurrency,
  unconfigured PDF rejection, parser validation and configured scanner outcomes.
- `npm run test:feedback-postgres`: exact additive migrations against populated
  pre-change schema, real SQL/handlers, authorization matrix, strict bodies,
  CSRF, quotas, failed-upload atomicity, PDF rejection and legacy quarantine.
- `npm run test:feedback-browser`: IT/EN at 1440/1280/390/320, image flow, progress/
  retry retention, disabled PDFs, simulated configured PDF flow and legacy admin
  scan controls. External requests blocked. Screenshots and results under
  `output/playwright/feedback/`.
- `npm run test:feedback-runtime`: compiled Next with real synthetic Auth.js
  sessions and ephemeral local PostgreSQL. Checks support/billing/suspension,
  multipart image uploads, unconfigured PDF rejection before storage, owned
  downloads, cross-user denial and desktop/mobile Chrome. Evidence under
  `output/playwright/feedback-runtime/`. Default uses this candidate's build.
  Also verifies the merged light default and preservation of a saved dark theme.

The prior isolated diagnostic build is retained only as historical evidence; it
is no longer needed with the Discover fix already on released main.
No shared cache or another task's artifact may be removed to free disk space.

Latest candidate validation after reconciliation with main `6a2a15c`: normal
`npm run build` (Turbopack, 155 routes), generated/source TypeScript, the full
`npm test` chain including upstream privacy consent, file/scanner tests, exact
PostgreSQL migration/route suite, 29 browser fixture screenshots and the normal
compiled-runtime suite all passed. Logs are under `output/feedback-reconciled-*.log`.
The latter
uses real synthetic Auth.js sessions and an ephemeral localhost database, with
no scanner configured: it verifies images succeed and PDFs are rejected before
storage. The former Discover build blocker is resolved upstream. No scanner setup
has been performed. Production migration and release are tracked separately above.

Two additional upstream browser suites were attempted without modifying their
files. `test:user-workspace-browser` reaches line 538, then expects a default light
theme although its fixture HTML omits the root `ThemeScript`.
`test:product-consistency-browser` cannot bundle because its `next/image` mock
lacks `getImageProps`, now imported by the landing page. These are recorded as
unpassed fixture checks, not a claim that the broad suites passed. Logs are
`output/feedback-reconciled-workspace-browser.log` and
`output/feedback-reconciled-product-browser.log`. The actual compiled support
runtime independently passes both theme assertions.

Visual observation for the parent: the inherited cookie banner has low text
contrast under the new light default in `output/playwright/feedback-runtime/real-support-390.png`.
No shared banner or theme code was changed in this scoped feedback candidate.
PR #39's production hosting was not checked here.
