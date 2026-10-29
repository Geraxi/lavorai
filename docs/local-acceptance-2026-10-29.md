# Local acceptance, 29 October 2026

This is a disabled local prototype, not a customer release or a claim of universal application support. No employer requests, real candidate data, paid API calls or downloads were used. Temporary Ollama and preview services were stopped after testing.

| Coverage | Execution/evidence | Result |
|---|---|---|
| Name/email/phone discovery on Lever/Greenhouse/Ashby-shaped forms with malicious page instructions | Actual Stagehand3.7.3 + installed qwen2.5:3b inference; Chromium | Final8/9 raw discoveries,3.2–5.2s. One ambiguous Lever name blocked, deterministic semantic fallback passed. Earlier runs7/9 and6/9, including54s response. Not reliable enough to replace deterministic execution. |
| Full provider-shaped forms, selects/custom combos, radio/question-scoped checkbox, CV and letter | Actual Chromium; synthetic explicit facts; intercepted multipart requests | All3 provider flows passed exact file hashes/names; marketing untouched.9 accepted/rejected/unknown scenarios passed; no uncertain retry. |
| Date/number/contact contradictions; missing answers and required/ambiguous documents | Actual local engine+Chromium, synthetic inventory | Rejected contradictions/wrong-person/wrong-role/missing files; chat resolution and exact uploads passed. Unsupported widgets remain action-needed. |
| Changed/replaced DOM, existing-value races, reactive clearing, mutable snapshot | Actual Chromium synthetic regressions | Bound-element atomic checks; result verification; copied facts. No writes to unvalidated replacement targets. |
| Takeover/return, stale control, disconnect/expiry/restart, desktop/mobile | Actual API/browser UI and engine tests | Exclusive-control and owner/origin gates; mobile recovery/no overflow; one-shot local submission. |
| Durable claim/quota/expiry/restart | Real disposable PostgreSQL, actual ordinary gates and release-budget SQL CHECK/FK constraints | One claim, one submit right, budget/expiry rejection, restart no retry, zero provider POSTs. |
| Stalled observer deadline | Controlled never-resolving promise regression |15s local observer default, tested with short synthetic deadline; observer disabled after timeout. Underlying inference may continue until local service cleanup; no second observer call is allowed. |
| Build/static checks | TypeScript, Next webpack build, diff check | Passed; final rerun recorded separately in local build log. |

Independent read-only review found and prompted fixes for mismatched DB-client configuration, DOM check/write race, false filled status, and same-owner record substitution. Follow-up confirmed those fixes. Contact execution must remain under coordinator busy/revision control; a standalone check is not distributed locking.

## Reviewable diff

- Isolated pinned Stagehand package/lock, local-only observe bridge and hard deadline; no act/agent/submission exposure.
- Semantic deterministic contact observer, immutable approved facts, bound-element writes and result checks.
- Owner/exact-record/selected-hash PDF snapshot loader, fenced by live application lease.
- Local-only durable interface using existing ordinary reserve/begin/recheck gates and atomic submit-click marker; client constructed from validated local DB URL.
- Synthetic Chromium, local-model, ownership, deadline, UI and PostgreSQL tests plus evidence.

## Remaining production blockers

No production browser-worker deployment, durable browser session hosting, remote takeover transport, supported-provider registration or live employer compatibility has been validated. Profile/document readers now use actual Prisma ownership queries and the existing storage reader, tested only with synthetic records; no production export is activated. Completion must retain existing validated receipt handling. A production model needs explicit resource/isolation/retention choices; the current free local model is variable and is advisory only. No production scope/provider/cap changes or deployment are included. This document records local evidence before draft publication.
