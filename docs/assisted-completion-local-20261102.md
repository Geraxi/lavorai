# Assisted employer-site completion — local candidate

## Scope

Default off: `ASSISTED_OPPORTUNITIES_REVIEW=true` is required for `/jobs/review`, its job-specific preparation workspace, and `/api/assisted-applications`. No migration, provider activation, discovery activation, external candidate POST or email is included. No commit/publication/release has been performed.

The separate review list includes only fresh question-bearing Recruitee jobs passing role, location, employment and avoided-company checks. It is not the automatic catalogue. Automatic matching thresholds remain unchanged. Review eligibility does not prove qualifications or work authorization.

Authenticated candidates select their own existing CV, answer the fetched current form questions, write an optional/required cover letter, save and review, and explicitly approve employer-site completion. Original CV bytes are downloaded; letters are candidate-authored text files, not fabricated or automatically tailored documents. Candidate must transfer files and answers manually and complete employer consent/challenges. Unknown required widgets block approval visibly. A refresh replaces the form snapshot and clears answers for fresh review.

Preparation creates one `assisted_draft` Application under the existing per-user lock, never queues it. Existing user/job applications prevent duplicates. Approving rechecks consent, account/mode, eligibility, publication/form identity, selected document, sibling rows, cutoff, quotas and review digest. A shared immutable UTC-day budget reservation is taken atomically with handoff (conservative: cancellation does not refund it). `assisted_unconfirmed` consumes the daily quota using approval time, even for a draft created on a prior day. Ordinary workers do not claim these statuses. Initial approval requires paid/trial access; no entitlement changes are made.

An external page opening or candidate report never sets `submittedAt`, `submittedVia`, `submissionReceiptJson`, or success. The candidate report remains unconfirmed. Cancellation after handoff remains unconfirmed because an external send cannot be ruled out. There is no replay button. Evidence cannot be promoted by arbitrary email or candidate assertion. Existing independently verified receipt handling is unchanged; this feature itself does not acquire employer receipts.

Global limits bound LavorAI-issued handoffs/reservations, not actions the candidate independently takes on an external website, including a later day. No claim of control over the employer's browser or of automatic field/file transfer is made.

## Verification

- `scripts/test-assisted-packet.ts`: required/malformed answers, unsupported questions, changed snapshots/review digests, explicit negative answers, duplicate approval, cancellation/report states, URL restrictions, bounded read-only provider fetch, and truthful delivery labels.
- `scripts/test-assisted-opportunity.ts`: fresh/closed/unknown/unsupported/provider/role/location/avoid-company gates; automatic catalogue still rejects question forms.
- `scripts/test-assisted-route-postgres.ts`: real route handlers + disposable PostgreSQL; identity, storage and provider GET boundary mocked. Same-origin rejection, valid foreign-owner isolation, consent withdrawal, repeated preparation, concurrent approval, exact owned CV bytes, approval-day quota accounting, immutable reservation and unconfirmed report. Actual React workspace driven in installed Chrome through loopback HTTP to those handlers and database. Prepare → answer → save → approve → reload → report. All external browser requests blocked. No personal browser profile used.
- Synthetic browser screenshot: `output/playwright/assisted-unconfirmed.png` (isolated harness, not production visual shell).
- Existing daily/free-quota and ATS reliability tests pass.
- TypeScript and full `next build --webpack` pass. Default Turbopack build cannot resolve this worktree's node_modules symlink outside its root; no dependencies installed or source configuration weakened.

No employer POST, customer email or production database mutation was used. No model call, paid service or new package was added.

## Coverage and release decisions

Read-only coverage at 2026-11-02 13:27 UTC: 183 existing fresh question-bearing jobs provide zero relevant review opportunities to the current ready paid/trial cohort (one auto, two hybrid). Public GTO Graphic Designer remains a potential 70/50 match for one hybrid candidate, but is not in this approved catalogue. It requires separately reviewed tenant/job inclusion, refreshed form evidence and candidate-provided answers. This feature alone does not fix inventory shortage or benefit all paid users.

Approval needed to publish exact patch and run CI, then separately deploy/enable this review feature and any explicitly selected new catalogue source. Candidate outreach is still unapproved. Existing automatic sending provider policy, five-attempt limit, thresholds, notification behavior and experimental browser settings must remain unchanged.
