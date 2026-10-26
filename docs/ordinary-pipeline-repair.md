# Ordinary pipeline repair — 2026-10-26

Base and latest remote main: b4c325e0f4641cb6bab2c1f03c1dd458d6ac28a0.
Isolated branch: codex/ordinary-pipeline-repair. Prepared and tested locally; publication subsequently authorized, conditional on final Linux CI and a paused deployment.

## Confirmed defects and fixes

- Real PostgreSQL ordinary-worker test reproduced two sends competing for one free weekly slot. SQL NOT IN / <> excluded NULL errorMessage/submitConfirmation, unlike the old in-memory test evaluator. Both weekly reservations and shared daily/monthly/company filters now explicitly include NULL. No quota values or billing policy changed. Regression now admits exactly one.
- Blank extracted CV text now stops before AI/document generation. Removed the synthetic fallback from the ordinary optimize call. Actual diagnostic profile behavior is unchanged.
- An adapter's explicit pre-transmission refusal is NOT_SUBMITTED for ordinary applications, with a cleared lease, rather than UNCONFIRMED. CAS excludes recorded submitted/outbound/click evidence. Global attempt reservation remains consumed: this does not authorize automatic replay or refund.
- Worker user notifications now require no provider error and a nonblank provider ID before EmailLog records acceptance. Notification failure does not undo the ATS receipt or replay the application.
- Heuristic inbound confirmation classification can no longer write confirmedAt/sendStatus/proof. Current normalized messages have no trustworthy sender-authentication + candidate/offer binding. The shared promotion function fails closed for both inbound paths; messages and classifications remain visible. Existing API receipts and historical data are unchanged. Re-enabling email-derived proof needs an explicit authenticated evidence model, not From/subject/AI matching.

## Verification

New test: `ORDINARY_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55460/lavorai_ordinary_test npm run test:ordinary-pipeline-postgres`.
Refuses remote/non-dedicated/nonempty database. Real Prisma transactions, normal queued admission, consent/preferences/billing checks, CV generation (DOCX/PDF), real Recruitee adapter against local TLS server, begin/recheck/complete gates, real receipt persistence and dashboard delivery projection. No diagnostic token or gate mocks. Only AI boundary and notification SDK are simulated; ATS fetch is routed to loopback and all other network fetch is refused (bundled data-URL WASM is local).

Cases passed:
- Ordinary success with proof and dashboard confirmed; replay does not dispatch again.
- Six simultaneous worker calls for one application produce one fake candidate POST.
- HTTP500 ambiguity stays UNCONFIRMED; no duplicate POST on reinvocation.
- Missing privacy consent / paused subscription stop before AI and submission.
- Empty CV text fails before AI; unreadable attachment and unsupported required field produce zero candidate POSTs and truthful NOT_SUBMITTED.
- Wrong-offer adapter receipt cannot complete, notify success, or authorize replay.
- Free weekly quota exhausted blocks before AI; last remaining slot with two ordinary workers permits one POST.
- Successful notifications use fake SDK; provider error or missing ID never records sent and never resends the application.
- Heuristic receipt cannot promote an unsubmitted application; inbox unit suite covers storing/dedup without proof SQL.

Final checks passed (macOS Node25.2.1, PostgreSQL16):
- `npm test`
- `node node_modules/typescript/bin/tsc --noEmit --incremental false`
- `npm run build` (175 static pages, empty dedicated localhost schema, dummy AUTH_SECRET, holds on)
- `npm run test:ordinary-pipeline-postgres`
- `npm run test:manual-rollout-postgres` (separate local DB; global atomic cap, immutable reservations, failure/rollover cases)
- `npm run test:send-reply-postgres` (separate local DB; fake provider; duplicate inbound, hold, event ordering, durable uncertainty)
- `npm run test:mcp`, `git diff --check`
- `npm run lint` exits zero but is the repository's no-op, not an ESLint pass.

A concurrent earlier npm-test/build attempt hit a transient Prisma binary load while build regenerated the client. Final full test rerun after generation/build passed. Linux CI step added for the ordinary suite, but not launched (no push authorized). Public font fetch during build only; no production DB/env file loaded.

Logs are outside Git: /tmp/lavorai-ordinary-{test,final-tests,final-build,types,budget,send-reply,mcp,lint}.log.

## Scope and release prerequisites

No schema changes, production writes, customer sends, repeat diagnostic submits, commit/push/deploy. Production config reread: APPLICATIONS_PAUSED=true, USER_NOTIFICATIONS_HOLD=true, ATS_TEST_REAL_SUBMIT=false. No changes to other checkouts. Local test server stopped after checks.

These tests start from ordinary queued applications, not HTTP signup/billing or real external AI/browser providers. They do not prove all ATS adapters, paid-plan quota policy, live inbox DNS/auth, or ordinary customer rollout. The no-op email-proof promotion intentionally leaves email-only confirmation unverified pending authenticated correlation; historical questionable proof is not rewritten. Existing notification dispatch remains synchronous without a durable retry queue; this repair prevents false acceptance and application replay, not guaranteed notice delivery. The hold flag covers scheduled kinds; application pause also suppresses application notices. No change to that policy.

The missing Recruitee auto-confirmation email is distinct from candidate acceptance. The adapter submits candidate multipart and records its API receipt; it does not request or guarantee employer autoresponder delivery. No new email/provider probe was made.

Next: run Linux CI on exact final SHA, review and deploy while paused. Before any customer rollout, separately reconcile current entitlement/release policy, verify live schema and authenticated mail routing, and choose explicit bounded release; do not replay historical rows or infer unpause authorization from this repair.
