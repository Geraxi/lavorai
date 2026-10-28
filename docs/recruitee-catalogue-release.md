# Recruitee standard-form catalogue — local release candidate

Base `9631b76077b3cb53622191ba95d8898baba8a7fe`, branch `codex/recruitee-catalogue`. No production writes, sends, imports, commit, push or deployment performed for this candidate.

## Exact scope and observed inventory

GET-only audit completed 2026-10-28 00:28:55 UTC: 631 stored Recruitee rows, 629 distinct canonical URLs, 551 rows marked not closed in storage. Two excess rows collapsed during URL canonicalization; no duplicate records were deleted. Results: 88 published standard-field forms, 420 published questionnaires, 42 unsupported required uploads/photo/video, 79 HTTP 404/410. No unknown HTTP outcomes. This is stored inventory, not a global or licensed total.

The exact new classifier rechecked the 88 standard forms at 00:36:15 UTC: all 88 remained standard. Three were owned ProduzioneWeb LavorAI test postings; these explicit test URLs are excluded, leaving **85 standard-form public offers** at this snapshot, before duplicate/identity quarantine and normal search/matching filters. Standard-form tenants/counts excluding tests: foodlabs1 2, ccmeurope 9, jobsdeerns 34, wacomeurope 2, boggimilano1 12, optics11 10, jobsmistertemp 8, machinelearningreply 3, natuvion 2, pysae 1, focusentertainment 2.

A separate 16-curated-board check at 00:21 UTC found 8 responding boards, 210 published offers, 185 mapped by existing EU relevance rules, **zero new IDs or canonical URLs** compared with stored inventory. Public access is not proof of republication permission. No global inventory or licensed-count claim is made.

## Customer behavior

Under `recruitee_only`, SQL queries require source Recruitee, not closed, capability exactly `standard`, and publication evidence <=24 hours old. Other providers, questionnaires, unsupported/malformed forms, unknown legacy rows, expired evidence and owned `produzioneweb.../o/lavorai-test-*` URLs are excluded. There is no new external-only catalogue or misleading CTA for the hidden groups. Historical application records remain untouched.

The same helper gates lists/search, SQL counts/pagination, recommendations, facets, public details/metadata/sitemap, MCP search/get, manual/batch admission and auto/worker admission. Direct hidden job links return not-found. Public pages are dynamic so old provider visibility cannot remain cached. A standard form still requires ordinary consent/preferences/matching/entitlement/quota, a readable CV and required phone/cover letter. No candidate facts or answers are inferred by this patch. Immediately before submission, the actual adapter fetches the form again and refuses non-standard/unknown forms in the restricted ordinary path, before attachments or POST. Diagnostic behavior is not used as an ordinary bypass.

## Exact additive migration

`20261028003000_job_publication_check`:

```sql
ALTER TABLE "Job"
  ADD COLUMN "publicationVerifiedAt" TIMESTAMP(3),
  ADD COLUMN "applicationFormCapability" TEXT,
  ADD COLUMN "catalogueCheckedAt" TIMESTAMP(3);
```

All nullable, no defaults, indexes, data backfill, table additions or customer-row rewrites. Brief PostgreSQL ACCESS EXCLUSIVE lock required; proposed transactional application with lock_timeout 3s and statement_timeout 30s, abort on contention. Verify exact runtime DB, migration checksum/history and three columns before deploying code that selects them. Legacy values remain null, never derived from cachedAt. Rollback retains harmless columns and metadata; reverting code restores prior broader catalogue behavior and must be understood as such.

## Implemented bounded metadata refresher

`src/lib/recruitee-catalogue-refresh.ts`, CLI `scripts/refresh-recruitee-catalogue.ts`, and authenticated `/api/cron/recruitee-catalogue` are implemented, not executed on production.

- Existing rows only: no job/application creation, deletion, paid model, recruiter lookup, email or candidate POST. Explicit 1–64 tenant allowlist; canonical provider HTTPS URLs only. Owned test offers excluded.
- Select at most 200 rows ordered by oldest catalogueCheckedAt/null first then ID. Two workers; 600ms delay after each request, 12s request timeout, 1MB response cap, no redirects and no retry on 429/errors. 210s execution budget stops new requests with headroom before the 300s route limit.
- GET individual public offer schema, verify provider ID against stored externalId. Standard/questions/unsupported publication observations are persisted; authoritative 404/410 or explicit nonpublished status clears publication evidence and marks closed immediately. Malformed schemas become unknown/hidden. Generic board-feed ingestion cannot stamp form evidence; in restricted mode it does not overwrite Recruitee rows.
- Transactional canonical-URL advisory lock plus observed-time conditional update prevents an older observation overwriting a newer closure/capability. Duplicate canonical records/provider ID mismatch are quarantined from visibility without rewriting identity or deleting history. Transient failures update only the attempt timestamp for fairness; they never extend publication TTL.
- Responses/logs expose processed and per-outcome counts, pending checks, expired standard-form count, deadlineReached and requiresFollowup. No profile/CV/mail data. Repeated runs advance through failures rather than restarting the same prefix. No one-shot assumption.

CLI after separate approval: set only the approved `RECRUITEE_CATALOGUE_REFRESH_TENANTS`, use existing authorized runtime DB access, run `node --import tsx scripts/refresh-recruitee-catalogue.ts --execute-metadata-only`. Recheck persisted counts before further batches; never expand tenant scope automatically.

## Repeatable schedule and rollout prerequisites

The endpoint is default-off unless `RECRUITEE_CATALOGUE_REFRESH_ENABLED=true`, requires existing CRON_SECRET authentication, and rejects missing/invalid tenant configuration. **No schedule is added or activated by this patch.** Proposed approved integration is this route every 4 hours (using the existing scheduler once its plan/cadence is confirmed), with the same fixed allowlist and bounded batch. At 200 per run this provides six opportunities/day for the current pool; actual throughput and pending/stale metrics must be checked, not presumed. The existing generic sync runs daily at 05:30 UTC and does not provide this guarantee.

Release sequence requiring approval: exact-head Linux CI; verified-runtime migration; deploy route with refresh disabled; authorize the fixed tenant set and recurring cadence; execute enough bounded metadata-only batches to cover that set; verify fresh standard forms/identity quarantine and live catalogue paths; enable recurring refresh and monitor its natural run. No changes to provider cutoff, five-attempt cap, notification hold or diagnostic disable. Do not publish a catalogue promise without the maintenance schedule configured and tested. Without refresh, evidence expires after 24h and listings disappear fail-closed; an outage does not mark jobs closed merely because fetching failed. Pending/expired evidence must trigger operational follow-up. This can reduce availability during outages; no indefinite stale listing fallback.

## Tests and limits

Local full `npm test`, typecheck, actual-migration PostgreSQL catalogue tests, ordinary pipeline PostgreSQL tests with fake providers, and webpack build. Catalogue regressions cover standard vs questions/uploads/unknown, explicit owned-test exclusion, filtering before count/pagination, records preserved, closure, transient TTL, changed requirements with zero POST, provider-ID/canonical collision, concurrent/newer observation fencing, and fair bounded resumption. Ordinary tests exercise a positive fresh standard-form row and reject a questionnaire before preparation. No live customer request or application was used.

Build has no production DB credentials; warnings from unrelated data-backed prerender paths are not runtime coverage. Linux CI and authenticated live UI are not yet run. Re-publication rights/opt-outs and scheduler capacity are release prerequisites, not inferred from unauthenticated GET success. Form availability can change after a cached check; the adapter's immediate recheck remains mandatory.

Official research reports Careers API authentication changes on 10 February 2027; XML feeds are not a submission API replacement. No credentials/partner request or architecture change is included. Revalidate official contracts before then:
https://docs.recruitee.com/reference/authentication-1
https://docs.recruitee.com/docs/feed
