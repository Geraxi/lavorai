/**
 * Per-run caps for the daily onboarding and upgrade nudges sent by
 * /api/cron/nudges (10:00 UTC, once a day, so per-run = per-day).
 *
 * Both share the platform-wide Resend quota (RESEND_DAILY_LIMIT, default 95)
 * with application emails and the consent/questions service nudges. On
 * 15–17 Nov 2026 these two nudges alone sent 73–88 emails within seconds and
 * filled the daily quota.
 *
 *   ONBOARDING_NUDGE_DAILY_CAP  default 50 (unchanged when unset)
 *   UPGRADE_NUDGE_DAILY_CAP     default 100 (unchanged when unset)
 *
 * Unset, empty or invalid values keep the existing defaults. 0 disables that nudge.
 */
type Env = Record<string, string | undefined>;

function parseCap(raw: string | undefined): number | undefined {
  const value = raw?.trim();
  if (!value || !/^\d+$/.test(value)) return undefined;
  const n = Number(value);
  return Number.isSafeInteger(n) ? n : undefined;
}

export function lifecycleNudgeCaps(env: Env = process.env): { onboarding?: number; upgrade?: number } {
  return {
    onboarding: parseCap(env.ONBOARDING_NUDGE_DAILY_CAP),
    upgrade: parseCap(env.UPGRADE_NUDGE_DAILY_CAP),
  };
}
