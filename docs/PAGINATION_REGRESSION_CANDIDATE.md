# Applications pagination regression candidate

Baseline: `9b308d57a373e8662a52237ebdb48f54bd7efd38`. Local branch:
`fix/application-pagination-regression`. No push, deployment, migration, production
configuration change or production data write was performed.

## Identified control and cause

The supplied screenshot (`libfile_1b81c56dfca881919ab69ff495fdaf83`) was retrieved
and visually inspected before investigating the implementation. It shows the
Applications board column pager: `7–9 di 3255`, `3/1085`, previous/next chevrons,
with the range above the buttons. The crop does not show the column heading, so
the specific lane is not asserted.

Each arrow previously rescanned the complete matching history in sequential
100-record evidence batches, including latest-email relation queries, before
loading the current page. The browser also used only SWR `isLoading` to guard
navigation. A cached page can have `isLoading=false` while revalidating, and SWR
can defer that revalidation to an animation frame. Repeated activation could
advance again during that window. The deployed page fails the cached-page guard
assertion in the same local browser harness used for the repaired page.

## Change

- Keep the existing canonical receipt/delivery and lane classifiers.
- Cache only compact, owner-scoped IDs/classifications. Before reuse, compute a
  parameterized database fingerprint of the exact matching evidence, including
  latest email status/provider identity, receipts, status, user outcome, reply
  kind, ordering, insertions/deletions and filter membership. TTL alone never
  establishes freshness. Search matches Prisma's existing wildcard semantics.
- Share the index across pages, lanes and views; coalesce concurrent fills.
  Cold fills use bounded 500-record evidence reads. Page detail reads remain
  bounded to 12 board records, 10 default table records or 3 attention records.
- Bound retention to 16 entries / 100,000 compact rows per database client and
  60 seconds; histories above 50,000 records retain the existing streaming path.
- Lock navigation immediately on a requested URL change, through fetch
  settlement and revalidation. Cancel superseded requests without retrying
  cancellation errors. Keep real errors visible with the existing retry action.
- Preserve keyboard focus and per-column page state; reset only the changed
  column's scroll position.

Authentication, billing/card/trial flows, manual-only cap/cutoff, Inbox replies,
feedback, palette, export ownership and deep-link ownership are unchanged.

## Final measurements (2026-10-16)

Disposable local PostgreSQL 16 on the user's Mac; synthetic rows and indexes;
actual before/after list functions; five samples per case. The delayed scenario
adds 50 ms per Prisma operation, not per SQL statement or network packet. Runs
were sequential, without a concurrent build from this task. Times exclude HTTP,
authentication and browser rendering.

| Records | Added delay | Before median | Cold median | Warm median | SQL queries before / cold / warm |
| --- | --- | --- | --- | --- | --- |
| 723 | 0 ms | 20.7 ms | 14.2 ms | 6.6 ms | 20 / 9 / 5 |
| 723 | 50 ms | 509.5 ms | 237.8 ms | 116.8 ms | 20 / 9 / 5 |
| 3,258 | 0 ms | 95.2 ms | 58.9 ms | 31.3 ms | 70 / 19 / 5 |
| 3,258 | 50 ms | 1,946.1 ms | 593.0 ms | 141.4 ms | 70 / 19 / 5 |

For 3,258 records, evidence batches drop from 33 to 7 cold / 0 warm. Warm
navigation transfers no evidence rows, while the database still computes the
fingerprint. Cold serverless instances cannot reuse another instance's cache.

Authorized read-only production diagnostics on the supplied Frankfurt project
and branch observed 4,290 total Applications. The fingerprint's EXPLAIN ANALYZE
on the largest owner's 3,259 eligible records took 18.295 ms, using the existing
owner/date and email-attempt indexes, with no buffer writes. The diagnostic
included a largest-owner selection subquery. `pg_stat_statements` was absent;
it was not enabled or reset. These observations do not establish production
end-to-end arrow latency or a production before/after result.

## Verification and evidence

- PostgreSQL: all stage pages without duplicates; table/attention pages; filters,
  wildcard/escape parity, rolling date windows, clamping, owner isolation and
  deep links; receipt/status/outcome/latest-email invalidation; job-filter
  changes; deletion; failure recovery; concurrent cache fill. 723 and 3,258 rows.
- Browser: real UI with explicitly synthetic API boundaries; 720 records; React
  Strict Mode; rapid pointer/keyboard activation of cached pages; independent
  columns; filter changes superseding a slow request; deep links; 503/retry;
  deletion/empty pages; CSV; keyboard focus. Italian and English at 1440×900,
  1366×768, 390×844 and 430×932. No external requests or application writes.
- Production build: `npm run build` passed with credentials removed and
  telemetry disabled, using this checkout's own dependency clone.
- Full regression suite (`npm test`), explicit `tsc --noEmit`, and
  `git diff --check`: passed on the final candidate.

Local evidence (gitignored):

- `output/verification/pagination-performance.json` — final samples and counts.
- `output/verification/resume-20261016/` — final PostgreSQL/browser/build/suite logs
  and integration dry-merge results.
- `output/playwright/pagination-final-20261016/` — synthetic browser screenshots
  and `pagination-qa.json`; no screenshots were uploaded.
- `output/verification/prior-attempt/` — preserved earlier logs and timings,
  including the resource-limited attempts. The prior deployed-page failure is
  `output/verification/pagination-browser-before.log`.

Reproduce with `npm run test:application-pagination`,
`npm run test:application-pagination-postgres`,
`npm run test:application-pagination-browser`, `npm test`,
`node node_modules/typescript/bin/tsc --noEmit`, and `npm run build`.
The PostgreSQL script requires Homebrew PostgreSQL 16 and creates/removes only
its own temporary local database cluster on port 55449.

## Integration

GitHub's read-only comparison on 2026-10-16 reported remote `main` identical to
the baseline. Task-10 was inspected read-only at final clean commit
`2706e0a7f1bdce2c8ab40a54daec9657c85b1e3e`. The overlapping `package.json` and shared browser test script
merge cleanly in a three-way dry merge; no files in that checkout were edited.
Its delivery-rule refinements consume fields already included in the fingerprint.
Re-run evidence parity and browser checks on the combined candidate before any
release, especially if those delivery rules change further.
