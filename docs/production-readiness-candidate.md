# Local production-readiness candidate (not activated)

Base: 6b05f0b78dc4b159136e52724ddb4d924c7cfef6. No new migration.
Production remains paused; this branch is not publication or sending authorization.

## Repair scope

- Single/batch explicit apply use the existing free-weekly policy instead of rejecting expired Free accounts through the old zero monthly limit. Paused subscriptions stay blocked. Admission/claim/submission retain transactional quota and duplicate gates; creation responses are snapshots, not reserved sends.
- Recruitee ambiguous boolean answers become user questions, never implicit No/Yes.
- Incomplete employment history cannot prove a negative, generic remote/hybrid preference cannot answer an employer-specific willingness declaration, and LavorAI privacy consent cannot accept employer terms. Exact explicit answers retain the existing consent/resume path.
- Optional APPLICATION_PROVIDER_POLICY=recruitee_only plus an exact UTC APPLICATION_PROVIDER_NOT_BEFORE cutoff fences old rows and other origins before worker preparation, then fences non-Recruitee channels at both submission boundaries. Single/batch apply and auto producers exclude unsupported offers; recruiter-email fallback and direct mailbox sending are blocked too. Malformed restriction fails closed. An absent setting preserves existing behavior; release must not unpause without configuring the restriction.
- Unsupported offers return a truthful direct-application message. Missing questions stay needs_answers; unsupported required uploads need user completion on the employer site. Neither is sent/success.

## Supported versus not proven

Recruitee provider-owned HTTPS offers have an earlier owner-approved ordinary-flow acceptance and local fake-provider regression coverage. This does not prove every employer questionnaire or CV is answerable. Browser ATS providers/custom domains and Gmail employer sending are excluded from the proposed first release. Personal Gmail import still needs owner OAuth verification/reconnection; it is independent of Recruitee candidate submission and LavorAI inbound receiving.

## Proposed release sequence — separate approvals required

1. Review local changes, commit/push and exact-head Linux CI; deploy with APPLICATIONS_PAUSED=true, USER_NOTIFICATIONS_HOLD=true, ATS_TEST_REAL_SUBMIT=false, and no diagnostic/cohort exception.
2. Verify deployed SHA, schema and health. Retain those holds until a separately approved supported-service activation.
3. For that activation, set the provider restriction and a fresh UTC cutoff, and align APPLICATION_ROLLOUT_START_AT with it. Existing history remains excluded; no row resets. Retain notifications hold and diagnostic false. Review configured daily cap and monitoring before clearing the applications hold. This activates genuine user-selected/new auto-matched work, not a fabricated admin fixture; ordinary consent, preferences and eligibility remain required.
4. Observe provider acceptance/receipt separately from delivery/replies; stop on unexpected channel, duplicate, uncertain result or quota anomaly. Restore APPLICATIONS_PAUSED=true to stop new admissions; in-flight external requests cannot be recalled. Never retry an uncertain submission.

No automatic activation, customer contact, OAuth changes, or Railway changes are included.
