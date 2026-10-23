# Proof-of-send

Nothing counts as "sent" without proof. `Application.sendStatus` (enum `SendStatus`) is
orthogonal to the pipeline `status` (which keeps its existing values, e.g. `success`, so
dashboards, quotas and PR #83 counting are unaffected):

| sendStatus   | meaning                                                                 |
|--------------|-------------------------------------------------------------------------|
| `not_sent`   | default / legacy rows / dry-runs                                         |
| `submitted`  | proof recorded: `sentProofType` + `sentProofRef` + `sentAt` (DB CHECK)   |
| `needs_user` | attempt may have happened but there is no proof → user must verify       |
| `failed`     | provably not sent (reason in `sendFailureReason`)                        |

Writers (all go through `src/lib/proof-of-send.ts`):

- `completeApplicationSubmission` (worker gates): portal → `success_page_screenshot` (post-submit
  screenshot URL in `canaryLog`) else `ats_submission_receipt`; Resend recruiter email →
  `email_provider_message_id` (the accepted Resend id). No proof → refuses to mark success.
- Mailbox send (`src/lib/mailbox/service.ts`): Gmail → `gmail_message_id` (id returned by
  `users.messages.send`; threadId kept in `MailboxSend.providerThreadId`); Outlook →
  `email_provider_message_id`. Dry-run ids (`dryrun-…`) are rejected as proof.
- `ats_confirmation_email` + `confirmedAt` are set by the inbound mailbox (see inbound-email.md).

`sentProofType` extends the three requested values with `ats_submission_receipt` and
`email_provider_message_id` so that the existing verified channels keep counting as sent.

Gmail sends are capped per user per Europe/Rome day: `GMAIL_DAILY_SEND_CAP` (default 10, `0`
blocks all). Over the cap the approved send is left `approved` (claim released) for the next day.

Note: the CHECK constraint lives only in the SQL migration; `prisma db push` does not create it.
Legacy `status=success` rows keep `sendStatus=not_sent` (no backfill is invented).
