# Credit-failure retry runbook

This runbook covers the admin credit-retry workflow and its opt-in queue path. The combined patch also includes separately reviewed worker admission, submission and recovery safeguards. It does not migrate data or schemas, buy credits, enable accounts, extend trials, change preferences, or silently widen the retry window.

## Preconditions before any live retry

1. Independently verify the production worker schema and current polling logs. The known missing `User.demoGeneratedAt` / `demoCompletedAt` columns must be resolved through a separately authorized repair. This endpoint never runs a migration. Live calls perform a read-only `information_schema` check for columns used by the worker startup query and return HTTP 503 `worker_schema_not_ready` if unavailable.
2. Publish the reviewed worker safeguards before resuming any existing queued backlog; the admin retry guard cannot protect work already queued on an older worker. Verify the expected worker code version and that the worker is actually running without query failures and AI credit health is restored. There is no durable worker-heartbeat primitive; the operator must confirm a fresh check in the UI or send `workerHealthConfirmed: true`. A schema check alone does not prove worker or AI availability.
3. Review existing queued work, round capacity, and remaining per-user daily/monthly application quota before publishing more work. The retry and new worker guards do not reserve those per-user quotas; their existing creation-time checks do not reliably charge historical failed rows when requeued. For quota-limited accounts, a separate remaining-quota review is required before a live retry. Existing queue items are not reset or cancelled by this endpoint. An active round at 27/30 with 21 queued rows has **zero retry capacity**.
4. Do not use the legacy `scripts/requeue-credit-failed.ts --apply` path: it does not have these safeguards.
5. Review and publish only an authorized, reviewed patch. Do not include an unrelated email-reliability patch or schema migration. No production action is performed by the local tests.

## Preview contract

`POST /api/admin/retry-credit-failures` retains its existing admin session / `X-Admin-Key` authorization. Send valid JSON. Missing or malformed JSON returns 400; `{}` is a read-only preview with `days: 14`, `limit: 100`.

Example read-only request:

```json
{ "dryRun": true, "days": 14, "limit": 200 }
```

The response contains:

- `dryRun: true`, `requeued: 0`: no DB writes, queue cancellation/enqueue, provider requests, or application sends.
- `found`: records examined **on this page**, not a full-cohort total.
- `candidates`: eligible exact `id`, `userId`, `jobId`, and opaque application `version`.
- `skipped`: exact ID and exclusion reason, without user emails, CV content, provider secrets, or raw errors.
- `hasMore` / `nextCursor`: pass `cursor: nextCursor` with the same days/limit to inspect the next page. The UI replaces the current page; it never implicitly selects applications across pages.

Only an explicit `days: 30` selection widens the window. Candidate selection is oldest-first with a stable ID tie-break. Preview is a snapshot; eligibility and capacity are rechecked on execution.

## Exact-ID canary and bounded batch

A live canary is **one real application retry**, and may consume AI credits and send an application or recruiter email. It is not a portal dry-run.

After reviewing a preview and verifying worker/AI health, submit one exact ID and its unchanged preview version:

```json
{
  "dryRun": false,
  "days": 14,
  "mode": "canary",
  "applicationIds": ["EXACT_PREVIEW_ID"],
  "versions": { "EXACT_PREVIEW_ID": "64_CHARACTER_PREVIEW_VERSION" },
  "workerHealthConfirmed": true
}
```

`mode: "canary"` permits exactly one ID. `mode: "batch"` permits at most ten unique exact IDs with versions. Missing IDs, stale versions, duplicate IDs, invalid bounds, and unknown input keys fail closed. There is no mass retry without IDs.

Check the canary's actual persisted result and worker logs before requesting a batch. Do not use `admin/test-apply` as proof of execution: it historically calls the worker directly for nonqueued records and can report success for a no-op. Canary-first is an operator workflow; the API does not persist a canary-success prerequisite. The UI explicitly confirms the real-send consequence and the selected IDs. Refresh the preview after each execution.

## Safety and eligibility

- Recognizes the worker's exact `CREDITI AI ESAURITI:` prefix and known raw AI-provider credit/quota signatures. Generic `insufficient`, `quota exceeded`, CAPTCHA, streaming and truncated-output errors are excluded.
- Requires a completed failed record with no submission metadata, canary/form evidence, generated documents, recruiter-reply/open evidence, or user-provided outcome.
- Requires current verified email, privacy consent, auto mode, a CV, unsuspended/unpaused customer, existing trial/payment-method eligibility and an active/trialing paid entitlement unless the existing lifetime exception applies. Hybrid/manual historical consent cannot be established from Application and is excluded.
- Requires an open job and, where present, an active/legacy-auto session owned by the same user. Round room is `targetCount - sentCount - existing pending reservations`; a preview also accounts for earlier selections on its page.
- Blocks a same-user/job counterpart with successful, pending, manual, unknown or cancelled state, unknown failure cause, or any possible submission evidence. Among clean credit failures, the oldest eligible same-user/job row wins deterministically.
- Live processing uses the existing per-user advisory-lock primitive in a Serializable transaction. It compares the preview version and then conditionally updates the same completed failed snapshot. Concurrent retry calls cannot reset a started/submitted row or queue two clean siblings.
- Queue publication preserves a worker's newer claim and never uses the legacy unclaimed in-process fallback for retry callers. Normal callers retain their existing behavior.

## Outcomes, uncertainty and rollback

`requeued` means the DB transition committed, not that an employer received anything. `requeuedIds` identifies those records. `enqueueWarnings` leaves the record for the existing DB polling worker; never reset it blindly. A transaction conflict or uncertain error returns `ok: false` and `unknownIds`, separately from the confirmed requeue count; a commit may already have succeeded. Inspect current state and get a fresh preview before trying again. Do not roll a queued record back to failed after a queue error because a worker may already have claimed it.

A read-only preview cannot determine whether a previously open job has closed remotely. The existing worker still performs its liveness check. Jobs rejected by this conservative workflow require separate review; do not broaden the matcher or strip metadata to force them through.

For this urgent rollout, the worker also conservatively holds existing manual/hybrid records because per-application consent provenance is not persisted. Those records remain preserved and are not reported as submitted; restoring those workflows requires separately reviewed consent handling.

These guarantees cover this retry endpoint. Current entitlement, round capacity and the existing global AI budget are checked; full per-user daily/monthly quota enforcement on historical retries is a remaining limitation. Other creation/retry paths and the worker require their own current-eligibility, duplicate and round-reservation safeguards. Do not interpret this endpoint as a global database uniqueness constraint or a substitute for the separately reviewed worker guard.

## Local verification

Run `npm run test:credit-retry`, `npm test`, `npx tsc --noEmit --incremental false`, `npm run test:mcp`, and the normal Next build. The focused script uses synthetic data and a mocked Prisma boundary, including concurrent retry simulations; it never contacts production. Actual PostgreSQL concurrency verification, build results, and any unrun/browser checks must be reported separately.
