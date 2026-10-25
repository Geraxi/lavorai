-- READ-ONLY. Must return objects_match=true before the history insert.

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
