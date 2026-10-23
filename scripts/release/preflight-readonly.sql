-- Run only against the endpoint confirmed from the production runtime.
-- No payloads, recipients, credentials, or account changes.
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '10s';
SELECT current_timestamp AS observed_at, current_database() AS database_name;
SELECT migration_name, finished_at, rolled_back_at
FROM "_prisma_migrations" ORDER BY started_at DESC LIMIT 12;
SELECT table_name, column_name FROM information_schema.columns
WHERE table_schema = 'public' AND
 ((table_name = 'User' AND column_name IN
 ('demoPreviewJson','demoClaimedAt','checkoutClaimedAt','trialActivationVersion'))
 OR (table_name = 'Application' AND column_name = 'sentNotificationRequiredAt'))
ORDER BY table_name, column_name;
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_name IN
 ('ApplicationSentNotification','EmailOutbox','EmailReservation','EmailDispatchGate','EmailQuotaBaseline')
ORDER BY table_name;
SELECT status, count(*) AS rows, min("createdAt") AS oldest_created,
 max("createdAt") AS newest_created,
 count(*) FILTER (WHERE "startedAt" IS NOT NULL) AS claimed,
 count(*) FILTER (WHERE "completedAt" IS NULL) AS unfinished
FROM "Application" WHERE status IN ('queued','optimizing','applying','submitting') GROUP BY status;
SELECT status, count(*) AS rows, max("updatedAt") AS latest_update
FROM "ApplicationEmailAttempt" WHERE status IN ('sending','unknown','uncertain') GROUP BY status;
SELECT count(*) AS other_open_transactions FROM pg_stat_activity
WHERE datname=current_database() AND pid<>pg_backend_pid() AND xact_start IS NOT NULL;
COMMIT;
