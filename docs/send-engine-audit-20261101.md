# Sending engine audit — local repair, 1 November 2026

Base: deployed f696d39. No production writes, worker dispatches, real applications, mail or candidate uploads.

## Production evidence (17:41 UTC)
Ordinary applications created since 28 October: one success/submitted/HTTP201 with receipt; one needs_user/needs_user with no privacy consent, no application consent and no submission start. Latest natural Vercel drain at17:40 claimed/attempted/accepted/failed zero. Empty drains prove execution health, not successful sending. Personal Gmail is optional; exact LavorAI reply aliases are tested independently.

## Reproduced local defects and repairs
- Active session carrying completedAt was not blocked at the worker gate. Select/check the terminal marker before preparation.
- Structured HTTP422 validation refusal was incorrectly unconfirmed. Classify only explicit nonempty errors with422 as validation_failed. Transport/5xx/unknown remain uncertain; all tests retain no automatic repeat.
- Same-slug receipt from another Recruitee tenant could pass request correlation. Require same origin at proof and locked completion; restrict parsed Recruitee HTTP receipts to provider domains. No observed wrong-employer production submission is alleged.
- Equal-score same-title inbound applications were resolved by recency. Leave ties unassigned; require company evidence before ATS-domain bonuses. Exact application alias still wins. No observed production misattachment is alleged.
- Privacy-held application drawer had generic incomplete guidance. Add fixed Settings link and translated no-send explanation; no consent or retry side effect.

## Verification matrix
| Boundary | Result / limits |
|---|---|
| Auto/manual/hybrid creation and consent | Actual route/producer source executed hermetically; DB/queue boundaries mocked. Includes paused/full/closed refusal. Not one fused HTTP-to-provider test. |
| Approved manual/hybrid and automatic worker | Real PostgreSQL transactions, gate/lease, preparation and real adapter with local fake Recruitee; each accepted path one POST, persisted HTTP201 receipt and no replay. Fake AI/documents only. |
| Refusal vs uncertainty | Actual fake server422 and disconnected transport, plus500: no success receipt, distinct REJECTED_NOT_SENT/UNCONFIRMED, no automatic repeat. |
| Session recovery | Actual PostgreSQL owner-only replacement/concurrent clicks, history preserved, no consent/enqueue; paused/completed/cancelled/full/terminal-marker worker refusals. |
| Quota, duplicate, concurrent claim | Existing actual PostgreSQL ordinary suite; one claim, free-quota race, cohort budget constraints and uncertainty fences. |
| Reply correlation | Real PostgreSQL + signed synthetic inbound route: dedup, receipts/OTP not human replies, no inbound promotion to submitted; pure regressions for ambiguous same-title/default-domain matching. |
| Receipt employer attribution | Wrong-tenant/same-slug proof regression plus same-origin completion guard. Live employer behavior not exercised. |
| Expired lease / late receipt | Existing lease/reconciliation regressions preserve fencing. No claim that arbitrary late receipts are automatically recovered. |
| Live form/challenge compatibility | NOT VERIFIED by local fixtures. Empty screening questions are not evidence that CAPTCHA is absent or that unattended submission is supported. PR134 remains unreleased. |

Commands: test:manual-rollout, test:ordinary-pipeline-postgres, test:send-reply, test:send-reply-postgres, test:worker-gates, test:ats-submit, test:application-mailbox, test-session-replacement-postgres.ts, TypeScript, full Webpack build. Synthetic database migrations exercised by ordinary/reply suites. No external submission or email transmission.

## Next gate
Review/publish this local repair first; no release authority included. Complete live proof would require separately approved exactly-one application to a fresh owned Recruitee posting, synthetic profile/documents, ordinary eligible account/consent/mode/quota, verified owned reply alias and explicit challenge compatibility. Capture one POST and exact receipt; no uncertain retry. This would validate that owned configuration only, not all public employers or providers. Do not use a customer employer as a test target or bypass a challenge.
