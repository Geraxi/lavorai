-- Remove LinkedIn portal sessions
-- LinkedIn server-side auto-apply has been retired per founder decision.
-- Discovery (Apify) remains; submit happens only on external ATS portals.

DELETE FROM "PortalSession" WHERE portal = 'linkedin';
