# Per-user inbound email (`<slug>@apply.lavorai.it`)

Every user can get a LavorAI address such as `mario.rossi.3fa9c1@apply.lavorai.it`
(`UserInbox`, created on demand via `POST /api/inbox/address`; `GET` returns it). The random
suffix makes addresses unguessable. When present it is used as the applicant email in ATS
forms (OTP portals Greenhouse/Ashby keep the per-application `reply+<appId>@INBOUND_EMAIL_DOMAIN`
alias because auto-OTP is keyed by application id).

Mail to the address reaches `POST /api/inbound/email` (provider-agnostic; `?provider=resend`
is the default and only implementation). The route:

1. verifies the Svix signature with `RESEND_INBOUND_SECRET` (401 otherwise; 503 if unset);
2. fetches the body from `GET https://api.resend.com/emails/receiving/{email_id}` (Resend
   webhooks carry metadata only) using `RESEND_API_KEY`;
3. stores an `InboundEmail` (deduped on provider + message id), extracts labelled OTP /
   verification codes and https links (verification links flagged);
4. classifies `confirmation | incomplete | interview | rejection | other` with Italian+English
   keyword rules; when `INBOUND_AI_CLASSIFY=true` and an AI key is set, only `other` is sent to
   the AI router (subject + ≤3k chars of body);
5. on `confirmation`, matches the user's applications (last 90 days) by company (mandatory) and
   job title; on a unique match sets `Application.confirmedAt` and, if no proof exists yet,
   `sentProofType=ats_confirmation_email`, `sentProofRef=inbound:<InboundEmail.id>`,
   `sendStatus=submitted` (columns from the proof-of-send migration; if that migration is not
   applied the confirmation is logged and skipped, the mail is still stored).

Nothing is forwarded or sent from this path; bodies, senders and codes are never logged.

## DNS / provider setup (manual)

Use a **dedicated subdomain** (`apply.lavorai.it`) so the root domain's MX (user mailboxes) and
the existing reply domain (`INBOUND_EMAIL_DOMAIN`) are untouched.

1. Resend dashboard → Domains → add `apply.lavorai.it` → enable **Receiving**.
2. At the DNS provider of `lavorai.it` add the records Resend shows, typically:
   - `MX  apply  →  inbound-smtp.<region>.amazonaws.com` (exact host from Resend; EU region for
     EU data residency), priority `10`. It must be the **only** MX on `apply`.
   - SPF/DKIM records Resend lists for the subdomain (needed only if you also send from it).
   - Optional `TXT _dmarc.apply "v=DMARC1; p=none"`.
3. Wait for Resend to show the domain as verified (`dig MX apply.lavorai.it +short`).
4. Resend → Webhooks → Add webhook → URL `https://lavorai.it/api/inbound/email`, event
   `email.received`. Copy its signing secret into Vercel as `RESEND_INBOUND_SECRET`
   (Production + Preview). The existing `/api/webhooks/resend` webhook keeps its own secret.
   Resend delivers `email.received` for every receiving domain to every subscribed endpoint:
   this route ignores recipients that are not a known `UserInbox` (incl. `reply+…` aliases),
   and the legacy route ignores `apply.lavorai.it` because it only routes `reply+` aliases.
5. Set `INBOUND_USER_DOMAIN=apply.lavorai.it` (default) and apply migration
   `20261023130000_user_inbox` (and `20261023120000_proof_of_send` for confirmations).
6. Test: create an address in a test account, send a mail from an external mailbox with subject
   "Thank you for applying to <Company>", check the `InboundEmail` row.

## Env

`RESEND_INBOUND_SECRET`, `RESEND_API_KEY`, `INBOUND_USER_DOMAIN` (optional, default
`apply.lavorai.it`), `INBOUND_AI_CLASSIFY` (optional), `OPENAI_API_KEY`/`ANTHROPIC_API_KEY`
(only for the AI fallback), `INBOUND_ALLOW_UNSIGNED=1` (local development only).
