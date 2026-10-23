import { emailLimits, emailUsage } from "@/lib/email-dispatch";
import { emailContext } from "@/lib/email-context";
import { applicationsPaused } from "@/lib/application-pause";
import { prisma } from "@/lib/db";

/**
 * Quota email platform-wide. Resend free tier: 100/giorno, 3000/mese.
 * Lavoriamo a margine (95/2900 di default) per evitare hard-fail.
 * Override via env: RESEND_DAILY_LIMIT, RESEND_MONTHLY_LIMIT.
 *
 * Quando ci avviciniamo/superiamo il limite:
 *  - NON inviamo l'email
 *  - MA la candidatura continua il suo processing (AI, DB, Playwright)
 *  - logghiamo il fatto
 */

/** Ritorna { allowed, reason } — allowed=false se siamo oltre il limite. */
export async function canSendEmail(): Promise<{
  allowed: boolean;
  reason: string | null;
  today: number;
  month: number;
  daily: number;
  monthly: number;
}> {
  const { daily, monthly } = emailLimits();
  const { today, month } = await emailUsage(prisma, new Date());
  if (today >= daily) {
    return {
      allowed: false,
      reason: `daily limit reached (${today}/${daily})`,
      today,
      month,
      daily,
      monthly,
    };
  }
  if (month >= monthly) {
    return {
      allowed: false,
      reason: `monthly limit reached (${month}/${monthly})`,
      today,
      month,
      daily,
      monthly,
    };
  }
  return { allowed: true, reason: null, today, month, daily, monthly };
}

export type EmailKind =
  | "release_canary"
  | "cv_ready"
  | "payment_failed"
  | "application_sent"
  | "application_manual"
  | "application_no_reply_yet"
  | "daily_summary"
  | "signup_verify"
  | "password_reset"
  | "welcome"
  | "magic_link"
  | "onboarding_nudge"
  | "upgrade_nudge"
  | "weekly_digest"
  | "auto_apply_invite"
  | "trial_started"
  | "trial_granted"
  | "trial_ending"
  | "trial_ended"
  | "trial_day_3"
  | "trial_day_6"
  | "checkout_recovery"
  | "checkout_feedback"
  | "founder_alert"
  | "reactivation_blast"
  | "other";

/** Compatibility boundary for one-shot recruiter sends and the existing sent
 * notification outbox. The shared Resend transport reserves quota and logs only
 * validated provider acceptance. This function never retries its callback. */
export async function sendWithinQuota(
  kind: EmailKind,
  to: string,
  sendFn: () => Promise<void>,
): Promise<{ sent: boolean; reason: string | null }> {
  if (applicationsPaused() && ["cv_ready", "application_sent", "application_manual", "application_no_reply_yet", "daily_summary"].includes(kind)) {
    return { sent: false, reason: "applications_paused" };
  }
  await emailContext.run({ kind, to }, sendFn);
  return { sent: true, reason: null };
}
