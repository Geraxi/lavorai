/** Server-only operational hold. No customer preferences or consent are changed.
 * Apply the same setting to every web/worker deployment and retire old instances.
 * Unset/false preserves normal operation; any other nonempty value fails closed.
 *
 * Application / employer-send paths this flag must stop:
 *   /api/cron/drain-queue          every 5 min (Vercel) — also the GitHub Actions
 *                                  backup every 15 min (`drain-queue.yml` curls
 *                                  https://lavorai.it/api/cron/drain-queue)
 *   /api/cron/auto-apply           0 8,9,12,13,16,17 UTC
 *   /api/cron/nudges               0 10 UTC: job sync still runs; self-heal
 *                                  (incl. skip-list recheck) and auto-apply skip
 *   /api/cron/mailbox-delivery     hourly bounce/DSN reread (no employer send)
 *
 * User-facing notification emails (to our users, not employers) stay allowed:
 *   /api/cron/mailbox-digest       10:15 UTC
 *   nudges / onboarding / trial / daily summary / weekly digest
 *
 * Employer application emails are separately default-off via
 * RECRUITER_EMAIL_FALLBACK_ENABLED (see recruiter-email-fallback.ts).
 */
export function applicationsPaused(): boolean {
  // A configured ordinary validation never opens general producers, even if
  // APPLICATIONS_PAUSED is accidentally changed. Invalid/expired scope stays held.
  if (process.env.ORDINARY_VALIDATION_APPLICATION_ID?.trim()) return true;
  const value = process.env.APPLICATIONS_PAUSED?.trim().toLowerCase();
  return !!value && value !== "false";
}

export function assertApplicationsRunning(): void {
  if (applicationsPaused()) throw new Error("applications_paused");
}
