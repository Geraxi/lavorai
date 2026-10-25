# 24/10 Prisma history — per-migration procedure

REVIEWED, NOT APPLIED. Official procedure:

`docs/ops/migration-history-resolution-20261024.md`

That document is the only write path. It uses `npx prisma migrate resolve --applied <name>` after a per-migration object check on EU. A blanket
reconcile SQL script is forbidden and has been removed. Do not batch-insert.
Never run `prisma migrate deploy` until every listed history row exists.
Every write is pending approval.

The seven 24/10 objects were verified as matching on EU at 25/10 14:08 CET.

Prisma sort order (`20261024190000_greenhouse_job_form` before
`20261024190000_recruiter_email_recheck`):

1. `20261024160000_recruiter_email_source_url`
2. `20261024180000_employer_hiring_inbox`
3. `20261024190000_greenhouse_job_form`
4. `20261024190000_recruiter_email_recheck`
5. `20261024200000_application_mailbox`
6. `20261024210000_job_description_full`
7. `20261024220000_job_description_fetch_backoff`
