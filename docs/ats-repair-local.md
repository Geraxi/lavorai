# Local ATS repair — 2026-10-25

Base: PR113, dba37d113c0b7d827c4a63684fc1ba54fddd6709 (still open at final read).
Branch: codex/ats-repair-local. Local verification completed before publication authorization.

## Changes

- Preserve PR113 token-only notification isolation and DRY_RUN lease cleanup.
- Process explicit diagnostic pre-submit refusal before generic missing_field handling; clear the lease and preserve REFUSED_BEFORE_SUBMIT. Submission uncertainty or recorded outbound/click evidence cannot take this branch. Ordinary-user uncertainty handling remains conservative.
- Dry run constructs the attachment/multipart payload and rejects missing or empty CV files before returning DRY_RUN; it never reaches candidate POST.
- Recruitee detection and apply both require HTTPS, a single provider-owned tenant hostname, no userinfo/nonstandard port, and an anchored offer path. Offer API redirects are rejected. Arbitrary custom domains no longer select this adapter from /o/slug alone. No custom-domain-to-provider resolution is implemented. When no adapter is verified, a Recruitee source or /o/ offer path now stops before recruiter lookup or browser fallback, clears the lease and leaves NOT_SUBMITTED with manual instructions. This intentionally also holds unrecognized non-Recruitee /o/ URLs; a verified supported adapter is unaffected. This is not a claim that every custom-domain job can be submitted.

## Verification actually completed

- test-ats-test-capability.ts: passed; fake fetch only, missing/empty CV, rejected origins, valid dry-run zero POST.
- test-ats-test-claim-postgres.ts: passed on disposable localhost PostgreSQL16; 2/10 concurrent claims have one winner, simulated submit concurrency has one POST.
- test-ats-test-e2e-postgres.ts: passed on disposable localhost PostgreSQL16 with fake HTTPS Recruitee and synthetic CV. Dry-run zero POST; 2/10 concurrent attempts one simulator POST; HTTP500 remains UNCONFIRMED with no second POST; explicit missing-CV refusal releases lease; zero email-provider calls/EmailLog rows/notice events; ordinary worker cannot borrow token exemption.
- TypeScript noEmit (incremental disabled): passed. git diff --check: passed.
- Initial integration reruns corrected fixture expectations (custom hostname rejection and new missing-CV offer listed by fake liveness API). These were local fixture failures, not live attempts.
- Full `npm run build`: passed against an empty local schema (175/175 static pages). First sandboxed build was interrupted after no progress; retry with public font network access and local database completed. No production environment loaded.
- `npm run test:manual-rollout-postgres`, `npm run test:send-reply-postgres`, `npm run test:ats-test-claim-postgres`, `npm run test:ats-test-e2e-postgres`: all passed on fresh localhost databases, fake providers only.
- `npm run test:mcp`: passed. `npm run lint`: exit 0 but repository explicitly uses a no-op lint script; this is not an ESLint pass.
- `npm test`: final full suite passed (exit 0), including the new worker handoff execution test.
- Full suite exposed pre-existing brittle fixed-line assertions and missing cv-extraction-log VM dependencies; repaired only those harnesses, not onboarding/release behavior.
- No production test, receipt authenticity validation or live dry-run performed by this repair.

The already-authorized single live dry-run report remains a separate prerequisite: deployed squash SHA, DRY_RUN, zero candidate POSTs, absence of candidate and test email since baseline, and unchanged pause flags require evidence from that executor. Local simulator results do not substitute for that report or prove the ordinary-user pipeline end to end.

## Handoff

Review/coordinate with PR113 owner before integration. Publication of the combined repair was authorized on 2026-10-25 at 23:02 UTC, conditional on final CI passing and production remaining paused. No production flags, schema, credentials, or customer data were changed. Real-submit authorization remains absent. No production environment files were copied to this checkout.

## Integration route and exact files

Latest remote read: main 899a168f8fc367755a86f77dfe7c4df792e854fe; PR113 remains open on dba37d113c0b7d827c4a63684fc1ba54fddd6709. Proposed route: coordinate with PR113 owner, integrate its changes once, then the local repair delta; recheck main and rerun CI on that exact integration SHA. The commit containing this document identifies the final repair delta.

Production code: src/lib/application-worker.ts, src/lib/portal-adapters/recruitee.ts.
Tests: scripts/fake-recruitee-server.ts, scripts/test-ats-test-capability.ts, scripts/test-ats-test-e2e-postgres.ts, scripts/test-application-release-budget.ts, scripts/test-card-onboarding.tsx, scripts/test-held-application-release.ts.
Documentation: docs/ats-repair-local.md.

Commands use PostgreSQL URLs restricted to 127.0.0.1:55459 with per-script fixture database names; build uses DATABASE_URL/DIRECT_URL for lavorai_build_test and a dummy AUTH_SECRET. Typecheck command: node node_modules/typescript/bin/tsc --noEmit --incremental false. Local runtime: Node25.2.1/PostgreSQL16; Linux/Node20 CI still requires an authorized integration run.
