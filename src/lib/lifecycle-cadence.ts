/**
 * Lifecycle stages are deliberately pure so the daily cron can be tested
 * without sending email, touching Stripe, or creating a user.
 */
export type TrialLifecycleStage = "day_3" | "day_6" | "ended" | null;

export function trialLifecycleStage(input: {
  now: number;
  createdAt: Date;
  trialEndsAt: Date;
}): TrialLifecycleStage {
  const ageDays = Math.floor((input.now - input.createdAt.getTime()) / 86_400_000);
  const msLeft = input.trialEndsAt.getTime() - input.now;
  const daysLeft = Math.ceil(msLeft / 86_400_000);

  if (msLeft <= 0 && msLeft > -3 * 86_400_000) return "ended";
  if (msLeft > 0 && ageDays >= 5 && daysLeft <= 2) return "day_6";
  if (msLeft > 0 && ageDays >= 3 && daysLeft > 2) return "day_3";
  return null;
}

/** Checkout recovery is intentionally delayed and short-lived. */
export function isCheckoutRecoveryWindow(createdAt: Date, now = Date.now()): boolean {
  const age = now - createdAt.getTime();
  return age >= 2 * 3_600_000 && age <= 72 * 3_600_000;
}

/** Promemoria verifica email: da 24h dopo il signup, non oltre 7 giorni. */
export const VERIFY_REMINDER_MIN_AGE_MS = 24 * 3_600_000;
export const VERIFY_REMINDER_MAX_AGE_MS = 7 * 86_400_000;

export function isVerifyReminderDue(input: {
  now: number;
  createdAt: Date;
  emailVerified: Date | null;
}): boolean {
  if (input.emailVerified) return false;
  const age = input.now - input.createdAt.getTime();
  return age >= VERIFY_REMINDER_MIN_AGE_MS && age <= VERIFY_REMINDER_MAX_AGE_MS;
}

/** True while the dedicated verify reminder still "owns" an unverified user. */
export function isInVerifyReminderWindow(createdAt: Date, now = Date.now()): boolean {
  return now - createdAt.getTime() <= VERIFY_REMINDER_MAX_AGE_MS;
}
