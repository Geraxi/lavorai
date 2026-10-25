import { applicationsPaused } from "@/lib/application-pause";
import { prisma } from "@/lib/db";

const DEFAULT_DAILY = 95;
const DEFAULT_MONTHLY = 2900;

export const EMAIL_SUCCESS_OUTCOMES = ["accepted", "delivered"] as const;
export const EMAIL_ATTEMPT_OUTCOMES = ["attempted", "failed", "unknown"] as const;

export type EmailLogOutcome =
  | "attempted"
  | "accepted"
  | "delivered"
  | "failed"
  | "unknown"
  | "provider_failed"
  | "unknown_not_accepted";

export type ProviderSendResult = {
  data?: { id?: string | null } | null;
  error?: { name?: string; statusCode?: number | null } | null;
};

export type EmailSendResult = {
  sent: boolean;
  reason: string | null;
  outcome: EmailLogOutcome | null;
  logId?: string;
  providerEmailId?: string;
};

function limits(): { daily: number; monthly: number } {
  const daily = Number(process.env.RESEND_DAILY_LIMIT ?? DEFAULT_DAILY);
  const monthly = Number(process.env.RESEND_MONTHLY_LIMIT ?? DEFAULT_MONTHLY);
  return {
    daily: Number.isFinite(daily) && daily > 0 ? daily : DEFAULT_DAILY,
    monthly: Number.isFinite(monthly) && monthly > 0 ? monthly : DEFAULT_MONTHLY,
  };
}

function dayStart(now = new Date()): Date {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d;
}

function monthStart(now = new Date()): Date {
  const d = new Date(now);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

export const EMAIL_LOG_SUCCESS_WHERE = { outcome: { in: [...EMAIL_SUCCESS_OUTCOMES] } };
const SUCCESS_WHERE = EMAIL_LOG_SUCCESS_WHERE;

export function classifyProviderResult(result: ProviderSendResult | void): {
  outcome: "accepted" | "failed" | "unknown";
  providerEmailId?: string;
  errorName?: string;
  errorCode?: string;
} {
  if (!result) return { outcome: "unknown" };
  if (result.error) {
    return {
      outcome: "failed",
      errorName: result.error.name ?? "provider_error",
      errorCode: result.error.statusCode != null ? String(result.error.statusCode) : undefined,
    };
  }
  const id = result.data?.id?.trim();
  if (id) return { outcome: "accepted", providerEmailId: id };
  return { outcome: "unknown" };
}

export function emailLogAdminLabel(outcome: string | null | undefined): string {
  switch (outcome) {
    case "accepted": return "accettata dal provider";
    case "delivered": return "consegnata";
    case "failed":
    case "provider_failed": return "fallita";
    case "unknown":
    case "unknown_not_accepted": return "esito sconosciuto";
    case "attempted": return "tentata";
    default: return "esito non etichettato";
  }
}

export function attemptBackoffMs(failedOrUnknownCount: number): number {
  if (failedOrUnknownCount <= 0) return 0;
  return Math.min(60, 2 ** Math.min(failedOrUnknownCount, 6)) * 60_000;
}

export type EmailQuotaDb = {
  emailLog: {
    count: typeof prisma.emailLog.count;
    create: typeof prisma.emailLog.create;
    update: typeof prisma.emailLog.update;
    findMany: typeof prisma.emailLog.findMany;
    updateMany: typeof prisma.emailLog.updateMany;
  };
};

export async function canSendEmail(
  db: EmailQuotaDb = prisma,
  now = new Date(),
): Promise<{
  allowed: boolean;
  reason: string | null;
  today: number;
  month: number;
  daily: number;
  monthly: number;
}> {
  const { daily, monthly } = limits();
  const [today, month] = await Promise.all([
    db.emailLog.count({ where: { createdAt: { gte: dayStart(now) }, ...SUCCESS_WHERE } }),
    db.emailLog.count({ where: { createdAt: { gte: monthStart(now) }, ...SUCCESS_WHERE } }),
  ]);
  if (today >= daily) {
    return { allowed: false, reason: `daily limit reached (${today}/${daily})`, today, month, daily, monthly };
  }
  if (month >= monthly) {
    return { allowed: false, reason: `monthly limit reached (${month}/${monthly})`, today, month, daily, monthly };
  }
  return { allowed: true, reason: null, today, month, daily, monthly };
}

export async function hasSuccessfulSendRecently(
  to: string,
  kind: string,
  cooldownHours: number,
  db: EmailQuotaDb = prisma,
  now = new Date(),
): Promise<boolean> {
  const since = new Date(now.getTime() - cooldownHours * 3600_000);
  const recent = await db.emailLog.count({
    where: { to, kind, createdAt: { gte: since }, ...SUCCESS_WHERE },
  });
  return recent > 0;
}

export async function shouldThrottleAttempts(
  to: string,
  kind: string,
  db: EmailQuotaDb = prisma,
  now = new Date(),
): Promise<{ throttled: boolean; waitMs: number }> {
  const since = new Date(now.getTime() - 6 * 3600_000);
  const recent = await db.emailLog.findMany({
    where: { to, kind, createdAt: { gte: since }, outcome: { in: [...EMAIL_ATTEMPT_OUTCOMES] } },
    orderBy: { createdAt: "desc" },
    take: 8,
    select: { createdAt: true },
  });
  if (recent.length === 0) return { throttled: false, waitMs: 0 };
  const waitMs = attemptBackoffMs(recent.length);
  const elapsed = now.getTime() - recent[0].createdAt.getTime();
  return { throttled: elapsed < waitMs, waitMs };
}

export type EmailKind =
  | "release_canary"
  | "email_test"
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
  | "inbox_forward"
  | "inbox_reply"
  | "other";

const PAUSED_KINDS = [
  "cv_ready", "application_sent", "application_manual", "application_needs_answers",
  "application_no_reply_yet", "daily_summary",
];

/** @deprecated Use sendWithinQuota; accepted rows are written only after a provider id. */
export async function recordEmailSent(kind: EmailKind, to: string, db: EmailQuotaDb = prisma): Promise<void> {
  try {
    await db.emailLog.create({ data: { kind, to, outcome: "accepted" } });
  } catch (err) {
    console.warn("[email-quota] log write failed", err);
  }
}

export async function markEmailLogDelivered(providerEmailId: string, db: EmailQuotaDb = prisma): Promise<number> {
  if (!providerEmailId.trim()) return 0;
  const result = await db.emailLog.updateMany({
    where: { providerEmailId, outcome: "accepted" },
    data: { outcome: "delivered" },
  });
  return result.count;
}

export async function sendWithinQuota(
  kind: EmailKind,
  to: string,
  sendFn: () => Promise<ProviderSendResult>,
  opts: { db?: EmailQuotaDb; now?: Date } = {},
): Promise<EmailSendResult> {
  const db = opts.db ?? prisma;
  const now = opts.now ?? new Date();
  if (applicationsPaused() && PAUSED_KINDS.includes(kind)) {
    return { sent: false, reason: "applications_paused", outcome: null };
  }
  const throttle = await shouldThrottleAttempts(to, kind, db, now);
  if (throttle.throttled) {
    return { sent: false, reason: "attempt_throttled", outcome: null };
  }
  const q = await canSendEmail(db, now);
  if (!q.allowed) {
    console.warn(`[email-quota] SKIP ${kind} → ${to} (${q.reason}; today=${q.today}/${q.daily} month=${q.month}/${q.monthly})`);
    return { sent: false, reason: q.reason, outcome: null };
  }
  let logId: string | undefined;
  let crossedProvider = false;
  try {
    const attempted = await db.emailLog.create({
      data: { kind, to, outcome: "attempted" },
    });
    logId = attempted.id;
    crossedProvider = true;
    const raw = await sendFn();
    const classified = classifyProviderResult(raw);
    await db.emailLog.update({
      where: { id: attempted.id },
      data: {
        outcome: classified.outcome,
        providerEmailId: classified.providerEmailId ?? null,
        errorName: classified.errorName ?? null,
        errorCode: classified.errorCode ?? null,
      },
    });
    if (classified.outcome === "accepted") {
      return { sent: true, reason: null, outcome: "accepted", logId, providerEmailId: classified.providerEmailId };
    }
    console.warn(`[email-quota] ${kind} → ${to} ${classified.outcome}${classified.errorName ? ` ${classified.errorName}` : ""}`);
    return { sent: false, reason: classified.outcome === "failed" ? "provider_rejected" : "provider_acceptance_unknown", outcome: classified.outcome, logId };
  } catch (err) {
    if (logId) {
      await db.emailLog.update({
        where: { id: logId },
        data: {
          outcome: crossedProvider ? "unknown" : "failed",
          errorName: err instanceof Error ? err.name : "send_error",
        },
      }).catch(() => {});
    }
    throw err;
  }
}
