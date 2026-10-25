-- REVIEWED, UNAPPLIED.
-- Labels every 24/10 EmailLog row acceptance_unknown.
-- Preserves all rows. Does not DELETE. Does not INSERT. Does not send or enqueue mail.
-- Individual rejection evidence is not present for these 37 rows, so none are marked failed.

UPDATE "EmailLog"
SET outcome = 'acceptance_unknown'
WHERE "createdAt" >= TIMESTAMPTZ '2026-10-24 00:00:00+02'
  AND "createdAt" <  TIMESTAMPTZ '2026-10-25 00:00:00+02';
