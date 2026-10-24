/**
 * Per-user daily auto-apply cap. Counts only rows that were actually sent
 * or are currently in flight — never handoffs (needs_answers, CAPTCHA /
 * finish-it-yourself, NOT_SUBMITTED / unconfirmed) or liveness holds.
 * The day is Europe/Rome, not the server's UTC midnight.
 */
import { SKIPPED_ATS_MANUAL_MESSAGE } from "@/lib/ats-skip-hosts";
import { romeDayStart } from "@/lib/mailbox/send-guard";

/** Keep in sync with JOB_LIVENESS_UNKNOWN_HELD_MESSAGE (job-liveness.ts). */
export const QUOTA_LIVENESS_HELD_MESSAGE =
  "Disponibilità dell'annuncio non verificabile: invio sospeso, nuovo controllo più tardi.";

export { romeDayStart };

/** Claimed / sending / still-queued work that occupies a daily slot. */
export const DAILY_CAP_IN_FLIGHT_STATUSES = [
  "queued",
  "optimizing",
  "applying",
  "submitting",
  "answers_claimed",
] as const;

export const DAILY_CAP_SENT_STATUSES = ["success"] as const;

/** ready_to_apply only counts while a send is in flight. */
export const DAILY_CAP_IN_FLIGHT_CONFIRMATION = "SUBMISSION_STARTED";

export const QUOTA_EXCLUDED_MESSAGES = [
  SKIPPED_ATS_MANUAL_MESSAGE,
  QUOTA_LIVENESS_HELD_MESSAGE,
] as const;

const IN_FLIGHT = new Set<string>(DAILY_CAP_IN_FLIGHT_STATUSES);
const SENT = new Set<string>(DAILY_CAP_SENT_STATUSES);
const EXCLUDED_MESSAGES = new Set<string>(QUOTA_EXCLUDED_MESSAGES);

export type DailyCapRow = {
  status: string;
  submittedAt?: Date | string | null;
  submitConfirmation?: string | null;
  createdAt?: Date | string | null;
  errorMessage?: string | null;
};

export function isQuotaExcludedHandoffOrHold(row: DailyCapRow): boolean {
  if (row.submittedAt) return false;
  if (row.errorMessage && EXCLUDED_MESSAGES.has(row.errorMessage)) return true;
  if (row.submitConfirmation === "CAPTCHA") return true;
  if (row.status === "needs_answers") return true;
  if (row.status === "ready_to_apply" && row.submitConfirmation !== DAILY_CAP_IN_FLIGHT_CONFIRMATION) {
    return true;
  }
  return false;
}

/** True when this row occupies a daily-cap slot (ignore createdAt here). */
export function countsTowardDailyCap(row: DailyCapRow): boolean {
  if (isQuotaExcludedHandoffOrHold(row)) return false;
  if (row.submittedAt) return true;
  if (SENT.has(row.status)) return true;
  if (IN_FLIGHT.has(row.status)) return true;
  return row.status === "ready_to_apply" && row.submitConfirmation === DAILY_CAP_IN_FLIGHT_CONFIRMATION;
}

/** Same rule as the daily cap: handoffs and liveness holds never occupy a slot. */
export const countsTowardQuota = countsTowardDailyCap;

/** Prisma fragment: sent / in-flight, minus handoffs and liveness holds. */
export function quotaConsumingFilter() {
  return {
    AND: [
      {
        OR: [
          { submittedAt: { not: null } },
          { status: { in: [...DAILY_CAP_IN_FLIGHT_STATUSES, ...DAILY_CAP_SENT_STATUSES] } },
          { status: "ready_to_apply", submitConfirmation: DAILY_CAP_IN_FLIGHT_CONFIRMATION },
        ],
      },
      { NOT: { errorMessage: { in: [...QUOTA_EXCLUDED_MESSAGES] } } },
      { NOT: { submitConfirmation: "CAPTCHA" } },
    ],
  };
}

/** Prisma `where` for today's cap usage for one user. */
export function dailyCapUsageWhere(userId: string, now = new Date()) {
  return {
    userId,
    createdAt: { gte: romeDayStart(now) },
    ...quotaConsumingFilter(),
  };
}

export function monthlyQuotaUsageWhere(userId: string, since: Date) {
  return {
    userId,
    createdAt: { gte: since },
    ...quotaConsumingFilter(),
  };
}

export function companyCapUsageWhere(userId: string, since: Date) {
  return {
    userId,
    createdAt: { gte: since },
    ...quotaConsumingFilter(),
  };
}

export async function countDailyCapUsage(
  db: { application: { count: (args?: any) => Promise<number> } },
  userId: string,
  now = new Date(),
): Promise<number> {
  return db.application.count({ where: dailyCapUsageWhere(userId, now) });
}

/** How many more sendable rows may be created today. */
export function remainingDailyCap(used: number, limit: number): number {
  return Math.max(0, limit - used);
}
