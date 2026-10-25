-- READ-ONLY. Must return objects_match=true before the history insert.
-- Job.recruiterEmailSourceUrl: text, nullable, no default. No extra index.

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
