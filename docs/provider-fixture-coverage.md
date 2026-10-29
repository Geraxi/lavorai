# Provider-pattern local compatibility tests

Source: read-only public-form inspection recorded in external-form-inspection-2026-10-28.md. These are sanitized independently authored HTML fixtures, not copied employer pages or functioning live integrations.

Implementation: `src/lib/local-workspace/provider-fixtures.ts`; runner: `scripts/test-provider-compatibility-fixtures.ts`. Standalone local test adapter rejects every origin/path except https://compatibility.invalid/{lever,greenhouse,ashby}; Playwright intercepts all traffic. It is not enabled in production or wired as an external browser session in the preview.

| Pattern | Tested locally |
|---|---|
| Lever-style | Native location select, dynamic question groups, required narrative, correct CV/additional-letter field routing |
| Greenhouse-style | Readonly ARIA combobox with option selection/hidden value, ARIA-required fields without native required, file/control validation |
| Ashby-style | Separate parser/upload and submitted CV controls; parser untouched; repeated yes/no labels resolved by exact question group |
| All | Explicit synthetic eligibility/sponsorship answers; missing answers returned to caller for chat; supplied approved narrative only; marketing consent untouched |
| Documents | Exact names, MIME types, SHA256 and bytes in intercepted multipart body; wrong CV/letter swapped files blocked; optional letter separate |
| Failures | Required empty URL, bad email format, unknown widget, wrong origin, rejected422 upload, interrupted response, concurrent double-submit |
| Outcomes | One POST maximum in each scenario;201 acceptance distinct from422 rejection or unknown; no uncertain retry |

Nine real-Chromium cases: three patterns × accepted/rejected/unknown. No employer requests or candidate records. A race discovered by simultaneous-submit testing was fixed with a synchronous claim before asynchronous validation.

## Not proven
Real React component event behavior, exact live employer selectors/schema, actual PDF/DOCX parsing and file limits, CAPTCHA/authentication, server-side upload/receipt acceptance, employer application limits, and provider authorization. Representative fixtures are deliberately smaller than live pages. The missing-answer return integrates conceptually with the existing local chat flow; these new provider fixtures currently run through the test harness, not a provider picker in the UI.

Next live stage requires supported owned test postings/tenant, exact data/destination authorization and provider-specific access/constraints. Do not submit fabricated applications to the inspected employers. No automatic consent, protected-trait inference, fabricated narratives or second-engine retry after uncertainty.
