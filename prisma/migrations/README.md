# Delivery/reply migration

`20261013161000_application_delivery_replies` is an additive migration for the
pre-existing PostgreSQL schema. It creates durable delivery attempts/provider
events and adds inbound deduplication/outbox fields. It does not infer or change
historical delivery results, reply counts, consent, or notification history.
Existing replies default to `forwardStatus = skipped` so they are never resent.

The checkout previously had no committed baseline migration. Before a production
release, establish migration history against the independently verified existing
schema and review the generated SQL/diff. A fresh database needs the full baseline;
this incremental migration cannot create the existing business tables by itself.
Do not use `migrate reset` on a populated database. No deployment, production
migration, backfill, or provider configuration is authorized by this local patch.

Synthetic integration tests can generate the complete schema from empty using
`prisma migrate diff` against an explicit localhost-only test database. Migration
validation should separately apply this incremental SQL to the pre-change schema.
