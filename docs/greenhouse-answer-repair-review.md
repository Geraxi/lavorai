# Greenhouse answer continuation repair

Candidate prepared on 2026-10-16 in the isolated `fix/greenhouse-answer-continuation` branch, based on freshly fetched `origin/main` at `09d1f7e11fee343d2be2bd65f8ed702c5e23dad1`. The source checkouts were clean and left unchanged. This candidate is local only: no push, publication, deployment, real application, email, production query or production write was performed.

## Result and evidence boundary

Greenhouse previously attached the CV before discovering unanswered questions. An old `NOT_SUBMITTED` marker therefore cannot establish that the employer received no candidate data. The repair inspects the blank public form first, using the same scanner, exact labels, control kinds and ordered options as the later filler. The inspection does not enter candidate text, autocomplete search values, choices or files. It runs in the worker's newly created, unauthenticated browser context.

Only the dedicated callback at this point can persist `greenhouse_blank_form_v1` evidence in `Application.answerContinuationJson`. The evidence binds the application, owner, internal job, destination URL, per-application consent, original attempt reservation, work token and pending-question hash. No endpoint accepts a client assertion of this proof. If persistence fails, candidate data is not entered.

Saving answers remains separate from confirming continuation. Confirmation binds the current proof, exact application/question answers, and factual sources. The existing row/advisory locks, rotated work token, ownership checks and reservation ledger protect concurrent confirmations, claims, stale workers and retries.

Before the first candidate field or file can be inserted, the worker durably records `candidateDataStartedAt` for a continuation and rechecks current eligibility, job liveness and the global budget. This permanently ends resumability. Final submission and an optional Greenhouse security-code submission each receive a separate one-use authorization. A late conditional question, upload failure, timeout or missing receipt cannot mint another safe-pause proof or reopen the attempt. A click or OTP is not success: the existing structured receipt boundary still decides whether an ATS submission is confirmed.

Duplicate checks cover the same internal job, Greenhouse board-host aliases, embedded forms, custom `gh_jid` links, duplicate imported job records, retained reservations after application deletion, and existing email attempts. These checks apply at continuation admission and delivery boundaries. Native posting paths take priority over unrelated query parameters.

The browser fixture exposed stale scanner control IDs after the new inspection pass. The scanner now removes old tags before enumerating remaining required fields, so a later question cannot target an already-filled name field.

Required employer defaults are inspected too: a preselected sponsorship choice or checked declaration is not a candidate assertion. After authorization, the filler uses the exact scoped answer or verified fact even when a control was already populated. The browser fixture verifies preselected sponsorship and consent are asked, and the candidate's opposite sponsorship answer replaces the default.

## Factual answers and consent

- Previous employer mapping now recognizes an explicitly elapsed ISO year/month/day in the CV, including an ended job earlier in the current year. A current-year-only value, current month/day, invalid date, ambiguous slash date or empty date does not establish ended employment.
- Residence-country aliases and unambiguous IT/ITA, GB/GBR and US/USA option equivalents reuse explicit residence facts. No national phone prefix, conflicting city, completed qualification, work authorization, sponsorship, public-official declaration, employer affiliation, work-location choice or WhatsApp consent is inferred. Generated and assumed answer history remains excluded.
- The signed-in app visibly links a missing privacy-consent blocker to `/settings#privacy-consent`. Settings contains the actual unchecked control and a `/privacy` link. Only an explicit authenticated same-origin POST can record the user's own consent; duplicate requests preserve its original timestamp. The route never writes per-application consent or queues applications. Previously consented queued work remains subject to every existing gate.
- Questions show missing-consent guidance and a review link for old or uncertain attempts. Saving answers does not silently queue those records.

## Files

| Area | Files |
| --- | --- |
| Blank-form inspection and scoped fill | `src/lib/portal-adapters/greenhouse.ts`, `ai-answer.ts`, `types.ts` |
| Durable proof, one-use boundaries, duplicate protection | `src/lib/application-answer-continuation.ts`, `application-worker-gates.ts`, `application-worker.ts` |
| Factual mapping | `src/lib/candidate-facts.ts` |
| Candidate guidance | `src/app/api/questions/route.ts`, `src/lib/application-continuation-guidance.ts`, `src/app/(app)/questions/questions-view.tsx`, `questions.css` |
| Explicit privacy UI/API | `src/components/privacy-consent-form.tsx`, `src/app/api/account/privacy-consent/route.ts`, Settings, app layout and `src/lib/user-selects.ts` |
| Verification | `scripts/test-greenhouse-preflight-browser.ts`, `test-privacy-consent.ts`, extended continuation, worker, fact, question, receipt, schema and UI suites; `package.json` test commands |
| Build prerequisite | One-line removal of the optional whole props argument in `src/app/(app)/discover/page.tsx`; the existing `main` signature failed Next.js generated `PageProps` validation. No behavior change. |

## Verification

All databases were temporary localhost PostgreSQL instances, populated with synthetic fixtures. Those suites override both `DATABASE_URL` and `DIRECT_URL`. Browser fixtures intercept external traffic and use disposable Chrome profiles. The Greenhouse browser fixture also rejects Node provider fetches. No real employer route, mailbox or production credentials were used.

Passed:

- `npm test`: full existing suite plus privacy API tests, including mandatory card, billing, manual-only producers, receipts, delivery/reply distinctions and account/CSRF/ownership checks.
- `npm run test:answers` and `npm run test:worker-gates`: deterministic provenance, current-year end-date boundaries, conflicts, forbidden inference, exact question scope, legacy holds and canonical destinations.
- `npm run test:answer-continuation-postgres`: both Recruitee and Greenhouse variants; real Questions API → durable queue → claim → worker wrapper; concurrent confirmations and claims; one data/final/verification authorization; no receipt means no success; concurrent receipt completion records success once; stale tokens, changed questions/facts, foreign owners, missing proof, historical/uncertain rows, billing/consent/job gates, email attempts and canonical/retained duplicates.
- `scripts/test-manual-submission-budget-postgres.ts`: global ten slots across users/channels, original reservation retention, rollback and restart boundaries, UTC rollover, and no refunds for uncertain/no-send/deleted attempts.
- `npm run test:greenhouse-preflight-browser`: actual Greenhouse adapter and scanner; blank pause and denied gate cause zero candidate edits/uploads/autosave; exact scoped answer resumes after the boundary; post-upload questions receive no proof.
- `npm run test:answers-browser`: delayed options, stale unrelated choices, an unapplied candidate answer cannot hide behind an employer default, phone-prefix ambiguity and residence separation.
- `node scripts/test-scoped-question-ui.mjs`: actual Questions and consent components at 1440px and 360px; distinct employer declarations, save versus confirm, stale-save errors, unsaved-edit guard, explicit unchecked privacy control, failed-save feedback, correct policy/consent/review links, no horizontal overflow or browser errors. Screenshots were inspected and the new guidance links were adjusted to wrap below their text on mobile.
- TypeScript `--noEmit --incremental false`, `git diff --check`, and production `npm run build -- --webpack`. The initial sandboxed Turbopack compile stalled and was stopped. A later verification run exhausted local disk space; only this checkout's generated webpack cache was removed. The final build exited 0 with compilation, generated route checks and all 155 static pages complete; nonfatal cache-write warnings remained in its log. The build used an intentionally unavailable localhost database: expected prerender fallback warnings appeared, with no production access.
- `npm run lint` exits successfully; this repository's lint script explicitly delegates its CI gate to TypeScript and does not run ESLint.

Local PostgreSQL reproduction:

```sh
WORKER_TEST_EMBEDDED_POSTGRES=/tmp/lavorai-answer-test-runtime/node_modules/embedded-postgres/dist/index.js npm run test:answer-continuation-postgres
WORKER_TEST_EMBEDDED_POSTGRES=/tmp/lavorai-answer-test-runtime/node_modules/embedded-postgres/dist/index.js node --import tsx scripts/test-manual-submission-budget-postgres.ts
```

The temporary test runtime is outside repository dependencies. No lockfile or production dependency change is needed. Screenshots are under `output/playwright/question-continuation/` and remain uncommitted.

## Preserved controls and limits

No schema migration is required. The existing nullable continuation field and existing privacy timestamp are reused. No historical evidence, reservation or consent is backfilled. There is no migration command to run against Frankfurt or the stale US direct endpoint.

`manual_only`, the global maximum of ten attempt reservations per UTC day, cutoff `2026-10-14T11:47:00.000Z`, disabled automatic producers, fresh per-application consent, mandatory card and billing checks remain unchanged. Web and worker should eventually be released together from the reviewed candidate; that release is outside this task.

The supplied audit's Doctolib `cmv8b08nh0005jk06uo5fer1v` and Stripe `cmv8b0b79000bjk06bhb52nyz` lack safe-pause evidence and remain held. The new code cannot retroactively establish that no upload/autosave occurred. Their saved scoped answers are preserved, with actionable review guidance. PostHog `cmv8b08h00001jk065gkw0frf` remains uncertain and must not be retried. Unknown liveness and closed jobs remain blocked. Privacy consent must be chosen by each affected candidate.

Preflight covers controls visible in the blank form. Conditional controls appearing after candidate data, unsupported dynamic choices, captcha and unverifiable liveness can still require manual review. Such cases remain held; this repair does not promise universal ATS automation.

## Smallest next action for real delivery proof

After a separately authorized review/release of the web and worker candidate, use one genuinely new, still-open Greenhouse application with no earlier application or retained reservation for that destination, valid account/privacy/billing state and fresh candidate application consent. Have the candidate answer any missing scoped questions and explicitly confirm continuation. Only then, under the unchanged remaining daily budget and separate live-send authorization, observe that single attempt's durable ATS receipt. Do not replay the historical Doctolib, Stripe or PostHog records to obtain proof.

This task produces no new live delivery proof. For any later email route, provider acceptance and delivery events must remain separate. For ATS routes, record an actual verified ATS receipt; a subsequent recruiter reply is another independent observation. The supplied Resend 104/100 reading is a quota risk, not the established cause of the answer-continuation failure.
