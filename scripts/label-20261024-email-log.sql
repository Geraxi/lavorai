-- REVIEWED, UNAPPLIED. Dry-run by default via scripts/label-reviewed-email-log.ts.
-- Targets the hardcoded 37 reviewed EmailLog ids. Not a createdAt date range.
-- Apply only with: npx tsx scripts/label-reviewed-email-log.ts --apply
-- Preserves all rows. Does not DELETE. Does not INSERT. Does not send or enqueue mail.

UPDATE "EmailLog"
SET outcome = 'acceptance_unknown'
WHERE id IN (
  'reviewed-24-10-email-log-01',
  'reviewed-24-10-email-log-02',
  'reviewed-24-10-email-log-03',
  'reviewed-24-10-email-log-04',
  'reviewed-24-10-email-log-05',
  'reviewed-24-10-email-log-06',
  'reviewed-24-10-email-log-07',
  'reviewed-24-10-email-log-08',
  'reviewed-24-10-email-log-09',
  'reviewed-24-10-email-log-10',
  'reviewed-24-10-email-log-11',
  'reviewed-24-10-email-log-12',
  'reviewed-24-10-email-log-13',
  'reviewed-24-10-email-log-14',
  'reviewed-24-10-email-log-15',
  'reviewed-24-10-email-log-16',
  'reviewed-24-10-email-log-17',
  'reviewed-24-10-email-log-18',
  'reviewed-24-10-email-log-19',
  'reviewed-24-10-email-log-20',
  'reviewed-24-10-email-log-21',
  'reviewed-24-10-email-log-22',
  'reviewed-24-10-email-log-23',
  'reviewed-24-10-email-log-24',
  'reviewed-24-10-email-log-25',
  'reviewed-24-10-email-log-26',
  'reviewed-24-10-email-log-27',
  'reviewed-24-10-email-log-28',
  'reviewed-24-10-email-log-29',
  'reviewed-24-10-email-log-30',
  'reviewed-24-10-email-log-31',
  'reviewed-24-10-email-log-32',
  'reviewed-24-10-email-log-33',
  'reviewed-24-10-email-log-34',
  'reviewed-24-10-email-log-35',
  'reviewed-24-10-email-log-36',
  'reviewed-24-10-email-log-37'
);
