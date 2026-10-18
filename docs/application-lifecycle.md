# Application lifecycle (derived) — contract for the UI

Source: `src/lib/application-lifecycle.ts` (pure derivation), `src/lib/posting-key.ts` (posting identity),
read API `GET /api/applications/lifecycle`. No schema change: every row, old or new, is derived from columns
the worker already writes. Nothing is backfilled or rewritten.

## Statuses

| `status` | Meaning | it label | en label |
|---|---|---|---|
| `draft` | Prepared or preparing, waiting on the user (approve, answer questions), or a preview/test | Bozza | Draft |
| `approved` | User approved (explicit consent or auto mode). Queued, preparing, or **held** (`held: true`) | Approvata, in coda / Approvata, in attesa | Approved, queued / Approved, on hold |
| `submitting` | A delivery attempt is in flight | Invio in corso | Submitting |
| `confirmed_submitted` | Positive evidence: verified ATS receipt (HTTP response or confirmation page) or email `delivered` provider event | Inviata, confermata | Submitted, confirmed |
| `submitted_unverified` | Sent or possibly sent, no confirmation evidence. Never auto-retried | Inviata, non verificata | Submitted, unverified |
| `failed` | Stopped without delivery; `failureReason` says why | Non inviata | Not submitted |
| `needs_manual` | No supported automated route; `manual.applyUrl` + prepared documents | Da inviare a mano | Apply manually |

Always render `label` and `message` from the API (both `it` and `en` are returned); don't rebuild copy from the enum.
Marketing/brand copy can restyle them, but must keep the meaning (e.g. never call `submitted_unverified` "sent").

## Response shape

`GET /api/applications/lifecycle?ids=a,b,c` (max 50, owner-only) or `?limit=20` (newest first, max 50).

```json
{ "version": 1, "items": [{
  "id": "clx…",
  "status": "needs_manual",
  "legacyStatus": "ready_to_apply",
  "failureReason": null,
  "manualReason": "captcha",
  "held": false,
  "nextAction": "apply_manually",
  "label":   { "it": "Da inviare a mano", "en": "Apply manually" },
  "message": { "it": "Il portale chiede un captcha: …", "en": "The portal requires a captcha: …" },
  "tone": "warning",
  "evidence": { "type": "none", "at": null, "ats": null, "snippet": null, "receiptId": null, "httpStatus": null },
  "manual": { "applyUrl": "https://boards.greenhouse.io/acme/jobs/123", "documents": { "cvPdf": true, "cvDocx": true, "coverLetter": true } },
  "documentsUrl": { "cvPdf": "/api/applications/clx…/document?kind=pdf", "cvDocx": "/api/applications/clx…/document?kind=cv", "coverLetter": "/api/applications/clx…/document?kind=cover" },
  "retry": { "automatic": false, "reason": "not_failed" },
  "excludedFromMetrics": false
}]}
```

Field values:

- `failureReason`: `job_closed` · `duplicate_posting` · `ai_unavailable` · `transient_error` · `cv_missing` · `ats_form_unsupported` · `email_bounced` · `email_rejected` · `email_complaint` · `cancelled` · `unknown`
- `manualReason`: `captcha` · `unsupported_route` · `no_recruiter_email` · `ats_handoff` · `destination_unverified` · `portal_session_required` · `daily_cap_held` (the last one only appears as the `message` of a held `approved` row)
- `nextAction`: `none` · `wait` · `approve` · `answer_questions` · `apply_manually` · `verify_on_portal` · `fix_account`
- `evidence.type`: `ats_http_receipt` · `ats_confirmation_page` · `email_delivered` · `email_accepted` · `user_reported` · `legacy_detected_no_receipt` · `none`
- `evidence.at`: ISO timestamp of the proof (receipt capture time or the provider's last event), or null.
- `evidence.snippet`: short, PII-free text (provider, operation, HTTP status, signal). Never form contents or recipients.
- `retry.reason`: `allowed` · `possible_submission` · `not_failed` · `not_transient` · `retry_budget_exhausted` · `automatic_retries_disabled`.
  Today automatic retries stay disabled (`historicalRetriesBlocked()`), so `retry.automatic` is always `false` in production.

Screenshot references (`evidence.screenshotKey`) are only produced with `{ internal: true }` (admin use); the user API never returns them.

## Duplicate prevention

- Existing: one reservation per `submissionSubjectKey(userId, jobId)` (idempotency key, sha256, survives row deletion), creation dedup on `userId + jobId`, Greenhouse/Recruitee destination check.
- New: `postingAlreadyClaimed()` runs in `beginApplicationSubmission` for **every channel**, under the per-user advisory lock. It compares `canonicalPostingKey(job.url)` (provider posting id, or normalized URL without tracking params) across all of the user's applications. If a sibling row for the same posting is sent, in flight, possibly sent, or holds a reservation, this row is closed as `failed` / `NOT_SUBMITTED` with `failureReason: duplicate_posting`. Nothing was sent for it.
