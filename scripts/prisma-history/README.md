# 24/10 Prisma history — per-migration procedure

REVIEWED, NOT APPLIED. Official procedure for **(A)** only
(seven history rows, no schema change):

`docs/ops/migration-history-resolution-20261024.md`

**(B)** new schema migrations (email-test table, release budget, #105
outcome columns) are separate:

`docs/ops/new-schema-migrations.md`

(A) is not required for the one owned-destination email test.

That (A) document is the only write path for the seven 24/10 history
rows. Each `npx prisma migrate resolve --applied <name>` runs only after
`./scripts/ops/assert-eu-target.sh` in the same `set -euo pipefail`
shell. A blanket reconcile SQL script is forbidden and has been removed.
Do not batch-insert.
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
