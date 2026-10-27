# Gmail synchronization repair (local, not deployed)

Base: main 2f743f37984650d96ea4a93c3c1ac05581de6165. PR124 remains separate.
No production cron, OAuth reconnection, grant, send, or production SQL was run.

## Behavior

Google sign-in scopes do not grant Gmail access. Only explicit gmail.readonly,
gmail.modify or mail.google.com grants are eligible. Unknown/missing scopes are
not treated as a verified Gmail connection. Expired access without refresh, or
an invalid_grant refresh response, means reconnection is required for that Gmail
grant. invalid_client is a server configuration problem, not a request for every
owner to reconnect. A generic refresh 400/429/5xx is temporary, not proof of
revocation. The local tests use no real tokens; no actual owner needing
reconnection has been independently identified by this patch.

A 240-second run budget leaves headroom below Vercel's 300-second limit. Each
account receives at most 30 seconds/50 messages per cron pass, ordered by durable
last-attempt time. Suspended/sign-in-only/unusable accounts cause no Google calls
or artificial sleeps. All HTTP calls have a maximum 10-second timeout bounded by
the remaining slice. Database availability/latency remains an external dependency;
the budget does not guarantee completion during a database outage.

One 90-second renewable, fenced lease per Google Account covers cron AND manual
refresh. Checkpoints retain the current bounded page and remaining message IDs;
filtered messages can therefore advance too. Message insertion/projection remains
transactional under (userId, gmailMessageId). Crash after insertion before cursor
advancement safely replays the identity. Only a fully consumed scan advances the
watermark. Invalid provider pagination tokens restart the same window rather than
skipping it. A failed request leaves that message pending. Backoff is five minutes
for temporary failures and one hour for rejected grants/configuration errors;
explicit successful owner reconnection clears only backoff/error, not progress.

Coverage remains the existing INBOX scope, now all pages rather than the first 50.
The initial catch-up has no arbitrary date cutoff; later scans use a one-day
watermark overlap. New arrivals during initial catch-up await its completion.
This is NOT a Gmail history-log mirror: mail archived/deleted before observation,
old mail newly moved into INBOX outside the overlap, or provider search/list churn
is not guaranteed captured. Reported completion means the selected INBOX search
window was consumed, not that every historical message in Gmail was imported.
This limitation is explicit in status responses and must not be described as
proof that no replies were missed. No mail is marked read, deleted, or sent.

Imported content remains untrusted. Existing OTP/forward-loop/noise filtering and
owner-fenced transactional matching remain. Email heuristics never mark an ATS
submission confirmed; this patch does not authenticate recruiter identity.

## Release prerequisites (not authorized here)

1. Review and authorize publication separately from PR124.
2. Confirm the runtime database and migration history; apply only additive
   20261027090000_gmail_sync_progress after review/backup. Do NOT reset production.
   It adds one checkpoint table and FK/index/CHECK, no user/token updates.
3. Deploy compatible code after schema; missing schema yields a safe unavailable
   error, not a silent success. Leave all customer application/notification holds
   and diagnostic-off flags unchanged.
4. Inspect aggregate cron status (complete/partial/degraded/no_connected_mailboxes),
   time, completed/deferred/errors, then owner-authenticated Gmail status where
   needed. Reconnect only confirmed Gmail grants with reconnect_required, with
   the owner's explicit OAuth action. No automatic reconnection or new scopes.
5. Rollback code is possible with the additive table retained, but the old code
   reintroduces first-page-only scans and timeout risk. Never delete imported mail
   or reset checkpoints/leases to simulate success.

## Local checks

- npm run test:gmail-sync: 264 unusable/sign-in accounts, mixed eligibility,
  refresh classification, deadline and fairness (no network).
- npm run test:gmail-sync-postgres: dedicated empty localhost database only;
  full test schema with the checkpoint table replaced by the actual SQL migration,
  CHECK/FK constraints, concurrent claims/sync, stale fencing, pages/resume,
  crash-style replay, request failure, expired cursor, deadline, token refresh,
  rejected refresh/backoff. Fetch is replaced with allowlisted fixtures; all
  Gmail requests must be GET. OAuth POST is simulated only.
- Existing Gmail persistence tests retain rollback, owner isolation, receipt
  truthfulness and forwarding-loop protections.
- New PostgreSQL suite wired into existing Linux CI, not run remotely here.

References: Google Gmail API synchronization and search/filter documentation:
https://developers.google.com/workspace/gmail/api/guides/sync
https://developers.google.com/workspace/gmail/api/guides/filtering
