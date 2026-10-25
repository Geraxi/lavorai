# 24/10 Prisma history — per-migration procedure

REVIEWED, NOT APPLIED. Do not run `prisma migrate deploy` against EU until
each history row below has been inserted **after** its verification query
passes on that database.

The seven migrations already have objects in EU, but `_prisma_migrations`
has no rows for them. A blanket insert is forbidden: a history row may be
written only after that migration's objects are verified to match
(columns, types, nullability, defaults, indexes).

## Procedure (one migration at a time)

1. Run `scripts/prisma-history/<name>.verify.sql` on EU (read-only).
2. Require `objects_match = true` and `mismatch_count = 0`.
3. Only then run `scripts/prisma-history/<name>.insert.sql` (history row only).
4. Repeat for the next name. Do not skip. Do not batch-insert.

Never run a combined insert of all seven. Never run `prisma migrate deploy`
until every listed history row exists.

## Order

1. `20261024160000_recruiter_email_source_url`
2. `20261024180000_employer_hiring_inbox`
3. `20261024190000_recruiter_email_recheck`
4. `20261024190000_greenhouse_job_form`
5. `20261024200000_application_mailbox`
6. `20261024210000_job_description_full`
7. `20261024220000_job_description_fetch_backoff`
