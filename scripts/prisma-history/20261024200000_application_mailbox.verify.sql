-- READ-ONLY. Must return objects_match=true before the history insert.

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
