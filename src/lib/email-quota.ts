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

const DEFAULT_DAILY = 95;
const DEFAULT_MONTHLY = 2900;

const PAUSED_KINDS: readonly EmailKind[] = [
  "cv_ready",
  "application_sent",
  "application_manual",
  "application_needs_answers",
  "application_no_reply_yet",
  "daily_summary",
];

function limits(): { daily: number; monthly: number } {
  const daily = Number(process.env.RESEND_DAILY_LIMIT ?? DEFAULT_DAILY);
  const monthly = Number(process.env.RESEND_MONTHLY_LIMIT ?? DEFAULT_MONTHLY);
  return {
    daily: Number.isFinite(daily) && daily > 0 ? daily : DEFAULT_DAILY,
    monthly: Number.isFinite(monthly) && monthly > 0 ? monthly : DEFAULT_MONTHLY,
  };
}

function dayStart(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function monthStart(): Date {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Ritorna { allowed, reason } — allowed=false se siamo oltre il limite. */
export async function canSendEmail(): Promise<{
  allowed: boolean;
  reason: string | null;
  today: number;
  month: number;
  daily: number;
  monthly: number;
}> {
  const { daily, monthly } = limits();
  const [today, month] = await Promise.all([
    prisma.emailLog.count({ where: { createdAt: { gte: dayStart() } } }),
    prisma.emailLog.count({ where: { createdAt: { gte: monthStart() } } }),
  ]);
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
  | "application_needs_answers"
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

export type ProviderSendAccepted = { accepted: true; providerEmailId: string };
export type ProviderSendRejected = {
  accepted: false;
  reason: "provider_rejected" | "missing_provider_email_id";
  errorName?: string;
  statusCode?: number | null;
  message?: string;
};
export type ProviderSendInspection = ProviderSendAccepted | ProviderSendRejected;

export function redactProviderSecretText(value: string): string {
  return value
    .replace(/re_[A-Za-z0-9]+/g, "re_[redacted]")
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]");
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function readId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const id = value.trim();
  return id || null;
}

/**
 * Single gate for a Resend (or Resend-shaped) send result.
 * A returned error or a missing id is not sent.
 */
export function inspectProviderSendResult(result: unknown): ProviderSendInspection {
  if (typeof result === "string") {
    const id = readId(result);
    return id
      ? { accepted: true, providerEmailId: id }
      : { accepted: false, reason: "missing_provider_email_id" };
  }
  const row = asRecord(result);
  if (!row) return { accepted: false, reason: "missing_provider_email_id" };
  const error = asRecord(row.error);
  if (error) {
    const message = typeof error.message === "string" ? redactProviderSecretText(error.message) : undefined;
    return {
      accepted: false,
      reason: "provider_rejected",
      errorName: typeof error.name === "string" && error.name.trim() ? error.name : "provider_error",
      statusCode: typeof error.statusCode === "number" ? error.statusCode : null,
      message,
    };
  }
  const data = asRecord(row.data);
  const id = readId(data?.id) ?? readId(row.id);
  if (!id) return { accepted: false, reason: "missing_provider_email_id" };
  return { accepted: true, providerEmailId: id };
}

function logRejectedSend(kind: EmailKind, inspection: ProviderSendRejected): void {
  console.warn("[email-quota] not sent", {
    kind,
    reason: inspection.reason,
    errorName: inspection.errorName,
    statusCode: inspection.statusCode ?? null,
    message: inspection.message,
  });
}

/** Marca un'email come effettivamente accettata dal provider per il tracking quota. */
export async function recordEmailSent(
  kind: EmailKind,
  to: string,
  providerEmailId?: string | null,
): Promise<void> {
  const id = providerEmailId?.trim() || null;
  try {
    await prisma.emailLog.create({
      data: id ? { kind, to, providerEmailId: id } : { kind, to },
    });
  } catch (err) {
    if (id) {
      try {
        await prisma.emailLog.create({ data: { kind, to } });
        return;
      } catch (fallback) {
        console.warn("[email-quota] log write failed", fallback);
        return;
      }
    }
    console.warn("[email-quota] log write failed", err);
  }
}

export type SendWithinQuotaResult = {
  sent: boolean;
  reason: string | null;
  providerEmailId?: string;
};

/**
 * Helper unificato: verifica quota, invia, ispeziona il risultato del
 * provider, logga solo se accettato. Un errore Resend o un id mancante
 * non scrive EmailLog e non conta verso cooldown/quota.
 */
export async function sendWithinQuota(
  kind: EmailKind,
  to: string,
  sendFn: () => Promise<unknown>,
): Promise<SendWithinQuotaResult> {
  if (applicationsPaused() && (PAUSED_KINDS as readonly string[]).includes(kind)) {
    return { sent: false, reason: "applications_paused" };
  }
  const q = await canSendEmail();
  if (!q.allowed) {
    console.warn(
      `[email-quota] SKIP ${kind} → ${to} (${q.reason}; today=${q.today}/${q.daily} month=${q.month}/${q.monthly})`,
    );
    return { sent: false, reason: q.reason };
  }
  try {
    const inspection = inspectProviderSendResult(await sendFn());
    if (!inspection.accepted) {
      logRejectedSend(kind, inspection);
      return { sent: false, reason: inspection.reason };
    }
    await recordEmailSent(kind, to, inspection.providerEmailId);
    return { sent: true, reason: null, providerEmailId: inspection.providerEmailId };
  } catch (err) {
    // Non registriamo il log se il send ha lanciato → non conta verso la quota
    throw err;
  }
}
