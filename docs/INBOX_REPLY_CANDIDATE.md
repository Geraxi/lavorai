# Inbox reference redesign and deliberate email replies

Candidate branch: `fix/inbox-conversation-replies`.
Base: `005c0a57d058af07b17c4459f9b1389e002a9695` (unpublished user-section visual correction).
Local checkout: `/Users/umbertogeraci/Documents/Codex/2026-10-15/task-8/lavorai-inbox`.
No push, deployment, production database writes, credential changes or real email sends were performed.

## Visual direction

Primary user target: `libfile_93c2210dabe881918422644f3e2b9c55`, visually inspected. Earlier image `libfile_252426df23c08191a36b4f25c41fe627` is the broken current state.

The revised Inbox follows the target's three panes: compact searchable/filterable message list; conversation bubbles with a pinned composer; application context. Existing LavorAI sidebar and Italian/English remain. Folder tabs give access to incoming, sent/attempted, saved drafts and all saved mail. There are no native select dropdowns in Inbox. Lists paginate at 20 messages; conversations paginate older messages 20 at a time and scroll internally. Mobile switches between list and reader with a back button. Gmail sync remains available on mobile.

Functional differences from the aspirational target are deliberate: no invented AI briefing, calendar appointment, match score, attachment, AI coach response or saved notes. Salary/location/remote fields come from the stored job and say when data is missing. The sidebar has been preserved rather than replacing app navigation.

## Architecture and implemented flow

Existing `ApplicationReply` captures Resend inbound per-application aliases. The old UI was read-only. The Gmail connection requests `gmail.readonly`; no in-app Gmail sending permission exists.

New `/api/inbox/replies`:
- GET resolves the reply recipient for one authenticated, owned, non-security-code, direct application message. Legacy messages retrieve metadata from the authenticated Resend Receiving API and verify exact application alias + original sender before persisting validated fields. Raw headers never reach the browser.
- POST saves a bounded plain-text draft or deliberately sends it. Unknown payload fields, including recipient/subject overrides, are rejected. The server fixes recipient from validated Reply-To/From, sets the application reply alias, and retains RFC `In-Reply-To` and bounded `References`.
- DELETE discards only an owned unsent draft.

Auth uses the real session (no development demo fallback). Billing/card/account gates apply to API use. Mutations require exact same-origin CSRF checks. Drafts are capped at 20 and sending at 10 attempts/hour/owner, with serializable DB checks. Accepted replies are recorded once in the existing platform email-quota ledger; ambiguous attempts also reserve capacity. Sending honors `APPLICATIONS_PAUSED` and uses local daily/monthly quota reservation checks; provider quota errors remain authoritative. Application submission workers, billing rules, manual_only/cap10/cutoff controls are unchanged.

`InboxReply` stores immutable send snapshots and one client UUID/provider idempotency key. Concurrent clicks are leased; uncertain retries reuse the original payload and key for at most 23 hours. There is no cron or auto-send. API acceptance is `accepted` (displayed as delivery pending). Signed webhook events supply delivered/delayed/bounced/failed/complained states, including event-before-acceptance races. Recipient + signed reply tag must match to recover a missing provider ID. Draft text remains after quota/rejection/network failure. Unknown outcomes cannot be edited and resent under the same identity. New attempts after a known provider rejection require another deliberate action.

Inbound bodies render as escaped plain text, never HTML. No tracking images, external links, scripts or email-driven actions run. Saved reply parents are included when they fall outside the recent source window. Sent and draft history currently loads the most recent 200 replies; incoming loads 200 per source plus those saved parent messages, all paginated in the UI.

## Migration and release prerequisites

Additive migration: `prisma/migrations/20261015220000_inbox_user_replies/migration.sql`.
It adds four metadata fields to `ApplicationReply` and creates `InboxReply` with FK cascades and indexes. It does not send/backfill historical email, alter statuses, change consent, or reset budget history. Existing inbound rows default to `directRecipient=false` until provider metadata is verified on an owned reply-context lookup.

Apply this migration before serving this candidate. Repository migration history has no complete baseline; follow `prisma/migrations/README.md`, review the existing schema/history and establish the correct baseline first. Do not reset a populated DB.

The specified intended runtime is Neon project `curly-silence-16024948`, branch `br-aged-band-al1r48g9`, database `neondb`, Frankfurt. Do not use the stale old-US `DIRECT_URL`. Verify the actual runtime DATABASE_URL and use its correctly matched migration target; no runtime DB or credentials were inspected or changed in this task.

Existing required configuration: valid Resend sending credentials and verified From domain, `INBOUND_EMAIL_DOMAIN`, receiving access for legacy metadata resolution, and signed delivery/receiving webhook configuration. Missing credentials, missing thread metadata, unverified routing and paused sends produce visible blockers instead of pretending to send. No live credentials/capacity were verified. The previously reported 101/100 Resend daily quota was not tested with an email. Sending may remain unavailable until capacity resets or the account is changed by its owner.

Gmail replies still require opening the original in Gmail. Supporting them directly would require a separately approved OAuth scope/reauthorization and Gmail send implementation; the candidate does not broaden OAuth access.

## Validation

- Prisma schema generation and additive migration applied to the full pre-change schema in a new `/tmp` PostgreSQL cluster, localhost port 55438, database `inbox_replies_test`.
- `scripts/test-inbox-replies-postgres.ts`: real DB with mocked Resend; ownership, real API strict validation/CSRF/auth, no auto-send, exact recipient/thread headers, concurrent clicks, immutable retry payload/key, expiry, quota and pause, late/racing/out-of-order events, wrong event recipient, security codes, draft deletion and per-owner hourly rate limit. Refuses any non-local/non-fixture database URL.
- `scripts/test-inbox-replies-browser.mjs`: real components/AppShell, 56 fictional messages, 20-row pagination, 1440×900 and 1366×768 viewport bounds, mobile 390×844, search/empty/Gmail fallback, long untrusted text, blocked external requests, quota draft retention and stable request identity. No production traffic.
- `npm run test:send-reply`, `test:manual-rollout`, `test:card-onboarding`, `test:release-controls`, `test:user-workspace` pass.
- TypeScript and production build (`npm run build -- --webpack`) pass with placeholder localhost settings. Default sandboxed Turbopack build stalled at compilation and was stopped; Webpack completed. Existing next-intl cache-analysis/Node localstorage warnings are nonfatal.

Screenshots: `output/playwright/inbox/`. `inbox-review-board.png` is the reference/revised comparison plus mobile and quota evidence. This folder is local evidence, not application code. No production screenshot containing personal correspondence was captured or uploaded.

Library review board: `libfile_dc918772e09881919d077b2c4d2e7301` (`inbox-review-board.png`).

## Integration update

The parent reports canonical main is now `977c766f0f99ae57944b99ac3adee34be66cb6e8` with Google auth published. This candidate is still based on visual correction `005c0a5` above `aaf09bb`; it does not include, replace or modify the auth implementation. Integrate onto current main with the visual correction and this scoped commit, preserving `977c766`; do not replace main with this checkout. Applications pagination is a separate candidate. The only anticipated file overlap is `scripts/test-user-workspace-browser.mjs`, where this branch updates Inbox fixture/selector checks only. No shared shell or `user-workspace.css` changes were made.
