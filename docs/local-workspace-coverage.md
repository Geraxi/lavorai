# Local prototype hardening matrix

This matrix covers synthetic fixtures only. No external platform test or production release.

| Area | Evidence / expected result |
|---|---|
| Agent-led preparation / chat | agent-led and routine UI suites: known fields filled, missing answer resolved without takeover |
| Documents | documents + document UI suites: exact-role approved same-owner CV/letter, ambiguity/chat, absent letter, exact bytes/name/MIME and multipart receipt hashes |
| Wrong person / wrong kind / wrong role | documents suite rejects before upload |
| Typed facts / contradictions | number/date/text/radio/skill-checkbox/select; explicit sources; conflicts stop before POST and explicit reviewed restoration works |
| Required fields / formats | missing file/date, invalid numeric range and contact mismatches blocked; HTML form validity rechecked |
| Unsupported question | pending unsupported schema blocks submit; no inferred consent or sensitive answers |
| Manual interaction | explicit synthetic reason; checkbox verified before return; routine flow does not require takeover |
| Ownership / concurrency | owner checks, stale revision rejection, busy lock, duplicate create/submit, serialized input and generation invalidation |
| Browser input | scaled image pointer, keyboard/backspace/select, mobile input controls; file chooser and submit remain separately gated |
| Expiry / disconnect / restart | timer closes browser, disconnected terminal state, unknown after submission marker; restarted engine refuses old IDs |
| UI recovery | same-session reload via sessionStorage ID only; GET failure visible; missing session never silently recreated; explicit close/new scenario |
| Submission truth | accepted only after fixture201 and exact receipt; fixture422 is rejected, unknown never automatically retried |
| Isolation | loopback/development/flag/origin API guards; per-owner Chromium context; fixture interception rejects external request; no production credentials/data |

## Remaining limits

No Obscura runtime, model reasoning, live video, persistent sessions, production authentication, VM isolation, arbitrary external navigation, universal form support or real PDF/DOCX validation. Browser snapshots are refreshed images. Documents are synthetic text files. Restart intentionally loses in-memory state and cannot resume an application; this is not a production durability guarantee. A user can create a new explicitly synthetic demo after closure; this is not permission to retry a real uncertain application.

## Hardening fixes verified

- Contacts are rechecked against the synthetic owner before any POST; invalid dates/numbers and conflicting saved facts fail before sending.
- Browser disconnect has an explicit terminal state; old session IDs are rejected by a restarted engine.
- Rejected uploads remain definitive rejection rather than being mislabeled uncertain on close/expiry.
- Browser edits to the missing arrangement synchronize the pending chat question.
- UI reload restores the same session ID (no automatic create); failed reads surface visible errors, without retrying writes.
- Queued human inputs are invalidated on control actions; stale server revisions still reject writes.
- Home/End text-caret semantics normalized across macOS and fixture Chromium.
- Closed/expired sessions provide an explicit new-scenario action. Unknown outcomes do not offer an automatic retry.

Tests: `test-local-workspace.ts`, `test-local-workspace-agent-led.ts`, `test-local-workspace-documents.ts`, `test-local-workspace-input.ts`, `test-local-workspace-hardening.ts`, `test-local-workspace-gates.ts`, and actual browser `test-local-workspace-ui.mjs`, `test-local-workspace-document-ui.mjs`, `test-local-workspace-recovery-ui.mjs`. TypeScript and full Next webpack build are required for the final local tree.
