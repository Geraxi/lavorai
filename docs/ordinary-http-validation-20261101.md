# Local ordinary sending validation — 1 November 2026

No production mutation, external ATS submission, customer data, Gmail access, mail delivery, paid model or deployment. The owner requested an alternative to another live test posting.

## Additional coverage

`scripts/test-ordinary-http-postgres.ts` boots the actual compiled Next.js app on 127.0.0.1:3089 in production mode, an empty disposable PostgreSQL database and the existing local HTTPS Recruitee fixture. The API uses real Auth.js session verification with locally signed synthetic sessions; password/OAuth login is not part of this test. Unauthenticated application access is rejected.

Actual apply/approval HTTP handlers write the database. The actual automatic producer creates auto/hybrid applications, actual atomic claims and ordinary worker process them, actual documents are generated, and the actual adapter sends to the local HTTPS fixture. Only the AI and email-provider boundaries are fakes. There is no diagnostic submit token or eligibility bypass. The existing test fetch rewrite refuses installation in production; the production-mode Next process has a temporary loopback-only network guard. No production endpoint is changed to trust localhost.

| Case | Result |
|---|---|
| Manual selected apply | HTTP create → DB queue → claim → worker/adapter → one POST → HTTP201 receipt → owner applications API and rendered page |
| Hybrid | Actual producer waits for consent; no send before approval; HTTP approval queues once; one POST and receipt |
| Automatic | Actual single-user producer with existing readiness/preferences → queue/claim → one POST and receipt |
| Duplicate click / repeat worker / repeat consent | No duplicate application or POST; repeated consent queues zero |
| Missing privacy consent | HTTP refusal; zero application rows and POSTs |
| Paused session | Apply waits; approval returns session_inactive and explicit recovery path; zero POSTs |
| Form changed to required questions | No invented answer; NOT_SUBMITTED / needs_user, zero POSTs |
| Definitive structured422 | One POST; REJECTED_NOT_SENT / failed; no replay |
| Transport timeout | One POST; UNCONFIRMED / needs_user; no replay |
| Invalid receipt / response after lease expiry | One POST each, no success/proof; explicit unconfirmed state after local repair; no replay |
| Concurrent claim / stale owner | Exactly one claim wins; original worker cannot quarantine a replacement lease |
| Signed inbound reply | Actual HTTP webhook on the same successful application; exact alias association; one visible reply despite duplicate event; unsigned and cross-owner requests rejected |
| Rendered UI | Isolated installed Chrome renders the synthetic accepted application and its inbox reply; screenshots saved |

The end-to-end run has 7 synthetic ATS POSTs: 3 normal accepted results, 2 deliberately invalid/uncommittable results, one422 and one timeout. Exactly3 durable successes/receipts and1 correlated reply are expected. All retry assertions preserve the original POST count. Transactional notification calls are captured by a fake SDK (3); scheduled notifications and inbound forwarding remain held. The real outbound reply composer correctly refuses operation without provider credentials. This is not a test of actual email delivery.

## Reproduced defect and local fix

The expanded test showed that `completeApplicationSubmission=false` silently returned after a provider response: an invalid receipt or expired lease could leave `applying/SUBMISSION_STARTED` indefinitely. Historical in-flight recovery is disabled, so this is not automatically resolved by a normal retry.

`holdUncommittedSubmission` now atomically marks that same original attempt `ready_to_apply / UNCONFIRMED / needs_user`. It checks exact startedAt and lease token under the existing application lock, refuses a newer owner or recorded success, and preserves reservations, submit evidence and lease identity. It does not accept the invalid receipt, renew/release the claim, refund quota, submit again or allow any retry. The worker calls it only when confirmed-response completion cannot commit.

Files changed locally: `src/lib/application-worker-gates.ts`, `src/lib/application-worker.ts`, the new HTTP regression script and this report. No commit/push/release.

## Verification and boundaries

Full Webpack build and TypeScript passed. Existing worker-gates, ATS-submit, application-mailbox (including ambiguous same-title matching), application-lease and real PostgreSQL ordinary-worker suites supplement this new fused HTTP run. Completed/cancelled/full-session replacement, crash recovery and same-tenant receipt constraints retain their prior tests; an OS-killed worker was not newly injected here. The new late-response test expires the lease at the actual adapter response boundary.

Screenshots: `output/playwright/ordinary-http-applications.png` and `output/playwright/ordinary-http-inbox.png`.

This validates the local application pipeline, not every employer's current form, CAPTCHA requirements, real credentials, cloud scheduling or network behavior. AI tailoring is deterministic/fake for this test. Browser automation/provider rollout settings are unchanged. Personal Gmail is absent throughout the successful alias-reply path.

Re-run against an empty dedicated local database only:

```sh
ORDINARY_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55439/lavorai_ordinary_http_test node --import tsx scripts/test-ordinary-http-postgres.ts
```

The test refuses a non-loopback/non-test target or nonempty schema. It expects an existing production build and installed Chrome; it downloads neither. Test services are closed in finally. Database lifecycle is explicit and separate.
