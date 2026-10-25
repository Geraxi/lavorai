# (A) 24/10 Prisma history resolution (EU only)

This document is (A) only: seven `_prisma_migrations` rows from 24/10.
Those rows change no schema. New schema migrations live in (B):
`docs/ops/new-schema-migrations.md`. (A) is not a prerequisite of the
one owned-destination email test. The Vercel build is
`prisma generate && next build` and does not run a Prisma migrate command.

REVIEWED, NOT APPLIED. Every write is pending approval.

The seven 24/10 migrations already have matching objects on the EU database.
`_prisma_migrations` has no history rows for them. This document is the only
procedure for recording those rows. The blanket reconcile SQL script has been
removed. Do not batch-insert. Do not run `prisma migrate deploy` until all
seven are resolved.

**Verified matching on EU at 25/10 14:08 CET** (object-by-object, all seven).

Prisma sort order is lexicographic. `20261024190000_greenhouse_job_form`
comes **before** `20261024190000_recruiter_email_recheck`.

## EU target guard (required before every write)

Visual hostname inspection is not enough. `scripts/ops/assert-eu-target.sh`
is fail-closed. It exits non-zero, and `set -euo pipefail` aborts the
shell, unless all of these hold:

- host parsed from both `DIRECT_URL` and `DATABASE_URL` equals
  `ep-gentle-butterfly-aljrsiuw.c-3.eu-central-1.aws.neon.tech`, and both
  URLs name the same database (`neondb`);
- a live `SELECT current_database(), current_schema(), inet_server_addr()`
  returns `neondb` and schema `public` (the Prisma schema target);
- `_prisma_migrations` has `20261025003000_submission_attempt_evidence`
  and `"Application"` has a non-zero row count;
- the US host `ep-raspy-violet` appears nowhere.

The script prints hostnames only. It never prints URLs or passwords.
The US host is never used.

Load the URLs into the same shell without printing them, then run every
write in that shell:

```bash
set -euo pipefail
printf 'DIRECT_URL: '
read -rs DIRECT_URL
printf '\nDATABASE_URL: '
read -rs DATABASE_URL
printf '\n'
export DIRECT_URL DATABASE_URL
./scripts/ops/assert-eu-target.sh
```

Each `prisma migrate resolve` below repeats the guard in the same
`set -euo pipefail` shell so a failed guard never reaches the write.

## Per-migration procedure

For each name below, in this order:

1. Run the pre-check `SELECT` (read-only). Expected: `mismatch_count = 0`, `objects_match = true`.
2. Pending approval, resolve the history row only, after the guard:
   `./scripts/ops/assert-eu-target.sh` then
   `npx prisma migrate resolve --applied <name>`
3. Run the post-check `SELECT` on `_prisma_migrations`. Expected: one row,
   `checksum` equals the sha256 of that migration's `migration.sql`,
   `rolled_back_at IS NULL`, `applied_steps_count = 1`.
4. Stop if any check fails. Do not continue to the next name.

`prisma migrate deploy` stays prohibited until all seven are resolved.

---

### 1. `20261024160000_recruiter_email_source_url`

**Verification (EU, 25/10 14:08 CET):** `Job.recruiterEmailSourceUrl` is `text`,
nullable, no default. Column exists. `objects_match = true`.

**Pre-check SELECT** (same as `scripts/prisma-history/20261024160000_recruiter_email_source_url.verify.sql`):

```sql
SELECT
  COUNT(*) FILTER (WHERE NOT ok) AS mismatch_count,
  COUNT(*) FILTER (WHERE NOT ok) = 0 AS objects_match
FROM (
  SELECT
    c.column_name = 'recruiterEmailSourceUrl'
    AND c.data_type = 'text'
    AND c.is_nullable = 'YES'
    AND c.column_default IS NULL
    AS ok
  FROM information_schema.columns c
  WHERE c.table_schema = 'public' AND c.table_name = 'Job'
    AND c.column_name = 'recruiterEmailSourceUrl'
  UNION ALL
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'Job' AND column_name = 'recruiterEmailSourceUrl'
  )
) checks;
```

Expected: `mismatch_count = 0`, `objects_match = true`.

```bash
set -euo pipefail
./scripts/ops/assert-eu-target.sh
npx prisma migrate resolve --applied 20261024160000_recruiter_email_source_url
```

**Post-check SELECT:**

```sql
SELECT migration_name, checksum, finished_at, rolled_back_at, applied_steps_count
FROM "_prisma_migrations"
WHERE migration_name = '20261024160000_recruiter_email_source_url';
```

Expected checksum: `ca5eadc68e3f0b87239a8fce87121d15316f9c1dbd1996e9c06cabb6ed2afc81`

---

### 2. `20261024180000_employer_hiring_inbox`

**Verification (EU, 25/10 14:08 CET):** `Job.companyWebsite` is `text`, nullable,
no default. `EmployerHiringInbox` has seven columns (`companyDomain` text not
null; `email`, `sourceUrl`, `evidence` text nullable; `status` text not null;
`checkedAt`, `updatedAt` timestamp not null) and a primary key.
`objects_match = true`.

**Pre-check SELECT** (`scripts/prisma-history/20261024180000_employer_hiring_inbox.verify.sql`):

```sql
SELECT
  COUNT(*) FILTER (WHERE NOT ok) AS mismatch_count,
  COUNT(*) FILTER (WHERE NOT ok) = 0 AS objects_match
FROM (
  SELECT
    c.column_name = 'companyWebsite'
    AND c.data_type = 'text'
    AND c.is_nullable = 'YES'
    AND c.column_default IS NULL
    AS ok
  FROM information_schema.columns c
  WHERE c.table_schema = 'public' AND c.table_name = 'Job' AND c.column_name = 'companyWebsite'
  UNION ALL
  SELECT
    c.column_name IN ('companyDomain', 'email', 'sourceUrl', 'evidence', 'status', 'checkedAt', 'updatedAt')
    AND (
      (c.column_name = 'companyDomain' AND c.data_type = 'text' AND c.is_nullable = 'NO' AND c.column_default IS NULL)
      OR (c.column_name IN ('email', 'sourceUrl', 'evidence') AND c.data_type = 'text' AND c.is_nullable = 'YES')
      OR (c.column_name = 'status' AND c.data_type = 'text' AND c.is_nullable = 'NO')
      OR (c.column_name IN ('checkedAt', 'updatedAt') AND c.data_type = 'timestamp without time zone' AND c.is_nullable = 'NO')
    )
    AS ok
  FROM information_schema.columns c
  WHERE c.table_schema = 'public' AND c.table_name = 'EmployerHiringInbox'
  UNION ALL
  SELECT COUNT(*) = 7
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'EmployerHiringInbox'
  UNION ALL
  SELECT EXISTS (
    SELECT 1 FROM pg_index i
    JOIN pg_class t ON t.oid = i.indrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public' AND t.relname = 'EmployerHiringInbox' AND i.indisprimary
  )
) checks;
```

Expected: `mismatch_count = 0`, `objects_match = true`.

```bash
set -euo pipefail
./scripts/ops/assert-eu-target.sh
npx prisma migrate resolve --applied 20261024180000_employer_hiring_inbox
```

**Post-check SELECT:**

```sql
SELECT migration_name, checksum, finished_at, rolled_back_at, applied_steps_count
FROM "_prisma_migrations"
WHERE migration_name = '20261024180000_employer_hiring_inbox';
```

Expected checksum: `493db68e0b52b7182b3951c0a7f3a498fd5cc14d7b4d635e8eb317af1a9bb6b7`

---

### 3. `20261024190000_greenhouse_job_form`

**Verification (EU, 25/10 14:08 CET):** `GreenhouseJobForm` has seven columns
(`cacheKey` text not null PK; `boardToken`, `jobId`, `status`, `questionsJson`
text not null; `absoluteUrl` text nullable; `checkedAt` timestamp not null),
primary key, and index `GreenhouseJobForm_boardToken_jobId_idx`.
`objects_match = true`.

**Pre-check SELECT** (`scripts/prisma-history/20261024190000_greenhouse_job_form.verify.sql`):

```sql
SELECT
  COUNT(*) FILTER (WHERE NOT ok) AS mismatch_count,
  COUNT(*) FILTER (WHERE NOT ok) = 0 AS objects_match
FROM (
  SELECT
    (
      (c.column_name = 'cacheKey' AND c.data_type = 'text' AND c.is_nullable = 'NO' AND c.column_default IS NULL)
      OR (c.column_name IN ('boardToken', 'jobId', 'status', 'questionsJson') AND c.data_type = 'text' AND c.is_nullable = 'NO')
      OR (c.column_name = 'absoluteUrl' AND c.data_type = 'text' AND c.is_nullable = 'YES')
      OR (c.column_name = 'checkedAt' AND c.data_type = 'timestamp without time zone' AND c.is_nullable = 'NO')
    ) AS ok
  FROM information_schema.columns c
  WHERE c.table_schema = 'public' AND c.table_name = 'GreenhouseJobForm'
  UNION ALL
  SELECT COUNT(*) = 7
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'GreenhouseJobForm'
  UNION ALL
  SELECT EXISTS (
    SELECT 1 FROM pg_index i
    JOIN pg_class t ON t.oid = i.indrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public' AND t.relname = 'GreenhouseJobForm' AND i.indisprimary
  )
  UNION ALL
  SELECT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'GreenhouseJobForm'
      AND indexname = 'GreenhouseJobForm_boardToken_jobId_idx'
  )
) checks;
```

Expected: `mismatch_count = 0`, `objects_match = true`.

```bash
set -euo pipefail
./scripts/ops/assert-eu-target.sh
npx prisma migrate resolve --applied 20261024190000_greenhouse_job_form
```

**Post-check SELECT:**

```sql
SELECT migration_name, checksum, finished_at, rolled_back_at, applied_steps_count
FROM "_prisma_migrations"
WHERE migration_name = '20261024190000_greenhouse_job_form';
```

Expected checksum: `560c6d615df43813ac476eb84286e09e369cb11cdf18b19396f03396d6c523e1`

---

### 4. `20261024190000_recruiter_email_recheck`

**Verification (EU, 25/10 14:08 CET):** `Application.recruiterEmailRecheckedAt`
is `timestamp without time zone`, nullable, no default. Column exists.
`objects_match = true`.

**Pre-check SELECT** (`scripts/prisma-history/20261024190000_recruiter_email_recheck.verify.sql`):

```sql
SELECT
  COUNT(*) FILTER (WHERE NOT ok) AS mismatch_count,
  COUNT(*) FILTER (WHERE NOT ok) = 0 AS objects_match
FROM (
  SELECT
    c.column_name = 'recruiterEmailRecheckedAt'
    AND c.data_type = 'timestamp without time zone'
    AND c.is_nullable = 'YES'
    AND c.column_default IS NULL
    AS ok
  FROM information_schema.columns c
  WHERE c.table_schema = 'public' AND c.table_name = 'Application'
    AND c.column_name = 'recruiterEmailRecheckedAt'
  UNION ALL
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'Application' AND column_name = 'recruiterEmailRecheckedAt'
  )
) checks;
```

Expected: `mismatch_count = 0`, `objects_match = true`.

```bash
set -euo pipefail
./scripts/ops/assert-eu-target.sh
npx prisma migrate resolve --applied 20261024190000_recruiter_email_recheck
```

**Post-check SELECT:**

```sql
SELECT migration_name, checksum, finished_at, rolled_back_at, applied_steps_count
FROM "_prisma_migrations"
WHERE migration_name = '20261024190000_recruiter_email_recheck';
```

Expected checksum: `c2a70492c4abc91d55c0819fff937eeac0acbab5f9abcdbf4dd4ce964e5c2926`

---

### 5. `20261024200000_application_mailbox`

**Verification (EU, 25/10 14:08 CET):** `UserPreferences.mailboxNotifyMode` is
text not null, default contains `priority`. `ApplicationReply.notifyStatus` is
text not null, default contains `pending`. `InboundEmail.mailboxKind` is text
nullable, no default. `InboundEmail.notifyStatus` is text not null, default
contains `pending`. `objects_match = true`.

**Pre-check SELECT** (`scripts/prisma-history/20261024200000_application_mailbox.verify.sql`):

```sql
SELECT
  COUNT(*) FILTER (WHERE NOT ok) AS mismatch_count,
  COUNT(*) FILTER (WHERE NOT ok) = 0 AS objects_match
FROM (
  SELECT
    c.data_type = 'text' AND c.is_nullable = 'NO'
    AND c.column_default IS NOT NULL
    AND c.column_default LIKE '%priority%'
    AS ok
  FROM information_schema.columns c
  WHERE c.table_schema = 'public' AND c.table_name = 'UserPreferences' AND c.column_name = 'mailboxNotifyMode'
  UNION ALL
  SELECT
    c.data_type = 'text' AND c.is_nullable = 'NO'
    AND c.column_default IS NOT NULL
    AND c.column_default LIKE '%pending%'
    AS ok
  FROM information_schema.columns c
  WHERE c.table_schema = 'public' AND c.table_name = 'ApplicationReply' AND c.column_name = 'notifyStatus'
  UNION ALL
  SELECT
    c.data_type = 'text' AND c.is_nullable = 'YES' AND c.column_default IS NULL
    AS ok
  FROM information_schema.columns c
  WHERE c.table_schema = 'public' AND c.table_name = 'InboundEmail' AND c.column_name = 'mailboxKind'
  UNION ALL
  SELECT
    c.data_type = 'text' AND c.is_nullable = 'NO'
    AND c.column_default IS NOT NULL
    AND c.column_default LIKE '%pending%'
    AS ok
  FROM information_schema.columns c
  WHERE c.table_schema = 'public' AND c.table_name = 'InboundEmail' AND c.column_name = 'notifyStatus'
) checks;
```

Expected: `mismatch_count = 0`, `objects_match = true`.

```bash
set -euo pipefail
./scripts/ops/assert-eu-target.sh
npx prisma migrate resolve --applied 20261024200000_application_mailbox
```

**Post-check SELECT:**

```sql
SELECT migration_name, checksum, finished_at, rolled_back_at, applied_steps_count
FROM "_prisma_migrations"
WHERE migration_name = '20261024200000_application_mailbox';
```

Expected checksum: `d15b56154baadc8ed3530f22b67515e49ee0b9001e5ab408b1891d70f188772d`

---

### 6. `20261024210000_job_description_full`

**Verification (EU, 25/10 14:08 CET):** `Job.descriptionFetchedAt` is
`timestamp without time zone`, nullable, no default. Column exists.
`objects_match = true`.

**Pre-check SELECT** (`scripts/prisma-history/20261024210000_job_description_full.verify.sql`):

```sql
SELECT
  COUNT(*) FILTER (WHERE NOT ok) AS mismatch_count,
  COUNT(*) FILTER (WHERE NOT ok) = 0 AS objects_match
FROM (
  SELECT
    c.column_name = 'descriptionFetchedAt'
    AND c.data_type = 'timestamp without time zone'
    AND c.is_nullable = 'YES'
    AND c.column_default IS NULL
    AS ok
  FROM information_schema.columns c
  WHERE c.table_schema = 'public' AND c.table_name = 'Job' AND c.column_name = 'descriptionFetchedAt'
  UNION ALL
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'Job' AND column_name = 'descriptionFetchedAt'
  )
) checks;
```

Expected: `mismatch_count = 0`, `objects_match = true`.

```bash
set -euo pipefail
./scripts/ops/assert-eu-target.sh
npx prisma migrate resolve --applied 20261024210000_job_description_full
```

**Post-check SELECT:**

```sql
SELECT migration_name, checksum, finished_at, rolled_back_at, applied_steps_count
FROM "_prisma_migrations"
WHERE migration_name = '20261024210000_job_description_full';
```

Expected checksum: `63a349ccf816f3d516b0ad8a1e874e225b975dcd7902f6744df90700cb25ce92`

---

### 7. `20261024220000_job_description_fetch_backoff`

**Verification (EU, 25/10 14:08 CET):** `Job.descriptionFetchAttempts` is
integer, nullable, no default. `Job.descriptionFetchRetryAt` is
`timestamp without time zone`, nullable, no default. `objects_match = true`.

**Pre-check SELECT** (`scripts/prisma-history/20261024220000_job_description_fetch_backoff.verify.sql`):

```sql
SELECT
  COUNT(*) FILTER (WHERE NOT ok) AS mismatch_count,
  COUNT(*) FILTER (WHERE NOT ok) = 0 AS objects_match
FROM (
  SELECT
    c.data_type = 'integer' AND c.is_nullable = 'YES' AND c.column_default IS NULL
    AS ok
  FROM information_schema.columns c
  WHERE c.table_schema = 'public' AND c.table_name = 'Job' AND c.column_name = 'descriptionFetchAttempts'
  UNION ALL
  SELECT
    c.data_type = 'timestamp without time zone' AND c.is_nullable = 'YES' AND c.column_default IS NULL
    AS ok
  FROM information_schema.columns c
  WHERE c.table_schema = 'public' AND c.table_name = 'Job' AND c.column_name = 'descriptionFetchRetryAt'
) checks;
```

Expected: `mismatch_count = 0`, `objects_match = true`.

```bash
set -euo pipefail
./scripts/ops/assert-eu-target.sh
npx prisma migrate resolve --applied 20261024220000_job_description_fetch_backoff
```

**Post-check SELECT:**

```sql
SELECT migration_name, checksum, finished_at, rolled_back_at, applied_steps_count
FROM "_prisma_migrations"
WHERE migration_name = '20261024220000_job_description_fetch_backoff';
```

Expected checksum: `8d0050742c4ee96908db1da156217b92eadc2d69cf44207703b274a70820394c`

---

## Final checks (after all seven, still pending approval)

Repeat the executable EU guard in the same shell. Then:

```bash
set -euo pipefail
./scripts/ops/assert-eu-target.sh
npx prisma migrate status
```

Optional schema comparison (does not write):

```bash
npx prisma migrate diff --exit-code --from-url "$DIRECT_URL" --to-migrations prisma/migrations --shadow-database-url "$DIRECT_URL"
```

`migrate deploy` remains prohibited until every history row above exists.
No write in this document is authorized until the owner approves it.
