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
