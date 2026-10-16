# Private feedback attachments and support access

Candidate branch: `feat/private-feedback-attachments`, based on refreshed main
`09d1f7e11fee343d2be2bd65f8ed702c5e23dad1`. No production migration, deployment,
push, external reports, emails or application sends are part of this work.

## Access

`/feedback` now lives in `(support)`, outside the paid application layout. Its
server page and every report/file handler call `requireReportActor`: a real
Auth.js session, an existing database user and no `suspendedAt` are required.
Free, card-unverified and expired-trial users can use this support surface.
A genuine account suspension still denies support, including allowlisted admins.
Billing expiry is not treated as a security suspension.

The minimal support shell does not fetch sidebar stats, preferences, popups or
other paid APIs. Existing sidebar/mobile links keep the same URL. Localized
links are added to membership, trial-expired and onboarding screens. Returning
to `/dashboard` still passes through the existing billing gate. No paid-route
allowlist, billing entitlement, trial duration, price or sending code changed.
Admin report list/detail/status changes and PDF release remain allowlist-only.

## Files and UI

- “Allega file” / “Attach files”, image previews, file names/sizes, removal,
  upload progress, processing state and retryable errors. Draft text and files
  survive failure. File input and submission are disabled during upload.
- PNG, JPG/JPEG, WebP and PDF; **no DOCX, SVG, HTML or executable uploads**.
- At most 3 files and **3 MiB combined** per report, before and after image
  rewriting. The multipart envelope is bounded while streaming to 3 MiB +
  32,000 bytes, even with missing or dishonest Content-Length.
- A **30 MiB stored-file cap per account** at any time. Owners can remove saved
  attachments to free capacity; text reports remain available at the cap.
- Extensions, declared MIME and binary signatures must agree. Images undergo
  a full Sharp decode/re-encode with a 16 million pixel limit, a 5 second
  processing timeout and rejection of animation/truncated images. Original
  metadata and appended payloads are discarded. Output is never SVG.
- PDF structure is parsed using the existing PDF.js dependency in a Node worker
  (5 second deadline, 128 MiB old-generation V8 heap budget, no rendering/font
  evaluation). Rejects encrypted documents, forms, attachments, JS/actions,
  active-content names and more than 50 pages. This is conservative validation,
  **not a malware scan or a hard process-memory sandbox**.
- Stored names are bounded ASCII basenames with a server-chosen validated
  extension. No user filename controls a path or response header.

## Private storage and lifecycle

The existing generic file helper writes **public Vercel Blob URLs**. It is not
used or changed. This candidate uses the already-connected private PostgreSQL
database: `FeedbackAttachment.data` is BYTEA, read only by authorized handlers.
No object-storage bucket, token, persistent grant or paid service is provisioned.

Bytes and metadata are inserted in the same transaction as the report. Invalid
files, quota failures and failed transactions leave no staged files or orphaned
objects. Report/account deletion cascades to the byte rows in the same database
transaction. Explicit attachment removal deletes the byte row. Database backup
retention remains the database operator's existing policy.

The tradeoff is database/backup growth: up to 30 MiB per account plus metadata.
Monitor usage before broad rollout. A later move to private object storage would
need separately reviewed credentials, quarantine and deletion/outbox handling.

Lists and details select attachment metadata only; they never serialize bytes,
storage keys or URLs. Downloads use
`GET /api/feedback/:reportId/attachments/:id`, matching both IDs and the report
owner, or a freshly authorized admin. Other users receive 404. Responses are
`private, no-store`, `nosniff`, same-origin, sandboxed and always
`Content-Disposition: attachment`; PDFs are never embedded or previewed.

`DELETE` on that endpoint permits owner/admin removal with CSRF validation.
`POST` is an admin-only quarantine rescan/release, also CSRF-protected. A client
cannot submit a scan verdict. A malware result deletes the rejected file; an
error never releases it. Unscanned PDFs return 423 to owners and admins alike.

## Scanner dependency — not provisioned or verified in production

No existing malware scanner was found. Images can be used after rewriting and
are labeled **rewritten**, not scanned. PDFs can be submitted but stay in
**quarantine and cannot be downloaded** until a separately approved ClamAV
connection clears them. Do not advertise unrestricted PDF review before this
operational dependency is met.

Supported optional configuration:

- `FEEDBACK_CLAMD_SOCKET`: private local Unix socket, preferred where available.
- Otherwise `FEEDBACK_CLAMD_HOST` and optional `FEEDBACK_CLAMD_PORT` (3310).
  This must be an approved private, trusted endpoint reachable from the app
  runtime. Clamd TCP has no built-in authentication/TLS; do not use a public
  endpoint or a third-party document-upload service.
- Configure maintained signatures and ClamAV `StreamMaxLength` of at least
  3 MiB. Configure network reachability/egress only with separate approval.

The adapter uses ClamAV's documented `zINSTREAM` protocol, exact `stream: OK`
acceptance, 8 second deadline, bounded replies, and fail-closed handling of
malware, scanner errors, disconnects and timeouts. When configured, new files
are scanned before storage; admins can retry old quarantined PDFs using
“Controlla PDF” / “Check PDF”. With no configuration, new PDFs stay quarantined.
The local scanner tests emulate protocol replies; they do not establish
antivirus effectiveness, signature freshness or production connectivity.

References: [ClamAV protocol](https://docs.clamav.net/manual/Usage/ClamdProtocol.html),
[ClamAV network guidance](https://docs.clamav.net/manual/Usage/Scanning.html),
[Sharp input bounds](https://sharp.pixelplumbing.com/api-constructor/).

## Rate limits and migration

Existing report limits remain 5/hour and 20/day, under a per-user transaction
advisory lock. Multipart attempts also reserve a durable fixed-window budget of
20/hour and 60/day **before reading/parsing files**, including invalid uploads.
There is one budget row per user, with account-deletion cascade. Upload limits
never disable text support. Concurrent quota accounting uses the same user lock.
Each server instance admits at most two concurrent file-normalization jobs,
returning a retryable 429 under load. No report contents or file bytes are logged.

Prepared additive migration (not applied remotely):
`prisma/migrations/20261016120000_feedback_attachments/migration.sql`.
It creates only `FeedbackAttachment` and `FeedbackUploadBudget`, with cascades,
file MIME/size/state checks and a unique `(reportId, position)` constraint with
positions 0–2. Existing User and FeedbackReport fields are unchanged.

Before separately authorized release:

1. Confirm the actual production Neon branch/database and migration history; do
   not trust an old DIRECT_URL or blindly apply all historical migrations.
2. Apply the reviewed additive SQL with correct migration bookkeeping, then
   regenerate Prisma and release the code. The existing FeedbackReport migration
   must already be present. Without the new tables, report APIs fail closed.
3. Include Sharp's native runtime dependency and traced PDF.js `pdf.mjs` and
   `pdf.worker.mjs` in the deployed `/api/feedback` function. The Next config
   explicitly traces these parser files; verify the built artifact.
4. Decide whether to enable an approved private scanner, or release with PDF
   quarantine explicitly communicated. No scanner environment was changed here.
5. Resolve the unrelated existing `/discover` optional-props build error before
   the normal full-project build/release.

## Verification

- `npm run test:feedback-files`: synthetic PNG/JPEG/WebP/PDF validation, spoofing,
  active content, invalid formats, pixel/byte/count bounds, sanitized output and
  local simulated ClamAV clean/malware/error/disconnect protocol responses.
- `npm run test:feedback-postgres`: exact migrations against populated pre-change
  schema, real SQL/handlers, real-session boundary stub, free/no-card/expired/
  paid/other-user/admin/suspended matrix, CSRF, strict JSON and multipart,
  quarantine, no bytes/URLs in JSON, download headers, quotas, failed-upload
  atomicity, deletion cascades and rate-limit concurrency.
- `npm run test:feedback-browser`: actual React UI/shell in Chrome with synthetic
  API/XHR boundaries. IT/EN at 1440/1280/390/320, image preview/remove, limits,
  progress/failure retention, owner removal, admin scan UX and safe rendering.
  External browser requests are blocked; screenshots under
  `output/playwright/feedback/`.
- `npm run test:feedback-runtime`: requires a completed production build. Starts
  compiled Next with real Auth.js synthetic sessions and ephemeral local
  PostgreSQL. Covers compiled PDF worker, uploads/downloads, support/billing
  boundary and desktop/mobile rendering. Set `FEEDBACK_RUNTIME_BUILD_DIR` only
  to a separately prepared diagnostic build directory if necessary.

The normal build compiled successfully but Next's generated type check exposed
an unchanged baseline error in `src/app/(app)/discover/page.tsx:28`: the default
`= {}` parameter makes page props potentially undefined. Diagnostic build
validation uses a separate local copy with only that signature corrected; the
candidate preserves the baseline Discover source and does not claim a clean
unmodified normal build. Consult the handoff for final command results.

### Final local results

- Source TypeScript: passed; diagnostic build TypeScript also passed.
- File/scanner protocol suite: passed (synthetic scanner only).
- Exact migration + real PostgreSQL handler suite: passed, including its
  production-runtime mode with real Auth.js synthetic sessions.
- Browser fixture suite: passed, 28 screenshots, zero external requests or page
  errors; production-runtime Chrome checks passed at 1440 and 390 pixels.
- Existing regression chain: auth, Google auth, trial, schema compatibility,
  worker/retry, sending/reply, release controls, manual rollout, card onboarding,
  user workspace, pagination and attention checks passed. Two UI/route test
  fixtures were updated for the support link and new route group.
- Full normal build: compiled successfully, blocked at generated Next page-props
  validation by the unchanged Discover signature above.
- Separate diagnostic build: passed compilation, TypeScript, prerender and
  tracing, with only that baseline signature corrected in the separate copy.
  The PDF parser and worker are present in the API trace. Static data queries
  reported the deliberately unavailable local build DB; no remote DB was used.

Diagnostic copy: sibling `lavorai-support-build-check` (not the candidate).
Runtime evidence: `output/playwright/feedback-runtime/qa-result.json` and two
screenshots. Synthetic browser evidence: `output/playwright/feedback/qa-result.json`.
