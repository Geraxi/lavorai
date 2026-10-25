/**
 * Hold + cutoff for scheduled/batch USER notifications.
 *
 * Suppresses stale reminder events, not users. Auth emails (verify,
 * password reset, welcome, magic link) are not in this set.
 *
 * Fail-closed: if USER_NOTIFICATIONS_NOT_BEFORE is unset or not ISO-8601
 * with an offset, treat scheduled jobs as held so restoring the sending
 * key cannot replay the outage window.
 */

export type ScheduledUserNotificationKind =
  | "onboarding_nudge"
  | "upgrade_nudge"
  | "weekly_digest"
  | "trial_day_3"
  | "trial_day_6"
  | "trial_ended"
  | "trial_ending"
  | "checkout_recovery"
  | "checkout_feedback";

export const SCHEDULED_USER_NOTIFICATION_KINDS: readonly ScheduledUserNotificationKind[] = [
  "onboarding_nudge",
  "upgrade_nudge",
  "weekly_digest",
  "trial_day_3",
  "trial_day_6",
  "trial_ended",
  "trial_ending",
  "checkout_recovery",
  "checkout_feedback",
];

const SCHEDULED_KIND_SET = new Set<string>(SCHEDULED_USER_NOTIFICATION_KINDS);

/** ISO-8601 instant with timezone offset (Z or ±HH:MM). Date-only or offset-less local times are invalid. */
const ISO_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

type Env = Record<string, string | undefined>;

export type UserNotificationsGate =
  | { held: true; reason: "hold" | "cutoff_unset" }
  | { held: false; cutoff: Date };

let holdLogged = false;

export function resetUserNotificationsHoldLogForTests(): void {
  holdLogged = false;
}

function logHeld(reason: "hold" | "cutoff_unset"): void {
  if (holdLogged) return;
  holdLogged = true;
  console.warn("[user-notifications] user_notifications_held", { reason });
}

export function isScheduledUserNotificationKind(kind: string): kind is ScheduledUserNotificationKind {
  return SCHEDULED_KIND_SET.has(kind);
}

export function parseUserNotificationsCutoff(env: Env = process.env): Date | null {
  const raw = env.USER_NOTIFICATIONS_NOT_BEFORE?.trim() ?? "";
  if (!raw || !ISO_OFFSET.test(raw)) return null;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? new Date(ms) : null;
}

export function userNotificationsHoldFlag(env: Env = process.env): boolean {
  return env.USER_NOTIFICATIONS_HOLD?.trim().toLowerCase() === "true";
}

export function scheduledUserNotificationsHeld(env: Env = process.env): UserNotificationsGate {
  if (userNotificationsHoldFlag(env)) {
    logHeld("hold");
    return { held: true, reason: "hold" };
  }
  const cutoff = parseUserNotificationsCutoff(env);
  if (!cutoff) {
    logHeld("cutoff_unset");
    return { held: true, reason: "cutoff_unset" };
  }
  return { held: false, cutoff };
}

/** True when this reminder's own due/event instant is before the cutoff. */
export function isStaleScheduledReminder(dueAt: Date, cutoff: Date): boolean {
  return dueAt.getTime() < cutoff.getTime();
}

export function romeYmd(instant: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}

/** Rome calendar date of the Monday that starts the digest week containing `now`. */
export function weeklyDigestMondayRome(now: Date = new Date()): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Europe/Rome",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      weekday: "short",
    }).formatToParts(now).map((part) => [part.type, part.value]),
  );
  const dow: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const weekday = dow[parts.weekday ?? ""] ?? 0;
  const back = (weekday + 6) % 7;
  const utc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day));
  return new Date(utc - back * 86_400_000).toISOString().slice(0, 10);
}

/** Digest week is eligible when its Rome Monday date is >= the cutoff's Rome date. */
export function weeklyDigestWeekEligible(now: Date, cutoff: Date): boolean {
  return weeklyDigestMondayRome(now) >= romeYmd(cutoff);
}
