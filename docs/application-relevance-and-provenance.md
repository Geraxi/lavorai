# Application relevance and recipient verification

## Current behavior

- Queue admission, the pre-transmission guard, and the final portal-submit guard read current account, consent, round, job and user-preference data.
- Automatic applications recheck role intent from current preferences or their active assigned round, location, employment type, known salary range and the user's unchanged match threshold. Desired roles are search intent; they are no longer invented CV experiences for scoring.
- Explicit single-job consent can override search preferences in manual/hybrid/auto mode. Off mode, excluded companies, closed jobs, billing, privacy, duplicate and round safeguards still apply.
- The self-heal sweep never lowers a user's match threshold. The existing report field remains for compatibility.
- A remote flag never makes a geographically restricted posting eligible everywhere. Missing geography and unqualified remote geography require review. Remote (EU) and Remote (IT) retain their region. Company-office lists and global-culture boilerplate do not establish the job's location. Preferences are not evidence of residence, citizenship or work authorization.

## Liveness

`checkJobUrlLiveness` returns `live`, `closed` or `unknown`, plus a checked time and reason. Only conclusive removal evidence can close a shared job. HTTP 403/429/5xx, timeouts, challenges, generic career pages, unexpected redirects, empty SPA shells and malformed API results are unknown. Unknown cannot automatically transmit an application.

Supported ATS API results must have valid posting identity/shape. Fallback HTML needs a posting heading or structured job plus application context. The worker checks before document-generation cost and again before submission. A final-submit stop after uploads preserves uncertainty instead of permitting replay.

## Recruiter-email provenance

A fresh successful fetch of the selected employer posting is mandatory for every email attempt. Cached addresses and DNS records never authorize sending. No AI generates recipient candidates.

A recipient must appear literally in visible application instructions, pass the existing placeholder/privacy/accessibility blocklists, match the named employer's source and email-domain identity, and have a mail-capable domain. Scripts, footer contacts, unrelated employee mentions, unrelated email domains and cross-host redirects fail closed.

Source attribution uses the pinned `tldts` Public Suffix List, including private suffixes. Employer sources must have the exact normalized employer name in the registrable-domain label, and the recipient must have that same registrable domain. `careers.acme.co.uk` can therefore cite `jobs@acme.co.uk`; `acme.unrelated.com`, another private-hosting tenant, and a same-brand address on another TLD cannot establish affiliation. Approved ATS sources must match a provider-specific host and posting layout with the employer in its designated tenant position, plus a literal instruction to an employer-matching registrable email domain. Words in arbitrary host labels or path segments do not qualify.

Only standard-port HTTPS sources without URL credentials pass. ICANN/private suffixes must be recognized; malformed, IP, special-use and unknown-suffix hosts fail closed. IDNA domains are compared with Unicode-preserving identities, without transliteration or visual-confusable folding. The existing ASCII email extraction supports punycode domain labels; unsupported Unicode mailbox/domain spellings are rejected as whole tokens rather than truncated into another recipient.

Legitimate cases that intentionally require review include employer aliases, abbreviations and transliterated brands; affiliates or external recruiters on a different registrable domain; same-name domains on different TLDs; unrecognized ATS hosts/layouts or encoded tenant slugs; HTTP-only and nonstandard-port postings; unknown suffixes and Unicode email spellings. There is no inferred or invented affiliation map. Exact name/tenant matches plus visible instructions are source evidence, not proof of legal ownership, ATS tenant registration rights or immunity from same-name impersonation.

The immutable send-attempt snapshot stores the address and versioned provenance: requested/final source URLs, observed time, source excerpt, page SHA-256, employer and extraction method. Unknown employer-brand/domain mappings require review; this intentionally favors avoiding misdelivery over maximizing automatic throughput. It is source evidence, not a claim of cryptographic domain ownership or guaranteed human receipt.

## Completion proof

A portal success requires a versioned provider-specific receipt with the same job identity and a capture time belonging to this worker attempt. Raw `DETECTED_*` labels cannot count success. HTTP receipts require a known application-write operation, 2xx response and explicit acceptance signal; DOM receipts require a new visible receipt with the application form removed.

Email completion requires a persisted attempt with the same application/worker key, provider email ID and API acceptance time. API acceptance remains distinct from delivery and a human reply. A submission already in flight is never automatically replayed merely because the job, preferences or billing changed afterward.

## Verification

All new network tests use mocked HTML/API/DNS; no employer or provider is contacted. The isolated PostgreSQL suite uses only a fresh localhost database. Cases cover changed preferences before send, final-submit pause, 21 concurrent requests for three remaining round slots, stale owners, unknown delivery, wrong/missing receipts, and accepted-email-attempt gating.
